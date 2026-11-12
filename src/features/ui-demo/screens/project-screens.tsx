'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Circle, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Btn, Card, ConfirmDialog, EmptyState, FONT, Field, InlineAlert, LinkBtn, Modal, PageHeading, SearchInput, TextArea, TextInput, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { ProjectFields, ProjectsListView, suggestProjectKey } from '@/components/project-ui/project-views';
import { IssueStatus, IssueTypeIcon, Screen, routes, useCan, useProject } from '../common';
import {
  can,
  createProject,
  deleteProject,
  findUser,
  isDone,
  projectBoards,
  projectIssues,
  projectMembers,
  projectSprints,
  projectTypes,
  sprintMetrics,
  userLabel,
  visibleProjects,
} from '../logic';
import { useDemo } from '../provider';
import type { DemoProject } from '../types';

/** Tạo dự án: key gợi ý từ tên cho tới khi người dùng tự sửa; lỗi giữ nguyên bản nháp. */
export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { exec } = useDemo();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', key: '', description: '', template: 'scrum' as 'scrum' | 'empty' });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const reset = () => {
    setForm({ name: '', key: '', description: '', template: 'scrum' });
    setKeyTouched(false);
    setErrors({});
    setError('');
  };
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Tạo dự án"
      description="Dự án mới chỉ tồn tại trong dữ liệu mẫu của phiên này."
      footer={
        <>
          <Btn variant="subtle" onClick={() => onOpenChange(false)}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" form="create-project-form">
            Tạo dự án
          </Btn>
        </>
      }
    >
      <form
        id="create-project-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const result = exec((s, c) => createProject(s, c, form));
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            setError(result.fieldErrors ? '' : result.message);
            return;
          }
          toast.success(`Đã tạo dự án ${form.key.trim().toUpperCase()}`);
          onOpenChange(false);
          reset();
          if (result.entityId) router.push(routes.project(result.entityId));
        }}
      >
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <ProjectFields draft={form} errors={errors} descriptionLimit={1000} onChange={(field, value) => {
          if (field === 'key') setKeyTouched(true);
          setForm((f) => ({ ...f, [field]: value, ...(field === 'name' && !keyTouched ? { key: suggestProjectKey(value) } : {}) }));
        }} />
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-[#6b778c]">Khởi tạo</legend>
          {(
            [
              ['scrum', 'Mẫu Scrum', 'Gán Story/Task/Bug và tạo một bảng 3 cột theo nhóm trạng thái.'],
              ['empty', 'Dự án rỗng', 'Không có loại công việc hay bảng; tự cấu hình theo danh sách việc cần làm.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className={cn('mb-2 flex cursor-pointer gap-3 rounded-[3px] border-2 p-3', form.template === value ? 'border-[#4c9aff] bg-[#e9f2ff]' : 'border-[#dfe1e6]')}>
              <input type="radio" name="template" value={value} checked={form.template === value} onChange={() => setForm((f) => ({ ...f, template: value }))} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-[#6b778c]">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  );
}

/** Xóa dự án: phải gõ đúng key; mô tả dữ liệu mẫu sẽ bị bỏ để người duyệt hiểu phạm vi. */
export function DeleteProjectDialog({ project, open, onOpenChange, onDeleted }: { project: DemoProject; open: boolean; onOpenChange: (v: boolean) => void; onDeleted?: () => void }) {
  const { state, act } = useDemo();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Xóa dự án ${project.key}?`}
      confirmLabel="Xóa dự án"
      requireText={project.key}
      description={
        <>
          <p>
            Thao tác sẽ bỏ <strong>{projectIssues(state, project.id).length}</strong> công việc, <strong>{projectSprints(state, project.id).length}</strong> sprint, <strong>{projectBoards(state, project.id).length}</strong> bảng và danh sách thành viên của dự án khỏi dữ liệu mẫu. Nhật ký quản trị được giữ lại.
          </p>
        </>
      }
      onConfirm={(typed) => {
        const result = act((s, c) => deleteProject(s, c, project.id, typed), `Đã xóa dự án ${project.key}`);
        if (result.ok) onDeleted?.();
        return result.ok;
      }}
    />
  );
}

export function ProjectsScreen() {
  const { state, me } = useDemo();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DemoProject | null>(null);
  const canCreate = useCan('CREATE_PROJECT');
  const all = visibleProjects(state, me?.id);
  // Adapter fixture chỉ cấp props cho view dùng chung; không thay đổi action nghiệp vụ demo.
  const rows = all.map((p) => ({ id: p.id, name: p.name, key: p.key, description: p.description,
    leaderName: userLabel(state, p.leadId), memberCount: projectMembers(state, p.id).length,
    issueCount: projectIssues(state, p.id).length, activeSprintName: projectSprints(state, p.id).find((s) => s.state === 'ACTIVE')?.name ?? null }));
  return <Screen empty={<EmptyState title="Chưa có dự án" description="Tạo dự án đầu tiên để bắt đầu lập kế hoạch." />}>
    <ProjectsListView projects={rows} onCreate={canCreate ? () => setCreating(true) : undefined} projectHref={(id) => routes.project(id)}
      extraLinks={(p) => <><Link className="text-[#0052cc] hover:underline" href={routes.project(p.id, 'backlog')}>Backlog</Link><Link className="text-[#0052cc] hover:underline" href={routes.project(p.id, 'board')}>Bảng</Link></>}
      renderMenu={(p) => <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Btn size="icon" variant="subtle" aria-label={'Thao tác dự án ' + p.key}><MoreHorizontal /></Btn></DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={FONT}>
          <DropdownMenuItem onSelect={() => router.push(routes.project(p.id))}>Mở dự án</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(routes.project(p.id, 'backlog'))}>Backlog</DropdownMenuItem>
          {can(state, me?.id, 'EDIT_PROJECT', p.id) && <DropdownMenuItem onSelect={() => router.push(routes.project(p.id, 'settings'))}>Cài đặt</DropdownMenuItem>}
          {can(state, me?.id, 'DELETE_PROJECT', p.id) && <><DropdownMenuSeparator /><DropdownMenuItem className="text-[#de350b]" onSelect={() => setDeleting(all.find((item) => item.id === p.id) ?? null)}>Xóa dự án…</DropdownMenuItem></>}
        </DropdownMenuContent></DropdownMenu>} />
    <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    {deleting && <DeleteProjectDialog project={deleting} open onOpenChange={(v) => !v && setDeleting(null)} />}
  </Screen>;
}

/** Tổng quan dự án: mọi số liệu tính từ state đúng projectId của route. */
export function OverviewScreen() {
  const project = useProject();
  const { state, me } = useDemo();
  const issues = projectIssues(state, project.id);
  const done = issues.filter((i) => isDone(state, i));
  const active = projectSprints(state, project.id).find((s) => s.state === 'ACTIVE');
  const metrics = active ? sprintMetrics(state, active.id) : null;
  const mine = issues.filter((i) => i.assigneeId === me?.id && !isDone(state, i)).slice(0, 8);
  const activity = state.auditEvents
    .filter((e) => e.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, 8);
  const checklist = [
    { label: 'Gán loại công việc cho dự án', done: projectTypes(state, project.id).length > 0, href: `${routes.project(project.id, 'settings')}?tab=types` },
    { label: 'Tạo bảng công việc và cột', done: projectBoards(state, project.id).length > 0, href: `${routes.project(project.id, 'settings')}?tab=boards` },
    { label: 'Thêm thành viên', done: projectMembers(state, project.id).length > 1, href: routes.project(project.id, 'members') },
    { label: 'Tạo công việc đầu tiên', done: issues.length > 0, href: routes.project(project.id, 'backlog') },
    { label: 'Tạo sprint', done: projectSprints(state, project.id).length > 0, href: routes.project(project.id, 'backlog') },
  ];
  const setupPending = checklist.some((c) => !c.done);
  const stat = (label: string, value: number | string) => (
    <div className="rounded-[3px] border border-[#dfe1e6] px-4 py-3">
      <p className="text-xs text-[#6b778c]">{label}</p>
      <p className="mt-1 text-2xl font-medium text-[#172b4d]">{value}</p>
    </div>
  );
  return (
    <Screen empty={<EmptyState title="Dự án chưa có dữ liệu" description="Bắt đầu bằng việc tạo công việc trong Backlog." action={<LinkBtn variant="primary" href={routes.project(project.id, 'backlog')}>Mở Backlog</LinkBtn>} />}>
      <PageHeading title={project.name} description={project.description || 'Chưa có mô tả.'} breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name }]} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Công việc', issues.length)}
        {stat('Chưa hoàn thành', issues.length - done.length)}
        {stat('Đã hoàn thành', done.length)}
        {stat('Thành viên', projectMembers(state, project.id).length)}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {setupPending && (
            <Card title="Thiết lập dự án">
              <ul className="space-y-2">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-sm">
                    {c.done ? <CheckCircle2 size={18} className="text-[#00875a]" aria-label="Đã xong" /> : <Circle size={18} className="text-[#a5adba]" aria-label="Chưa xong" />}
                    {c.done ? (
                      <span className="text-[#6b778c] line-through">{c.label}</span>
                    ) : (
                      <Link className="text-[#0052cc] hover:underline" href={c.href}>
                        {c.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Sprint đang diễn ra" action={active ? <Link className="text-[13px] text-[#0052cc] hover:underline" href={routes.project(project.id, 'board')}>Mở bảng</Link> : undefined}>
            {active && metrics ? (
              <div>
                <p className="font-medium">{active.name}</p>
                <p className="text-[13px] text-[#6b778c]">
                  {formatDate(active.startDate)} – {formatDate(active.endDate)} · {active.goal || 'Chưa có mục tiêu'}
                </p>
                <div className="mt-3 flex items-center gap-3 text-[13px]">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ebecf0]" role="progressbar" aria-valuemin={0} aria-valuemax={metrics.totalPoints} aria-valuenow={metrics.donePoints} aria-label="Tiến độ story points">
                    <div className="h-full bg-[#36b37e]" style={{ width: `${metrics.totalPoints ? (metrics.donePoints / metrics.totalPoints) * 100 : 0}%` }} />
                  </div>
                  <span>
                    {metrics.donePoints}/{metrics.totalPoints} điểm · {metrics.doneCount}/{metrics.issueCount} việc
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#6b778c]">
                Chưa có sprint đang diễn ra.{' '}
                <Link className="text-[#0052cc] hover:underline" href={routes.project(project.id, 'backlog')}>
                  Lập kế hoạch trong Backlog
                </Link>
              </p>
            )}
          </Card>
          <Card title="Được giao cho tôi">
            {mine.length ? (
              <ul className="divide-y divide-[#ebecf0]">
                {mine.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2 text-[13px]">
                    <IssueTypeIcon typeId={i.typeId} />
                    <Link href={routes.issue(project.id, i.id, 'overview')} className="shrink-0 text-[#6b778c] hover:underline">
                      {i.key}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <IssueStatus statusId={i.statusId} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6b778c]">Không có công việc chưa xong được giao cho bạn.</p>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Hoạt động gần đây">
            {activity.length ? (
              <ul className="space-y-3">
                {activity.map((e) => (
                  <li key={e.id} className="flex gap-2 text-[13px]">
                    <Avatar name={e.actorId === null ? 'Hệ thống' : (findUser(state, e.actorId)?.fullName ?? '?')} size={24} />
                    <span className="min-w-0">
                      <span className="font-medium">{e.actorId === null ? 'Hệ thống' : userLabel(state, e.actorId)}</span> <span className="text-[#42526e]">{e.detail}</span>
                      <span className="block text-[11px] text-[#97a0af]">{formatDate(e.createdAt, true)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6b778c]">Chưa có hoạt động.</p>
            )}
          </Card>
          <Card title="Lối tắt">
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {(
                [
                  ['backlog', 'Backlog'],
                  ['board', 'Bảng công việc'],
                  ['issues', 'Danh sách công việc'],
                  ['members', 'Thành viên'],
                  ['reports', 'Báo cáo'],
                  ['settings', 'Cài đặt'],
                ] as const
              ).map(([section, label]) => (
                <Link key={section} href={routes.project(project.id, section)} className="rounded-[3px] border border-[#dfe1e6] px-3 py-2 text-[#0052cc] hover:bg-[#f4f5f7]">
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Screen>
  );
}
