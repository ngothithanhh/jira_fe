'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Btn, EmptyState, InlineAlert, PageHeading, SelectInput, TabBar } from '@/components/project-ui/kit';
import { ConnectedError } from '../client';
import { useSession } from '../session';
import { useProjectVelocity, useReportProjects, useReportSprints, useSprintBurndown, useSprintSummary, type ReportSprint } from './queries';
import { BurndownPanel, SummaryPanel, VelocityPanel } from './panels';

type Tab = 'summary' | 'burndown' | 'velocity';
type ProjectSelection = { userId: number; projectId: number };
type SprintSelection = ProjectSelection & { sprint: ReportSprint };

const tabs: { value: Tab; label: string }[] = [
  { value: 'summary', label: 'Tổng kết sprint' },
  { value: 'burndown', label: 'Burndown' },
  { value: 'velocity', label: 'Velocity' },
];

function readId(value: string) {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && id <= 2147483647 ? id : null;
}

/** Cập nhật tab/sprint trên cùng route. Đọc URL hiện tại để các lần chọn liên tiếp giữ đủ hai tham số. */
function replaceSelection(key: 'tab' | 'sprintId', value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, '', url);
}

function QueryContent<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <p role="status" className="text-sm text-[#42526e]">Đang tải dữ liệu báo cáo…</p>;
  if (query.isError) {
    const status = query.error instanceof ConnectedError ? query.error.status : undefined;
    const message = status === 403 ? 'Bạn không có quyền xem dữ liệu của dự án này.'
      : status === 404 ? 'Dữ liệu báo cáo không còn tồn tại.' : query.error.message;
    return (
      <div className="space-y-2">
        <InlineAlert tone="error">{message}</InlineAlert>
        <Btn variant="subtle" onClick={() => void query.refetch()}>Tải lại dữ liệu</Btn>
      </div>
    );
  }
  return children(query.data);
}

export function ConnectedReports({ projectId }: { projectId: string }) {
  const session = useSession();
  if (session.switching || !session.data) return null;
  return <Reports key={session.data.user.userId} userId={session.data.user.userId} requestedProjectId={projectId} />;
}

function Reports({ userId, requestedProjectId }: { userId: number; requestedProjectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Tab = rawTab === 'velocity' || rawTab === 'burndown' ? rawTab : 'summary';
  const projectId = readId(requestedProjectId);
  const projects = useReportProjects(userId);

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <PageHeading title="Báo cáo Scrum" breadcrumbs={[{ label: 'Dự án', href: '/app/projects' }, { label: 'Báo cáo Scrum' }]} />
      <QueryContent query={projects}>
        {(items) => {
          const project = items.find((item) => item.projectId === projectId);
          return (
            <>
              {items.length > 0 && (
                <div className="max-w-sm space-y-1">
                  <label htmlFor="report-project" className="text-sm font-medium">Dự án</label>
                  <SelectInput
                    id="report-project"
                    value={project?.projectId ?? ''}
                    onChange={(event) => router.push('/app/projects/' + event.target.value + '/reports?tab=' + tab)}
                  >
                    {!project && <option value="" disabled>Chọn dự án</option>}
                    {items.map((item) => <option key={item.projectId} value={item.projectId}>{item.projectKey} · {item.projectName}</option>)}
                  </SelectInput>
                </div>
              )}
              {!project ? (
                <EmptyState title="Dự án không khả dụng" description="Dự án không tồn tại hoặc tài khoản hiện tại không có quyền xem." />
              ) : (
                <>
                  <TabBar label="Loại báo cáo" value={tab} onChange={(value) => replaceSelection('tab', value)} tabs={tabs} />
                  {tab === 'velocity'
                    ? <ProjectVelocity userId={userId} projectId={project.projectId} />
                    : <SprintReports userId={userId} projectId={project.projectId} tab={tab} requestedSprintId={params.get('sprintId')} />}
                </>
              )}
            </>
          );
        }}
      </QueryContent>
    </section>
  );
}

function SprintReports({ userId, projectId, tab, requestedSprintId }: ProjectSelection & { tab: 'summary' | 'burndown'; requestedSprintId: string | null }) {
  const sprints = useReportSprints(userId, projectId);
  return (
    <QueryContent query={sprints}>
      {(items) => {
        const options = items.filter((item) => item.projectId === projectId && item.state !== 'FUTURE').sort((a, b) =>
          Number(b.state === 'ACTIVE') - Number(a.state === 'ACTIVE')
          || (b.endDate ?? '').localeCompare(a.endDate ?? '')
          || b.sprintId - a.sprintId,
        );
        if (options.length === 0) return <EmptyState title="Chưa có sprint đã bắt đầu" />;
        const sprint = requestedSprintId === null ? options[0] : options.find((item) => item.sprintId === readId(requestedSprintId));
        return (
          <div className="space-y-4">
            <div className="max-w-sm space-y-1">
              <label htmlFor="report-sprint" className="text-sm font-medium">Sprint</label>
              <SelectInput id="report-sprint" value={sprint?.sprintId ?? ''} onChange={(event) => replaceSelection('sprintId', event.target.value)}>
                {!sprint && <option value="" disabled>Chọn sprint</option>}
                {options.map((item) => (
                  <option key={item.sprintId} value={item.sprintId}>
                    {item.sprintName} ({item.state === 'ACTIVE' ? 'đang diễn ra' : 'đã đóng'})
                  </option>
                ))}
              </SelectInput>
            </div>
            {!sprint ? <InlineAlert tone="warning">Sprint trên URL không khả dụng cho dự án này. Vui lòng chọn sprint.</InlineAlert>
              : tab === 'summary' ? <SprintSummary userId={userId} projectId={projectId} sprint={sprint} />
              : <SprintBurndown userId={userId} projectId={projectId} sprint={sprint} />}
          </div>
        );
      }}
    </QueryContent>
  );
}

function SprintSummary({ userId, projectId, sprint }: SprintSelection) {
  const query = useSprintSummary(userId, projectId, sprint.sprintId);
  return <QueryContent query={query}>{(data) => <SummaryPanel sprint={sprint} data={data} />}</QueryContent>;
}

function SprintBurndown({ userId, projectId, sprint }: SprintSelection) {
  const query = useSprintBurndown(userId, projectId, sprint.sprintId);
  return <QueryContent query={query}>{(data) => <BurndownPanel data={data} />}</QueryContent>;
}

function ProjectVelocity({ userId, projectId }: ProjectSelection) {
  const query = useProjectVelocity(userId, projectId);
  return <QueryContent query={query}>{(data) => <VelocityPanel rows={data} />}</QueryContent>;
}
