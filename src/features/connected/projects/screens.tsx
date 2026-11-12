'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Home, MoreHorizontal, Settings2, ListChecks, ListTodo, Columns3, Users, ChartNoAxesCombined } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Btn, Card, FONT, InlineAlert, PageHeading, StateView } from '@/components/project-ui/kit';
import { ProjectFields, ProjectsListView, type ProjectDraft, type ProjectListItem } from '@/components/project-ui/project-views';
import { completeConnectedMutation, connectedMutation, ConnectedError } from '../client';
import { useSession } from '../session';
import { CreateConnectedProject, DeleteConnectedProject } from './dialogs';
import { projectErrors, projectIdFromRoute, projectItem, projectPayload, type ProjectDto } from './model';
import { useConnectedProject, useProjectMutationScope, useProjects, useRefreshProjects } from './queries';

/** Query lỗi giữ nguyên phân biệt 403/404/kết nối; không render dữ liệu dự án mẫu để lấp lỗi. */
function ProjectError({ error, retry }: { error: Error; retry: () => void }) {
  if (error instanceof ConnectedError && error.status === 403) return <StateView kind="forbidden" title="Bạn không có quyền xem dự án này" />;
  if (error instanceof ConnectedError && error.status === 404) return <StateView kind="not-found" title="Không tìm thấy dự án" />;
  return <div className="space-y-3"><InlineAlert tone="error">{error.message}</InlineAlert><Btn onClick={retry}>Thử lại</Btn></div>;
}

/** List dùng đúng component bảng/thẻ của bản đã duyệt; các thao tác ghi do adapter API thực hiện. */
export function ConnectedProjectsList() {
  const session = useSession();
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectListItem | null>(null);
  const router = useRouter();
  const canCreate = session.data?.globalPermissions.includes('CREATE_PROJECT');
  const canDelete = session.data?.globalPermissions.includes('DELETE_PROJECT');
  if (projects.isPending) return <p role="status" className="text-sm text-[#6b778c]">Đang tải dự án…</p>;
  if (projects.isError) return <ProjectError error={projects.error} retry={() => void projects.refetch()} />;
  return <>
    <ProjectsListView projects={projects.data.map(projectItem)} onCreate={canCreate ? () => setCreating(true) : undefined} projectHref={(id) => `/app/projects/${id}/overview`}
      renderMenu={(p) => <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Btn size="icon" variant="subtle" aria-label={`Thao tác dự án ${p.key}`}><MoreHorizontal /></Btn></DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={FONT}><DropdownMenuItem onSelect={() => router.push(`/app/projects/${p.id}/overview`)}>Mở dự án</DropdownMenuItem>
          {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem className="text-[#de350b]" onSelect={() => setDeleting(p)}>Xóa dự án…</DropdownMenuItem></>}
        </DropdownMenuContent></DropdownMenu>} />
    {creating && <CreateConnectedProject open onOpenChange={setCreating} />}
    {deleting && <DeleteConnectedProject project={deleting} onClose={() => setDeleting(null)} />}
  </>;
}

