'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Link2, MoreHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Btn, ConfirmDialog, FONT, Field, InlineAlert, SelectInput, TabBar, TextArea, TextInput, formatDate } from '@/components/project-ui/kit';
import { IssueStatus, IssueTypeIcon, routes, useIssueParam, useProject } from '../common';
import {
  allowedStatuses,
  can,
  deleteIssue,
  findIssue,
  findStatus,
  openSprintOf,
  PRIORITIES,
  PRIORITY_LABEL,
  projectIssues,
  projectMembers,
  projectTypes,
  updateIssue,
  userLabel,
  wouldCreateCycle,
  type IssuePatch,
} from '../logic';
import { useDemo } from '../provider';
import type { DemoIssue, Priority } from '../types';
import { ActivitySection, AttachmentsSection, CommentsSection } from './issue-collab';

type Draft = {
  title: string;
  description: string;
  statusId: number;
  typeId: number;
  priority: Priority;
  assigneeId: string;
  points: string;
  parentId: string;
};
const toDraft = (i: DemoIssue): Draft => ({
  title: i.title,
  description: i.description,
  statusId: i.statusId,
  typeId: i.typeId,
  priority: i.priority,
  assigneeId: i.assigneeId === null ? '' : String(i.assigneeId),
  points: i.points === null ? '' : String(i.points),
  parentId: i.parentId === null ? '' : String(i.parentId),
});

/**
 * Panel chi tiết dùng chung cho Backlog/Board/Công việc/Hộp thư, mở bằng ?issueId= trên URL.
 * Bản nháp tách khỏi state thật: Hủy khôi phục, đóng hoặc chuyển issue khi còn thay đổi chưa lưu thì hỏi xác nhận.
 */
