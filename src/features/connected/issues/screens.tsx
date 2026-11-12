'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ListChecks, Plus, RefreshCw } from 'lucide-react';
import { Btn, EmptyState, InlineAlert, PageHeading, Pagination, SelectInput, TextInput, Avatar, StatusLozenge } from '@/components/project-ui/kit';
import { BacklogView } from '@/features/backlog/components/backlog-view';
import { orderedPlanning } from '@/features/backlog/model';
import type { PlanningActions } from '@/features/backlog/types';
import { projectIdFromRoute } from '../projects/model';
import { useProjectMutationScope } from '../projects/queries';
import { completeConnectedMutation } from '../client';
import { priorities } from './contract';
import { initialFilters, type Filters, type IssueDto } from './model';
import { useIssueContext, useIssueReferences, useIssueSearch, useIssueWrite, usePlanning } from './queries';
import { CreateIssue, IssuePanel } from './panel';

/** Route ID lấy từ projects.project_id; key remount form khi đổi project để không giữ draft/mutation của dự án trước. */
export function ConnectedIssueScreen({ backlog = false }: { backlog?: boolean }) {
  const params = useParams<{projectId:string}>();
  const id = projectIdFromRoute(params.projectId);
  if (id === null) return <InlineAlert tone="error">ID dự án không hợp lệ.</InlineAlert>;
  return backlog ? <PlanningScreen key={id} projectId={id} /> : <IssuesScreen key={id} projectId={id} />;
}