/** Parent của mọi trang project: context và detail lấy đúng URL; dữ liệu thiếu/quyền sai dừng trước children. */
export function ConnectedProjectGate({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const id = projectIdFromRoute(params.projectId);
  const project = useConnectedProject(id);
  if (id === null) return <StateView kind="not-found" title="Không tìm thấy dự án" />;
  if (project.isPending) return <p role="status" className="text-sm text-[#6b778c]">Đang tải dự án…</p>;
  // Lỗi quyền/không tồn tại phải dừng. Lỗi mạng khi đã có dữ liệu giữ cây form để không làm mất draft issue.
  const denied = project.error instanceof ConnectedError && [401,403,404].includes(project.error.status);
  if (project.isError && (!project.data || denied)) return <ProjectError error={project.error} retry={() => void project.refetch()} />;
  return <div key={id}>{project.isError && <div className="mb-4"><ProjectError error={project.error} retry={() => void project.refetch()} /></div>}{children}</div>;
}

/** Sidebar chỉ có link đã nối; dùng cùng cache project/context với page, không đọc fixture hoặc gọi API dư. */
export function ProjectNavigation({ id }: { id: number }) {
  const query = useConnectedProject(id);
  const path = usePathname();
  if (!query.data) return null;
  return <>
    <p className="mt-3 w-full truncate px-3 pb-1 text-xs font-semibold text-[#6b778c]" title={query.data.project.projectName}>{query.data.project.projectName}</p>
    {[{ section: 'overview', label: 'Tổng quan', Icon: Home }, { section: 'issues', label: 'Công việc', Icon: ListChecks }, { section: 'backlog', label: 'Backlog', Icon: ListTodo }, { section: 'board', label: 'Scrum board', Icon: Columns3 }, { section: 'members', label: 'Thành viên', Icon: Users }, { section: 'reports', label: 'Báo cáo Scrum', Icon: ChartNoAxesCombined }, { section: 'settings', label: 'Cài đặt', Icon: Settings2 }].map(({ section, label, Icon }) => {
      const href = `/app/projects/${id}/${section}`;
      return <Link key={section} href={href} aria-current={path === href ? 'page' : undefined} className={`flex items-center gap-2 rounded-[3px] px-3 py-2 text-sm ${path === href ? 'bg-[#e9f2ff] font-medium text-[#0052cc]' : 'hover:bg-[#ebecf0]'}`}><Icon size={18} />{label}</Link>;
    })}
  </>;
}

/** Tổng quan đọc counts và tên thật từ ProjectSummary; không tự tính số hoàn thành hoặc lịch sử chưa được API cấp. */
export function ConnectedProjectOverview() {
  const params = useParams<{ projectId: string }>();
  const { data } = useConnectedProject(projectIdFromRoute(params.projectId));
  if (!data) return null;
  const p = data.project;
  return <div className="space-y-6"><PageHeading title={p.projectName} description={p.description || 'Chưa có mô tả.'} breadcrumbs={[{ label: 'Dự án', href: '/app/projects' }, { label: p.projectKey }]} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Công việc', p.issueCount], ['Thành viên', p.memberCount], ['Sprint', p.sprintCount], ['Sprint đang chạy', p.activeSprintName || 'Chưa có']].map(([label, value]) => <div key={label} className="rounded-[3px] border border-[#dfe1e6] px-4 py-3"><p className="text-xs text-[#6b778c]">{label}</p><p className="mt-1 text-2xl font-medium text-[#172b4d]">{value ?? '—'}</p></div>)}</div>
    <Card title="Thông tin dự án"><dl className="grid grid-cols-[140px_1fr] gap-3 text-sm"><dt className="text-[#6b778c]">Mã dự án</dt><dd>{p.projectKey}</dd><dt className="text-[#6b778c]">Trưởng dự án</dt><dd>{p.leader?.userName || 'Chưa có người phụ trách'}</dd><dt className="text-[#6b778c]">Mô tả</dt><dd className="whitespace-pre-wrap break-words">{p.description || 'Chưa có mô tả.'}</dd></dl></Card>
  </div>;
}

/** Settings nhận project từ query; key gắn form để đổi project không đem bản nháp project trước sang trang mới. */
export function ConnectedProjectSettings() {
  const params = useParams<{ projectId: string }>();
  const { data } = useConnectedProject(projectIdFromRoute(params.projectId));
  return data ? <ProjectSettingsForm key={data.project.projectId} project={data.project} canEdit={data.context.projectPermissions.includes('UPDATE_PROJECT')} canDelete={data.context.globalPermissions.includes('DELETE_PROJECT')} /> : null;
}

/** Form thông tin dùng fields đã duyệt; chỉ tên/mô tả được ghi, lead/key giữ read-only theo API thật. */
function ProjectSettingsForm({ project, canEdit, canDelete }: { project: ProjectDto; canEdit: boolean; canDelete: boolean }) {
  const initial = () => ({ name: project.projectName, key: project.projectKey, description: project.description ?? '' });
  const [draft, setDraft] = useState<ProjectDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshProjects();
  const router = useRouter();
  const { data: session } = useSession();
  const captureScope = useProjectMutationScope();
  const save = useMutation({ mutationFn: (current: () => boolean) => connectedMutation<ProjectDto>(`projects/${project.projectId}`, session!.user.userId, { method: 'PATCH', body: JSON.stringify(projectPayload(draft, false)) }, current), retry: false });
  const dirty = draft.name !== project.projectName || draft.description !== (project.description ?? '');

  /** Chờ server lưu xong mới làm mới tên/list; lỗi giữ draft, không tự gửi lại khi timeout hoặc đổi quyền. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || submitting.current || !dirty) return;
    const invalid = projectErrors(draft, false); setErrors(invalid);
    if (Object.keys(invalid).length) return;
    submitting.current = true; setBusy(true);
    const current = captureScope();
    try { const response = await save.mutateAsync(current); if (!current()) return; await refresh(project.projectId);
      await completeConnectedMutation(session!.user.userId, current, () => setDraft({ name: response.projectName, key: response.projectKey, description: response.description ?? '' })); }
    catch { /* Giữ bản nháp và lỗi mutation để người dùng quyết định thử lại. */ }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="max-w-2xl space-y-6"><PageHeading title="Cài đặt dự án"
    actions={<Link className="text-sm font-medium text-[#0052cc] hover:underline" href={`/app/projects/${project.projectId}/settings/issue-types`}>Loại công việc</Link>}
    breadcrumbs={[{ label: 'Dự án', href: '/app/projects' }, { label: project.projectKey, href: `/app/projects/${project.projectId}/overview` }, { label: 'Thông tin' }]} />
    {!canEdit && <InlineAlert tone="info">Bạn chỉ được xem thông tin dự án.</InlineAlert>}
    <form className="space-y-4" onSubmit={submit}>
      {save.isError && <InlineAlert tone="error">{save.error.message}</InlineAlert>}{save.isSuccess && !dirty && <InlineAlert tone="success">Đã lưu thông tin dự án.</InlineAlert>}
      <ProjectFields draft={draft} errors={errors} keyReadOnly disabled={!canEdit || busy} onChange={(field, value) => setDraft((f) => ({ ...f, [field]: value }))} />
      <p className="text-sm text-[#6b778c]">Trưởng dự án: {project.leader?.userName || 'Chưa có người phụ trách'}</p>
      {canEdit && <div className="flex gap-2"><Btn type="submit" variant="primary" disabled={!dirty || busy}>{busy ? 'Đang lưu…' : 'Lưu'}</Btn><Btn variant="subtle" disabled={!dirty || busy} onClick={() => { setDraft(initial()); setErrors({}); save.reset(); }}>Hủy</Btn></div>}
    </form>
    {canDelete && <Card title="Vùng nguy hiểm"><p className="mb-3 text-sm text-[#42526e]">Chỉ xóa được khi dự án không còn công việc, thành viên, sprint hoặc bảng liên kết.</p><Btn variant="danger" onClick={() => setDeleting(true)}>Xóa dự án</Btn></Card>}
    {deleting && <DeleteConnectedProject project={projectItem(project)} onClose={() => setDeleting(false)} onDeleted={() => router.replace('/app/projects')} />}
  </div>;
}
