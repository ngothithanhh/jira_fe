'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Btn, Field, InlineAlert, Modal, SelectInput, TextArea, TextInput } from '@/components/project-ui/kit';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { connectedRequest } from '../client';
import { priorities } from './contract';
import { initialFilters, type IssueDto, type References, type StatusDto } from './model';
import { useIssueContext, useIssueDetail, useIssueReferences, useIssueSearch, useIssueWrite } from './queries';
import { IssueCollaboration } from '../collaboration/section';

type Draft = { summary: string; description: string; priority: string; storyPoints: number };
const draftOf = (i: IssueDto): Draft => ({ summary: i.summary, description: i.description ?? '', priority: i.priority ?? 'MEDIUM', storyPoints: i.storyPoints });

/** Các trường thông tin issue dùng chung cho tạo/sửa; không cho nhập reporter hay project từ form. */
function IssueFields({ draft, change, disabled, points = false }: { draft: Draft; change: (draft: Draft) => void; disabled: boolean; points?: boolean }) {
  return <>
    <Field label="Tên công việc" required>{(p) => <TextInput {...p} required maxLength={255} value={draft.summary} disabled={disabled} onChange={(e) => change({ ...draft, summary: e.target.value })} />}</Field>
    <Field label="Mô tả" hint="Tối đa 255 ký tự theo API hiện tại.">{(p) => <TextArea {...p} rows={4} maxLength={255} value={draft.description} disabled={disabled} onChange={(e) => change({ ...draft, description: e.target.value })} />}</Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Ưu tiên">{(p) => <SelectInput {...p} value={draft.priority} disabled={disabled} onChange={(e) => change({ ...draft, priority: e.target.value })}>{priorities.map((v) => <option key={v}>{v}</option>)}{!priorities.includes(draft.priority as typeof priorities[number]) && <option>{draft.priority}</option>}</SelectInput>}</Field>
    {points && <Field label="Story points">{(p) => <TextInput {...p} type="number" min={0} max={2147483647} step={1} required value={draft.storyPoints} disabled={disabled} onChange={(e) => change({ ...draft, storyPoints: e.target.value === '' ? NaN : Number(e.target.value) })} />}</Field>}</div>
  </>;
}

/** Tìm cha bằng API cùng project; ID chọn là issues.issue_id, không phải số trong mã SHOP-12. */
function ParentPicker({ projectId, value, onChange, disabled }: { projectId: number; value: string; onChange: (id: string) => void; disabled: boolean }) {
  const [keyword,setKeyword] = useState('');
  const query = useIssueSearch(projectId,{ ...initialFilters,keyword });
  const [selected,setSelected] = useState<IssueDto | undefined>();
  const options = [...(query.data?.items ?? [])];
  if (selected && !options.some((i) => i.issueId === selected.issueId)) options.unshift(selected);
  return <div className="space-y-2"><Field label="Tìm công việc cha" hint="Không bắt buộc. Tìm theo mã hoặc tên trong dự án này.">{(p) => <TextInput {...p} value={keyword} maxLength={200} disabled={disabled} onChange={(e) => setKeyword(e.target.value)} />}</Field>
    {query.isError && <InlineAlert tone="error">{query.error.message}</InlineAlert>}
    <Field label="Công việc cha">{(p) => <SelectInput {...p} value={value} disabled={disabled} onChange={(e) => { onChange(e.target.value); setSelected(options.find((i) => String(i.issueId) === e.target.value)); }}><option value="">Không có</option>{options.map((i) => <option key={i.issueId} value={i.issueId}>{i.issueKey} · {i.summary}</option>)}</SelectInput>}</Field>
  </div>;
}