/** Danh sách dùng API search; filter thay đổi reset về trang đầu, xóa trang cuối điều chỉnh theo tổng trang BE. */
function IssuesScreen({projectId}:{projectId:number}) {
  const { permitted,project } = useIssueContext(projectId);
  const [filters,setFilters] = useState<Filters>(initialFilters);
  const [keyword,setKeyword] = useState('');
  const [create,setCreate] = useState(false);
  const [selected,setSelected] = useState<number | null>(null);
  const refs = useIssueReferences(projectId);
  const issues = useIssueSearch(projectId,filters);
  const change = (field:keyof Filters,value:string | number) => setFilters((f) => ({...f,[field]:value,page:0}));
  useEffect(() => { const t = setTimeout(() => setFilters((f) => ({...f,keyword,page:0})),300); return () => clearTimeout(t); },[keyword]);
  useEffect(() => {
    if (issues.data && filters.page > 0 && filters.page >= issues.data.totalPages) setFilters((f) => ({...f,page:Math.max(0,issues.data!.totalPages-1)}));
  },[issues.data,filters.page]);
  const error = refs.error || issues.error;
  return <>
    <PageHeading title="Công việc" description={project.data?.project.projectName} actions={<><Btn onClick={() => { void issues.refetch(); void refs.refetch(); }} disabled={issues.isFetching}><RefreshCw />Tải lại</Btn>{permitted('CREATE_ISSUE') && <Btn variant="primary" onClick={() => setCreate(true)}><Plus />Tạo công việc</Btn>}</>} />
    <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      <TextInput aria-label="Tìm công việc" placeholder="Tìm mã hoặc tên công việc" maxLength={200} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      <SelectInput aria-label="Lọc trạng thái" value={filters.statusId} onChange={(e) => change('statusId',e.target.value)}><option value="">Mọi trạng thái</option>{refs.data?.statuses.map((s) => <option key={s.statusId} value={s.statusId}>{s.statusName}</option>)}</SelectInput>
      <SelectInput aria-label="Lọc loại công việc" value={filters.typeId} onChange={(e) => change('typeId',e.target.value)}><option value="">Mọi loại công việc</option>{refs.data?.types.map((t) => <option key={t.issueTypeId} value={t.issueTypeId}>{t.issueTypeName}</option>)}</SelectInput>
      <SelectInput aria-label="Lọc người phụ trách" value={filters.assignee} onChange={(e) => change('assignee',e.target.value)}><option value="">Mọi người phụ trách</option><option value="unassigned">Chưa phân công</option>{refs.data?.members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.userName}</option>)}</SelectInput>
      <SelectInput aria-label="Lọc ưu tiên" value={filters.priority} onChange={(e) => change('priority',e.target.value)}><option value="">Mọi ưu tiên</option>{priorities.map((p) => <option key={p}>{p}</option>)}</SelectInput>
      <SelectInput aria-label="Sắp xếp công việc" value={`${filters.sort}:${filters.direction}`} onChange={(e) => { const [sort,direction] = e.target.value.split(':'); setFilters((f) => ({...f,sort,direction,page:0})); }}><option value="createdAt:DESC">Mới tạo trước</option><option value="updatedAt:DESC">Mới cập nhật trước</option><option value="issueNumber:ASC">Mã tăng dần</option><option value="summary:ASC">Tên A–Z</option></SelectInput>
    </div>
    {error ? <InlineAlert tone="error">{error.message}<Btn onClick={() => { void refs.refetch(); void issues.refetch(); }}>Thử lại</Btn></InlineAlert>
      : issues.isPending || !refs.data ? <p role="status" className="py-10 text-sm text-[#6b778c]">Đang tải công việc…</p>
      : <>
        {!issues.data.items.length ? <EmptyState icon={<ListChecks />} title="Không có công việc" description="Thử đổi bộ lọc hoặc tạo công việc đầu tiên cho dự án." />
          : <div className="overflow-x-auto rounded-[3px] border border-[#dfe1e6]"><table className="w-full min-w-[780px] text-left text-[13px]"><thead className="border-b bg-[#fafbfc] text-xs text-[#6b778c]"><tr>{['Mã','Tên công việc','Loại','Trạng thái','Người phụ trách','Ưu tiên','Điểm'].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{issues.data.items.map((i) => <tr key={i.issueId} className="border-b last:border-0 hover:bg-[#f4f5f7]"><td className="whitespace-nowrap px-3 py-3"><button className="text-[#0052cc] hover:underline" onClick={() => setSelected(i.issueId)}>{i.issueKey}</button></td><td className="max-w-[380px] px-3 py-3"><button className="text-left hover:text-[#0052cc]" onClick={() => setSelected(i.issueId)}>{i.summary}</button></td><td className="px-3 py-3">{i.issueTypeName}</td><td className="px-3 py-3">{refs.data!.statuses.some((s) => s.statusId === i.statusId) ? <StatusLozenge name={i.statusName} category={refs.data!.statuses.find((s) => s.statusId === i.statusId)!.statusCategory} /> : i.statusName}</td><td className="px-3 py-3"><span className="flex items-center gap-2"><Avatar name={i.assigneeName} />{i.assigneeName || 'Chưa phân công'}</span></td><td className="px-3 py-3">{i.priority || '—'}</td><td className="px-3 py-3">{i.storyPoints}</td></tr>)}</tbody></table></div>}
        <Pagination page={filters.page+1} totalPages={Math.max(1,issues.data.totalPages)} totalItems={issues.data.totalItems} size={filters.size} onPage={(p) => setFilters((f) => ({...f,page:p-1}))} onSize={(s) => change('size',s)} />
      </>}
    {create && <CreateIssue projectId={projectId} onClose={() => setCreate(false)} />}
    {selected !== null && <IssuePanel key={selected} projectId={projectId} issueId={selected} onClose={() => setSelected(null)} />}
  </>;
}