export function IssuePanel() {
  const { issueId, rawIssueId, close, open } = useIssueParam();
  const project = useProject();
  const { state } = useDemo();
  // shownId là issue đang hiển thị; khác issueId trên URL khi người dùng chuyển issue lúc còn bản nháp.
  const [shownId, setShownId] = useState<number | null>(issueId);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{ kind: 'close' } | { kind: 'switch'; to: number | null } | null>(null);

  useEffect(() => {
    if (issueId === shownId) return;
    if (dirty && shownId !== null) setPending({ kind: 'switch', to: issueId });
    else {
      setShownId(issueId);
      setDirty(false);
    }
  }, [issueId, shownId, dirty]);

  const issue = shownId !== null ? findIssue(state, shownId) : undefined;
  const visible = rawIssueId !== null || shownId !== null;
  const requestClose = () => (dirty ? setPending({ kind: 'close' }) : close());

  return (
    <>
      <DialogPrimitive.Root open={visible} onOpenChange={(v) => !v && requestClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#091e42]/30 lg:bg-transparent" />
          <DialogPrimitive.Content
            style={FONT}
            aria-describedby={undefined}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-[#dfe1e6] bg-white text-[#172b4d] shadow-[-4px_0_16px_rgba(9,30,66,0.15)] focus:outline-none sm:w-[600px] lg:top-14"
          >
            {!issue || issue.projectId !== project.id ? (
              <div className="p-6">
                <div className="mb-4 flex justify-between">
                  <DialogPrimitive.Title className="text-lg font-medium">Không mở được công việc</DialogPrimitive.Title>
                  <DialogPrimitive.Close aria-label="Đóng" className="rounded p-1 hover:bg-[#091e420f]">
                    <X size={18} />
                  </DialogPrimitive.Close>
                </div>
                <InlineAlert tone="warning">Công việc không còn tồn tại hoặc không thuộc dự án {project.key}.</InlineAlert>
              </div>
            ) : (
              <IssueEditor key={issue.id} issue={issue} onDirty={setDirty} onClose={requestClose} onOpenIssue={open} onDeleted={() => { setDirty(false); close(); }} />
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(v) => {
          if (v) return;
          // Hủy chuyển issue: đưa URL về issue đang sửa để không lệch với nội dung panel.
          if (pending?.kind === 'switch' && shownId !== null) open(shownId);
          setPending(null);
        }}
        title="Bỏ thay đổi chưa lưu?"
        description="Bạn có thay đổi chưa lưu trong công việc này. Tiếp tục sẽ bỏ các thay đổi đó."
        confirmLabel="Bỏ thay đổi"
        onConfirm={() => {
          const action = pending;
          setDirty(false);
          setPending(null);
          if (action?.kind === 'close') close();
          else if (action?.kind === 'switch') setShownId(action.to);
          return false;
        }}
      />
    </>
  );
}

function IssueEditor({
  issue,
  onDirty,
  onClose,
  onOpenIssue,
  onDeleted,
}: {
  issue: DemoIssue;
  onDirty: (v: boolean) => void;
  onClose: () => void;
  onOpenIssue: (id: number) => void;
  onDeleted: () => void;
}) {
  const { state, me, exec, act } = useDemo();
  const [base, setBase] = useState(issue);
  const [draft, setDraft] = useState<Draft>(() => toDraft(issue));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState('');
  const [tab, setTab] = useState<'comments' | 'files' | 'activity'>('comments');
  const [deleting, setDeleting] = useState(false);
  const editable = can(state, me?.id, 'EDIT_ISSUE', issue.projectId);
  const canDelete = can(state, me?.id, 'DELETE_ISSUE', issue.projectId);

  const initial = toDraft(base);
  const changed = (Object.keys(initial) as (keyof Draft)[]).filter((k) => initial[k] !== draft[k]);
  const dirty = changed.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  // Issue đổi ở nơi khác (board, persona khác): chưa sửa thì nhận bản mới, đang sửa thì báo xung đột.
  const external = issue.version !== base.version;
  useEffect(() => {
    if (external && !dirty) {
      setBase(issue);
      setDraft(toDraft(issue));
    }
  }, [external, dirty, issue]);

  const statuses = allowedStatuses(state, base.statusId);
  const members = projectMembers(state, issue.projectId);
  const types = projectTypes(state, issue.projectId);
  const parents = useMemo(() => projectIssues(state, issue.projectId).filter((i) => i.id !== issue.id && !wouldCreateCycle(state, issue.id, i.id)), [state, issue]);
  const children = state.issues.filter((i) => i.parentId === issue.id);
  const sprint = openSprintOf(state, issue.id);
  const parent = issue.parentId ? findIssue(state, issue.parentId) : undefined;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function save() {
    const patch: IssuePatch = {};
    for (const key of changed) {
      if (key === 'assigneeId') patch.assigneeId = draft.assigneeId ? Number(draft.assigneeId) : null;
      else if (key === 'parentId') patch.parentId = draft.parentId ? Number(draft.parentId) : null;
      else if (key === 'points') {
        const value = draft.points.trim() === '' ? null : Number(draft.points);
        patch.points = value !== null && Number.isNaN(value) ? -1 : value;
      } else if (key === 'statusId' || key === 'typeId') patch[key] = Number(draft[key]);
      else if (key === 'priority') patch.priority = draft.priority;
      else patch[key] = draft[key];
    }
    const result = exec((s, c) => updateIssue(s, c, issue.id, patch, base.version));
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (result.code === 'CONFLICT') setConflict(result.message);
      else if (!result.fieldErrors) toast.error(result.message);
      return;
    }
    const saved = findIssue(result.state, issue.id)!;
    setBase(saved);
    setDraft(toDraft(saved));
    setErrors({});
    setConflict('');
    toast.success(`Đã lưu ${issue.key}`);
  }

  function reload() {
    setBase(issue);
    setDraft(toDraft(issue));
    setErrors({});
    setConflict('');
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-[#ebecf0] px-5 py-3">
        <IssueTypeIcon typeId={issue.typeId} />
        {parent && (
          <>
            <button className="text-[13px] text-[#6b778c] hover:underline" onClick={() => onOpenIssue(parent.id)}>
              {parent.key}
            </button>
            <span className="text-[#6b778c]">/</span>
          </>
        )}
        <span className="text-[13px] text-[#6b778c]">{issue.key}</span>
        <div className="ml-auto flex items-center gap-1">
          <Btn
            size="icon"
            variant="subtle"
            aria-label="Sao chép liên kết"
            onClick={() => {
              const url = `${window.location.origin}${routes.issue(issue.projectId, issue.id, 'issues')}`;
              navigator.clipboard?.writeText(url).then(
                () => toast.success('Đã sao chép liên kết'),
                () => toast.error('Không sao chép được liên kết'),
              );
            }}
          >
            <Link2 />
          </Btn>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Btn size="icon" variant="subtle" aria-label="Thao tác khác">
                <MoreHorizontal />
              </Btn>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={FONT}>
              <DropdownMenuItem asChild>
                <Link href={routes.issue(issue.projectId, issue.id, 'issues')}>Mở trong danh sách công việc</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={routes.issue(issue.projectId, issue.id, 'board')}>Mở trên bảng</Link>
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-[#de350b]" onSelect={() => setDeleting(true)}>
                    <Trash2 size={14} /> Xóa công việc…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Btn size="icon" variant="subtle" aria-label="Đóng chi tiết" onClick={onClose}>
            <X />
          </Btn>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <DialogPrimitive.Title className="sr-only">
          {issue.key}: {issue.title}
        </DialogPrimitive.Title>
        {conflict && (
          <div className="mb-3">
            <InlineAlert tone="warning">
              {conflict}{' '}
              <button className="font-semibold underline" onClick={reload}>
                Tải lại bản mới nhất
              </button>
            </InlineAlert>
          </div>
        )}
        {external && dirty && !conflict && (
          <div className="mb-3">
            <InlineAlert tone="warning">
              Công việc vừa được thay đổi ở nơi khác.{' '}
              <button className="font-semibold underline" onClick={reload}>
                Tải lại và bỏ bản nháp
              </button>
            </InlineAlert>
          </div>
        )}
        {!editable && (
          <div className="mb-3">
            <InlineAlert tone="info">Vai trò hiện tại chỉ được xem công việc này; các trường đều chỉ đọc.</InlineAlert>
          </div>
        )}
        <Field label="Tiêu đề" required error={errors.title}>
          {(p) => <TextInput {...p} value={draft.title} onChange={(e) => set({ title: e.target.value })} disabled={!editable} maxLength={255} className="h-10 text-[18px] font-medium" />}
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="issue-status">
            Trạng thái
          </label>
          <SelectInput
            id="issue-status"
            value={draft.statusId}
            onChange={(e) => set({ statusId: Number(e.target.value) })}
            disabled={!editable}
            aria-invalid={!!errors.statusId}
            className="w-auto min-w-[180px] font-semibold"
          >
            {state.statuses.map((st) => (
              <option key={st.id} value={st.id} disabled={!statuses.some((x) => x.id === st.id)}>
                {st.name}
                {!statuses.some((x) => x.id === st.id) ? ' (không có chuyển hợp lệ)' : ''}
              </option>
            ))}
          </SelectInput>
          <IssueStatus statusId={base.statusId} />
        </div>
        {errors.statusId && <p className="mt-1 text-xs text-[#de350b]">{errors.statusId}</p>}
        <p className="mt-1 text-[11px] text-[#6b778c]">
          Chuyển hợp lệ từ “{findStatus(state, base.statusId)?.name}”: {statuses.filter((s) => s.id !== base.statusId).map((s) => s.name).join(', ') || 'không có'}
        </p>

        <div className="mt-5">
          <Field label="Mô tả" error={errors.description}>
            {(p) => <TextArea {...p} rows={6} value={draft.description} onChange={(e) => set({ description: e.target.value })} disabled={!editable} placeholder="Thêm mô tả…" />}
          </Field>
        </div>

        <section aria-label="Thông tin" className="mt-5 rounded-[3px] border border-[#dfe1e6]">
          <h3 className="border-b border-[#ebecf0] px-3 py-2 text-xs font-semibold text-[#6b778c]">Thông tin</h3>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <Field label="Người phụ trách" error={errors.assigneeId}>
              {(p) => (
                <SelectInput {...p} value={draft.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} disabled={!editable}>
                  <option value="">Chưa phân công</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {userLabel(state, m.userId)}
                    </option>
                  ))}
                  {base.assigneeId !== null && !members.some((m) => m.userId === base.assigneeId) && (
                    <option value={base.assigneeId}>{userLabel(state, base.assigneeId)} (không còn trong dự án)</option>
                  )}
                </SelectInput>
              )}
            </Field>
            <Field label="Loại công việc" error={errors.typeId}>
              {(p) => (
                <SelectInput {...p} value={draft.typeId} onChange={(e) => set({ typeId: Number(e.target.value) })} disabled={!editable}>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Ưu tiên" error={errors.priority}>
              {(p) => (
                <SelectInput {...p} value={draft.priority} onChange={(e) => set({ priority: e.target.value as Priority })} disabled={!editable}>
                  {PRIORITIES.map((v) => (
                    <option key={v} value={v}>
                      {PRIORITY_LABEL[v]}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Story points" error={errors.points} hint="Để trống là chưa ước lượng.">
              {(p) => <TextInput {...p} inputMode="numeric" value={draft.points} onChange={(e) => set({ points: e.target.value })} disabled={!editable} />}
            </Field>
            <Field label="Công việc cha" error={errors.parentId}>
              {(p) => (
                <SelectInput {...p} value={draft.parentId} onChange={(e) => set({ parentId: e.target.value })} disabled={!editable}>
                  <option value="">Không có</option>
                  {parents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.key} · {i.title.slice(0, 50)}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#6b778c]">Sprint</p>
              <p className="flex h-9 items-center text-sm">{sprint ? sprint.name : 'Product backlog'}</p>
              <p className="text-[11px] text-[#6b778c]">Đổi sprint bằng kéo thả hoặc menu trong Backlog.</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#6b778c]">Người báo cáo</p>
              <p className="text-sm">{userLabel(state, issue.reporterId, 'Không rõ')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#6b778c]">Thời gian</p>
              <p className="text-[13px] text-[#42526e]">
                Tạo {formatDate(issue.createdAt, true)}
                <br />
                Cập nhật {formatDate(issue.updatedAt, true)}
              </p>
            </div>
          </div>
        </section>

        {children.length > 0 && (
          <section className="mt-5">
            <h3 className="mb-2 text-xs font-semibold text-[#6b778c]">Việc con ({children.length})</h3>
            <ul className="divide-y divide-[#ebecf0] rounded-[3px] border border-[#dfe1e6]">
              {children.map((c) => (
                <li key={c.id}>
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#f4f5f7]" onClick={() => onOpenIssue(c.id)}>
                    <IssueTypeIcon typeId={c.typeId} />
                    <span className="text-[#6b778c]">{c.key}</span>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <IssueStatus statusId={c.statusId} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6">
          <TabBar
            label="Cộng tác"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'comments', label: `Bình luận (${state.comments.filter((c) => c.issueId === issue.id).length})` },
              { value: 'files', label: `Tệp đính kèm (${state.attachments.filter((a) => a.issueId === issue.id).length})` },
              { value: 'activity', label: 'Lịch sử' },
            ]}
          />
          {tab === 'comments' ? <CommentsSection issue={issue} /> : tab === 'files' ? <AttachmentsSection issue={issue} /> : <ActivitySection issue={issue} />}
        </div>
      </div>
      {editable && dirty && (
        <div className="flex items-center justify-end gap-2 border-t border-[#ebecf0] bg-white px-5 py-3">
          <span className="mr-auto text-xs text-[#6b778c]">{changed.length} trường đã thay đổi</span>
          <Btn variant="subtle" onClick={reload}>
            Hủy
          </Btn>
          <Btn variant="primary" onClick={save}>
            Lưu thay đổi
          </Btn>
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Xóa ${issue.key}?`}
        requireText={issue.key}
        confirmLabel="Xóa công việc"
        description={
          <>
            <p>Công việc, bình luận và liên kết sprint/bảng của nó sẽ bị xóa khỏi dữ liệu mẫu. Mã {issue.key} không được cấp lại.</p>
            {(children.length > 0 || state.attachments.some((a) => a.issueId === issue.id)) && (
              <div className="mt-2">
                <InlineAlert tone="warning">Còn việc con hoặc tệp đính kèm: cần gỡ liên kết cha của việc con và xóa tệp trước, thao tác xóa sẽ bị chặn.</InlineAlert>
              </div>
            )}
          </>
        }
        onConfirm={() => {
          const result = act((s, c) => deleteIssue(s, c, issue.id, issue.version), `Đã xóa ${issue.key}`);
          if (result.ok) onDeleted();
          return result.ok;
        }}
      />
    </>
  );
}