/** Tạo một issue trong project đã qua gate; reporter/status/mã do backend cấp trong transaction hiện có. */
export function CreateIssue({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const refs = useIssueReferences(projectId);
  const { permitted } = useIssueContext(projectId);
  const write = useIssueWrite(projectId);
  const [draft,setDraft] = useState<Draft>({ summary: '',description: '',priority: 'MEDIUM',storyPoints: 0 });
  const [type,setType] = useState('');
  const [parent,setParent] = useState('');
  const typeId = type || String(refs.data?.types.find((t) => t.isDefault)?.issueTypeId || refs.data?.types[0]?.issueTypeId || '');
  const canCreate = permitted('CREATE_ISSUE') && !!typeId && !!refs.data;
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!canCreate || write.busy) return;
    try { await write.run<IssueDto>('issues',{method:'POST',body:JSON.stringify({projectId,issueTypeId:Number(typeId),summary:draft.summary,description:draft.description,priority:draft.priority,...(parent ? {parentIssueId:Number(parent)} : {})})},'Đã tạo công việc',onClose); }
    catch { /* Giữ nguyên form và lỗi từ write; không tạo lại khi server chưa xác nhận. */ }
  }
  return <Modal open title="Tạo công việc" description="Công việc được lưu vào dự án và xuất hiện trong backlog." onOpenChange={(v) => { if (!v && !write.busy) onClose(); }}
    footer={<><Btn disabled={write.busy} onClick={onClose}>Hủy</Btn><Btn variant="primary" type="submit" form="connected-create-issue" disabled={!canCreate || write.busy}>Tạo công việc</Btn></>}>
    <form id="connected-create-issue" className="space-y-4" onSubmit={submit}>
      {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {refs.isError && <InlineAlert tone="error">{refs.error.message}<Btn onClick={() => void refs.refetch()}>Thử lại</Btn></InlineAlert>}
      {refs.data && !refs.data.types.length && <InlineAlert tone="warning">Dự án chưa có loại công việc. Hãy cấu hình trước khi tạo.</InlineAlert>}
      <Field label="Loại công việc" required>{(p) => <SelectInput {...p} required value={typeId} disabled={write.busy || !canCreate} onChange={(e) => setType(e.target.value)}>{refs.data?.types.map((t) => <option key={t.issueTypeId} value={t.issueTypeId}>{t.issueTypeName}</option>)}</SelectInput>}</Field>
      <IssueFields draft={draft} change={setDraft} disabled={write.busy || !canCreate} />
      <ParentPicker projectId={projectId} value={parent} onChange={setParent} disabled={write.busy || !canCreate} />
    </form>
  </Modal>;
}