/** Adapter BacklogView giữ giao diện hiện có; tất cả hành động nhận ID thật, không cập nhật fixture hay giả thành công. */
function PlanningScreen({projectId}:{projectId:number}) {
  const {permitted,actor} = useIssueContext(projectId);
  const refs = useIssueReferences(projectId);
  const planning = usePlanning(projectId);
  const write = useIssueWrite(projectId);
  const [selected,setSelected] = useState<number | null>(null);
  const [localError,setLocalError] = useState('');
  const capture = useProjectMutationScope();
  const canSprint = permitted('MANAGE_SPRINT');
  const canEdit = permitted('EDIT_ISSUE');
  const requireRight = (allow:boolean) => { if (!allow) throw new Error('Bạn không có quyền thực hiện.'); };
  const actions: PlanningActions = {
    createIssue: async (d) => { requireRight(permitted('CREATE_ISSUE')); await write.run('issues',{method:'POST',body:JSON.stringify({projectId,issueTypeId:d.typeId,summary:d.title,priority:d.priority})},'Đã tạo công việc'); },
    createSprint: async (d) => { requireRight(canSprint); await write.run('sprints',{method:'POST',body:JSON.stringify({projectId,sprintName:d.name,goal:d.goal,startDate:d.startDate ? `${d.startDate}T00:00:00` : null,endDate:d.endDate ? `${d.endDate}T00:00:00` : null})},'Đã tạo sprint'); },
    moveIssue: async (issueId,from,to) => {
      requireRight(canSprint); if (from === to) return;
      if (from !== null && to !== null) throw new Error('Đưa công việc về backlog trước khi chuyển sang sprint khác.');
      const source = from === null ? planning.data!.backlog : planning.data!.sprints.find((s) => s.id === from)?.issues;
      if (!source?.some((i) => i.id === issueId)) throw new Error('Danh sách đã thay đổi. Hãy tải lại backlog.');
      await write.run(`sprints/${to ?? from}/issues/${issueId}`,{method:to === null ? 'DELETE' : 'POST'},'Đã chuyển công việc');
    },
    reorder: async (group,ids) => { requireRight(group === null ? canEdit || canSprint : canSprint); orderedPlanning(planning.data!,group,ids);
      await write.run(group === null ? `projects/${projectId}/backlog/order` : `sprints/${group}/issues/order`,{method:'PUT',body:JSON.stringify({issueIds:ids})},'Đã lưu thứ tự'); },
    startSprint: async (id) => { requireRight(canSprint); await write.run(`sprints/${id}/start`,{method:'PUT'},'Đã bắt đầu sprint'); },
    completeSprint: async (id,target) => { requireRight(canSprint); await write.run(`sprints/${id}/complete${target ? `?moveToSprintId=${target}` : ''}`,{method:'PUT'},'Đã hoàn tất sprint'); },
    editIssue: async () => { throw new Error('Mở chi tiết công việc để chỉnh sửa.'); },
  };
  const error = refs.error || planning.error;
  if (error && (!planning.data || !refs.data)) return <InlineAlert tone="error">{error.message}<Btn onClick={() => { void refs.refetch(); void planning.refetch(); }}>Thử lại</Btn></InlineAlert>;
  if (!planning.data) return <p role="status" className="py-10 text-sm text-[#6b778c]">Đang tải backlog…</p>;
  // Lỗi cục bộ trước request cũng được hiện; lỗi API đã được useIssueWrite kiểm phiên trước khi báo.
  const safeActions = Object.fromEntries(Object.entries(actions).map(([name,action]) => [name,async (...args: unknown[]) => {
    const current = capture(); setLocalError('');
    try { await (action as (...args: unknown[]) => Promise<void>)(...args); }
    catch (e) {
      // Lỗi kiểm scope trước API cũng phải hiện; kiểm cookie actor để lỗi của phiên cũ không xuất hiện sau đổi tài khoản.
      if (actor && current()) await completeConnectedMutation(actor,current,() => setLocalError(e instanceof Error ? e.message : 'Không thể thực hiện thao tác.'));
      throw e;
    }
  }])) as PlanningActions;
  return <>
    {error && <div className="mb-4"><InlineAlert tone="error">{error.message} Dữ liệu đang hiển thị là lần tải trước. <Btn onClick={() => { void refs.refetch(); void planning.refetch(); }}>Thử lại</Btn></InlineAlert></div>}
    <div className="mb-3 flex justify-end"><Btn disabled={planning.isFetching || write.busy} onClick={() => { void refs.refetch(); void planning.refetch(); }}><RefreshCw />Tải lại</Btn></div>
    {(write.error || localError) && <div className="mb-4"><InlineAlert tone="error">{write.error || localError}</InlineAlert></div>}
    <BacklogView data={planning.data} actions={safeActions} busy={write.busy} writeDisabled={!!error} notify={false} onOpenIssue={setSelected}
      permissions={{create:!error && permitted('CREATE_ISSUE'),edit:!error && canEdit,sprint:!error && canSprint,rank:!error && (canEdit || canSprint)}} />
    {selected !== null && <IssuePanel key={selected} projectId={projectId} issueId={selected} onClose={() => setSelected(null)} />}
  </>;
}