/** Panel chỉ hiện dữ liệu thật khi detail/reference đều đọc thành công; 403/404 không dựng form trống giả. */
export function IssuePanel({ projectId, issueId, onClose, readOnly = false }: { projectId: number; issueId: number; onClose: () => void; readOnly?: boolean }) {
  const detail = useIssueDetail(projectId,issueId);
  const refs = useIssueReferences(projectId);
  const {project:gate} = useIssueContext(projectId);
  const [editorBusy,setBusy] = useState(false);
  const [collaborationBusy,setCollaborationBusy] = useState(false);
  const busy=editorBusy||collaborationBusy;
  const error = detail.error || refs.error || gate.error;
  return <Sheet open onOpenChange={(v) => { if (!v && !busy) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-[680px]" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
    <SheetHeader><SheetTitle>{detail.data?.issueKey || 'Chi tiết công việc'}</SheetTitle><SheetDescription>Thông tin công việc trong dự án.</SheetDescription></SheetHeader>
    {error && <div className="mt-5 space-y-3"><InlineAlert tone="error">{error.message} Bản nháp được giữ lại; tải lại dữ liệu trước khi lưu tiếp.</InlineAlert><Btn disabled={busy} onClick={() => { void gate.refetch(); void detail.refetch(); void refs.refetch(); }}>Tải lại dữ liệu</Btn></div>}
    {/* Lỗi refetch không unmount editor: giữ draft và scope completion của DELETE đã được BE xác nhận. */}
    {detail.data && refs.data ? <>
      <IssueEditor key={issueId} projectId={projectId} issue={detail.data} refs={refs.data} onClose={onClose} onBusy={setBusy} readFailed={!!error || readOnly || collaborationBusy} reload={() => { void detail.refetch(); void refs.refetch(); }} />
      {/* Cùng issue đã qua gate; hai vùng ghi khóa lẫn nhau nhưng lỗi refetch vẫn giữ bản nháp. */}
      <IssueCollaboration key={'collaboration-'+issueId} projectId={projectId} issueId={issueId} readFailed={!!error||editorBusy} readOnly={readOnly} onBusy={setCollaborationBusy}/>
    </> : !error && <p role="status" className="py-8 text-sm">Đang tải công việc…</p>}
  </SheetContent></Sheet>;
}

/** Metadata, assign và status là các request riêng; từng nút chỉ báo thành công sau invalidate và kiểm lại actor. */
function IssueEditor({ projectId, issue, refs, onClose, reload, onBusy, readFailed }: { projectId: number; issue: IssueDto; refs: References; onClose: () => void; reload: () => void; onBusy: (busy:boolean) => void; readFailed: boolean }) {
  const { actor,permitted } = useIssueContext(projectId);
  const write = useIssueWrite(projectId);
  const [draft,setDraft] = useState(() => draftOf(issue));
  const [baseline,setBaseline] = useState(() => draftOf(issue));
  const [assignee,setAssignee] = useState(String(issue.assigneeId ?? ''));
  const [assigneeBase,setAssigneeBase] = useState(String(issue.assigneeId ?? ''));
  const received = useRef(issue);
  const [target,setTarget] = useState('');
  const [deleting,setDeleting] = useState<{version:number; key:string} | null>(null);
  const [confirmation,setConfirmation] = useState('');
  const canEdit = permitted('EDIT_ISSUE') && !readFailed;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  // Form sạch nhận bản mới; form đang sửa giữ draft và baseline cũ, không tự biến thay đổi của người khác thành draft để ghi đè.
  useEffect(() => {
    // Chỉ đồng bộ khi nhận snapshot khác, không chép snapshot cũ trở lại sau completion vừa làm form sạch.
    if (received.current === issue) return;
    received.current = issue;
    if (!dirty) { const fresh = draftOf(issue); setDraft(fresh); setBaseline(fresh); }
    if (assignee === assigneeBase) { const fresh = String(issue.assigneeId ?? ''); setAssignee(fresh); setAssigneeBase(fresh); }
  },[issue,dirty,assignee,assigneeBase]);
  useEffect(() => { onBusy(write.busy); },[write.busy,onBusy]);
  const transitions = useQuery({ queryKey:['connected','transitions',actor,projectId,issue.statusId], enabled:canEdit, retry:false,
    queryFn:({signal}) => connectedRequest<StatusDto[]>(`workflows/allowed-transitions?currentStatusId=${issue.statusId}`,{signal}) });
  const destination = target && transitions.data?.some((s) => String(s.statusId) === target) ? target : '';
  // Lỗi được useIssueWrite trình bày; callback không đóng panel hay thay draft khi request thất bại.
  async function save(e: FormEvent) {
    e.preventDefault(); if (!canEdit || !dirty || write.busy) return;
    try { await write.run<IssueDto>(`issues/${issue.issueId}`,{method:'PUT',body:JSON.stringify(draft)},'Đã lưu công việc',(result) => { const fresh=draftOf(result); setDraft(fresh); setBaseline(fresh); }); } catch { /* Giữ draft để sửa/thử lại có chủ ý. */ }
  }
  async function assign() {
    try { await write.run<IssueDto>(`issues/${issue.issueId}/assign${assignee ? `?assigneeId=${assignee}` : ''}`,{method:'PUT'},'Đã cập nhật người phụ trách',(result) => { const fresh=String(result.assigneeId ?? ''); setAssignee(fresh); setAssigneeBase(fresh); }); } catch { /* Giữ lựa chọn khi lỗi. */ }
  }
  async function transition() {
    if (!destination) return;
    try { await write.run(`issues/${issue.issueId}/status?statusId=${destination}`,{method:'PUT'},'Đã đổi trạng thái',() => setTarget('')); } catch { /* Workflow/WIP có thể đổi; tải lại trước khi thử tiếp. */ }
  }
  async function remove() {
    if (!deleting || confirmation !== deleting.key || readFailed || write.busy || !permitted('DELETE_ISSUE')) return;
    try { await write.run(`issues/${issue.issueId}?expectedVersion=${deleting.version}`,{method:'DELETE'},'Đã xóa công việc',onClose); } catch { /* Không thay version đang xác nhận sau409 rồi tự xóa lại. */ }
  }
  return <div className="mt-5 space-y-5">
    <div className="flex justify-end"><Btn disabled={write.busy} onClick={reload}>Tải lại công việc</Btn></div>
    {write.error && <InlineAlert tone="error">{write.error}<Btn disabled={write.busy} onClick={() => { reload(); setDeleting(null); }}>Tải lại</Btn></InlineAlert>}
    {!canEdit && <InlineAlert>Chỉ xem. Bạn không có quyền sửa công việc trong dự án này.</InlineAlert>}
    <form className="space-y-4" onSubmit={save}>
      <IssueFields draft={draft} change={setDraft} points disabled={!canEdit || write.busy} />
      {canEdit && <div className="flex gap-2"><Btn type="submit" variant="primary" disabled={write.busy || !dirty}>Lưu thay đổi</Btn><Btn disabled={write.busy || !dirty} onClick={() => { const fresh=draftOf(issue); setDraft(fresh); setBaseline(fresh); }}>Hủy thay đổi</Btn></div>}
    </form>
    <div className="border-t pt-4 text-sm text-[#6b778c]"><p>Loại: {issue.issueTypeName} · Trạng thái: <strong>{issue.statusName}</strong></p><p>Người báo cáo: {issue.reporterName || 'Không còn tài khoản'}</p><p>Người phụ trách hiện tại: {issue.assigneeName || 'Chưa phân công'}</p>{issue.parentIssueId && <p>Công việc cha: ID {issue.parentIssueId}</p>}</div>
    <Field label="Người phụ trách">{(p) => <SelectInput {...p} value={assignee} disabled={!canEdit || write.busy} onChange={(e) => setAssignee(e.target.value)}><option value="">Chưa phân công</option>{issue.assigneeId && !refs.members.some((m) => m.userId === issue.assigneeId) && <option value={issue.assigneeId}>{issue.assigneeName} (không còn trong nhóm)</option>}{refs.members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.userName}</option>)}</SelectInput>}</Field>
    {canEdit && <Btn disabled={write.busy || assignee === String(issue.assigneeId ?? '')} onClick={() => void assign()}>Lưu phân công</Btn>}
    {canEdit && <div className="space-y-3 border-t pt-4"><Field label="Chuyển trạng thái">{(p) => <SelectInput {...p} value={destination} disabled={write.busy || transitions.isFetching || transitions.isError} onChange={(e) => setTarget(e.target.value)}><option value="">Chọn trạng thái tiếp theo</option>{transitions.data?.map((s) => <option key={s.statusId} value={s.statusId}>{s.statusName}</option>)}</SelectInput>}</Field>
      {transitions.isError && <InlineAlert tone="error">Không đọc được workflow. <Btn onClick={() => void transitions.refetch()}>Thử lại</Btn></InlineAlert>}
      {transitions.data?.length === 0 && <p className="text-xs text-[#6b778c]">Chưa có bước chuyển tiếp trong workflow.</p>}
      <Btn disabled={write.busy || !destination} onClick={() => void transition()}>Đổi trạng thái</Btn>
    </div>}
    {permitted('DELETE_ISSUE') && <div className="border-t pt-4"><Btn variant="danger" disabled={write.busy || readFailed || issue.version === null} onClick={() => { setConfirmation(''); setDeleting({version:issue.version!,key:issue.issueKey}); }}>Xóa công việc</Btn></div>}
    {deleting && <Modal open title={`Xóa ${deleting.key}?`} description="Không thể hoàn tác. Công việc có quan hệ cản xóa sẽ được giữ lại." onOpenChange={(v) => { if (!v && !write.busy) setDeleting(null); }}
      footer={<><Btn disabled={write.busy} onClick={() => setDeleting(null)}>Hủy</Btn><Btn variant="danger" disabled={write.busy || readFailed || !permitted('DELETE_ISSUE') || confirmation !== deleting.key} onClick={() => void remove()}>Xác nhận xóa</Btn></>}>
      {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}<Field label={`Nhập ${deleting.key} để xác nhận`} required>{(p) => <TextInput {...p} value={confirmation} disabled={write.busy} onChange={(e) => setConfirmation(e.target.value)} />}</Field>
    </Modal>}
  </div>;
}
