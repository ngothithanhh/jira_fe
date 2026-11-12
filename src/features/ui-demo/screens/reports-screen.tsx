'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, EmptyState, InlineAlert, PageHeading, SelectInput, TabBar, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { IssueStatus, IssueTypeIcon, Screen, routes, useIssueParam, useProject } from '../common';
import { findIssue, isDone, projectSprints, snapshotOf, sprintIssueList, sprintMetrics, velocity } from '../logic';
import { useDemo } from '../provider';
import { BurndownChart, Legend, VelocityChart } from './charts';
import type { DemoIssue } from '../types';

type Tab = 'summary' | 'burndown' | 'velocity';

/**
 * Báo cáo Scrum: số "hiện tại" tính từ issue, số "snapshot" chỉ đọc từ bản chụp lúc bắt đầu/hoàn tất.
 * Sprint cũ thiếu lịch sử hiển thị giải thích thay vì vẽ 0 hay đường bịa.
 */
export function ReportsScreen() {
  const project = useProject();
  const { state } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sprints = projectSprints(state, project.id)
    .filter((s) => s.state !== 'FUTURE')
    .sort((a, b) => (a.state === 'ACTIVE' ? -1 : b.state === 'ACTIVE' ? 1 : (b.completedAt ?? '').localeCompare(a.completedAt ?? '')));
  const rawTab = params.get('tab');
  const tab: Tab = rawTab === 'burndown' || rawTab === 'velocity' ? rawTab : 'summary';
  const sprint = sprints.find((s) => s.id === Number(params.get('sprintId'))) ?? sprints[0];
  const setQuery = (patch: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <Screen empty={<EmptyState title="Chưa có dữ liệu báo cáo" />}>
      <PageHeading title="Báo cáo" breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Báo cáo' }]} />
      <TabBar
        label="Loại báo cáo"
        value={tab}
        onChange={(t) => setQuery({ tab: t })}
        tabs={[
          { value: 'summary', label: 'Tổng kết sprint' },
          { value: 'burndown', label: 'Burndown' },
          { value: 'velocity', label: 'Velocity' },
        ]}
      />
      {tab !== 'velocity' && sprints.length > 0 && (
        <div className="mb-4">
          <label className="mr-2 text-xs font-semibold text-[#6b778c]" htmlFor="report-sprint">
            Sprint
          </label>
          <SelectInput id="report-sprint" value={sprint?.id} onChange={(e) => setQuery({ sprintId: e.target.value })} className="w-auto">
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.state === 'ACTIVE' ? '(đang diễn ra)' : '(đã đóng)'}
              </option>
            ))}
          </SelectInput>
        </div>
      )}
      {tab === 'velocity' ? (
        <VelocityTab />
      ) : !sprint ? (
        <EmptyState title="Chưa có sprint đã bắt đầu" description="Báo cáo sprint có sau khi bắt đầu sprint đầu tiên trong Backlog." />
      ) : tab === 'summary' ? (
        <SummaryTab sprintId={sprint.id} />
      ) : (
        <BurndownTab sprintId={sprint.id} />
      )}
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[3px] border border-[#dfe1e6] px-4 py-3">
      <p className="text-xs text-[#6b778c]">{label}</p>
      <p className="mt-1 text-2xl font-medium">{value}</p>
      {hint && <p className="text-[11px] text-[#6b778c]">{hint}</p>}
    </div>
  );
}

function IssueTable({ title, issues }: { title: string; issues: DemoIssue[] }) {
  const { open } = useIssueParam();
  return (
    <Card title={`${title} (${issues.length})`}>
      {!issues.length ? (
        <p className="text-[13px] text-[#6b778c]">Không có.</p>
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Mã</th>
              <th className={thClass}>Tiêu đề</th>
              <th className={thClass}>Trạng thái hiện tại</th>
              <th className={`${thClass} text-right`}>Điểm hiện tại</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className={tdClass}>
                  <span className="flex items-center gap-2">
                    <IssueTypeIcon typeId={i.typeId} />
                    <button className="text-[#0052cc] hover:underline" onClick={() => open(i.id)}>
                      {i.key}
                    </button>
                  </span>
                </td>
                <td className={tdClass}>{i.title}</td>
                <td className={tdClass}>
                  <IssueStatus statusId={i.statusId} />
                </td>
                <td className={`${tdClass} text-right`}>{i.points ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Tổng kết: CLOSED dùng danh sách DONE/chưa xong đã chụp lúc đóng; ACTIVE dùng trạng thái hiện tại. */
function SummaryTab({ sprintId }: { sprintId: number }) {
  const { state } = useDemo();
  const sprint = projectSprints(state, useProject().id).find((s) => s.id === sprintId)!;
  const snap = snapshotOf(state, sprintId);
  const current = sprintMetrics(state, sprintId);
  const closed = sprint.state === 'CLOSED';
  const issues = sprintIssueList(state, sprintId);
  const fromIds = (ids: number[]) => ids.map((id) => findIssue(state, id)).filter((i): i is DemoIssue => !!i);
  const done = closed && snap?.completionAvailable ? fromIds(snap.completedIssueIds) : issues.filter((i) => isDone(state, i));
  const unfinished = closed && snap?.completionAvailable ? fromIds(snap.unfinishedIssueIds) : issues.filter((i) => !isDone(state, i));
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#42526e]">
        {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
        {sprint.goal ? ` · ${sprint.goal}` : ''}
      </p>
      {!snap?.baselineAvailable && <InlineAlert tone="warning">Sprint này chưa có snapshot lúc bắt đầu (dữ liệu cũ), nên không có số commitment.</InlineAlert>}
      {closed && !snap?.completionAvailable && <InlineAlert tone="warning">Sprint đóng trước khi có tính năng snapshot: không có số liệu hoàn thành lịch sử. Bên dưới chỉ là trạng thái hiện tại.</InlineAlert>}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase text-[#6b778c]">Snapshot</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Commitment (điểm)" value={snap?.baselineAvailable ? (snap.committedPoints ?? '—') : '—'} hint={snap?.baselineAvailable ? `${snap.committedCount} việc lúc bắt đầu` : 'Không có lịch sử'} />
          <Stat label="Hoàn thành khi đóng (điểm)" value={snap?.completionAvailable ? (snap.completedPoints ?? '—') : '—'} hint={closed ? (snap?.completionAvailable ? `${snap.completedCount} việc` : 'Không có lịch sử') : 'Có khi hoàn tất sprint'} />
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase text-[#6b778c]">Hiện tại (tính lại từ công việc, có thể đổi sau khi đóng)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tổng điểm" value={current.totalPoints} />
          <Stat label="Điểm còn lại" value={current.remainingPoints} />
          <Stat label="Số công việc" value={current.issueCount} />
          <Stat label="Việc chưa xong" value={current.remainingCount} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <IssueTable title={closed ? 'Hoàn thành khi đóng' : 'Đã hoàn thành'} issues={done} />
        <IssueTable title={closed ? 'Chưa xong khi đóng' : 'Chưa hoàn thành'} issues={unfinished} />
      </div>
    </div>
  );
}

/** Burndown từ chuỗi sự kiện; không có sự kiện thì giải thích, không vẽ dữ liệu giả. */
function BurndownTab({ sprintId }: { sprintId: number }) {
  const { state } = useDemo();
  const sprint = projectSprints(state, useProject().id).find((s) => s.id === sprintId)!;
  const events = state.burndownEvents.filter((e) => e.sprintId === sprintId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id - b.id);
  const snap = snapshotOf(state, sprintId);
  if (!events.length)
    return <EmptyState title="Không có dữ liệu burndown" description="Sprint này kết thúc trước khi hệ thống ghi sự kiện burndown, nên không có lịch sử để vẽ." />;
  return (
    <div className="space-y-4">
      <Card title={`Burndown ${sprint.name}`}>
        <Legend
          items={[
            { color: '#de350b', label: 'Điểm còn lại' },
            { color: '#97a0af', label: 'Tổng phạm vi', dashed: true },
            { color: '#c1c7d0', label: 'Đường tham chiếu từ commitment' },
          ]}
        />
        <div className="mt-3 overflow-x-auto">
          <BurndownChart events={events} start={sprint.startDate} end={sprint.endDate} committed={snap?.baselineAvailable ? snap.committedPoints : null} />
        </div>
        <p className="mt-2 text-xs text-[#6b778c]">Mỗi điểm là một lần số liệu thay đổi. Dùng Tab để duyệt từng điểm bằng bàn phím.</p>
      </Card>
      <Card title="Bảng số liệu">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Thời điểm</th>
              <th className={`${thClass} text-right`}>Còn lại (điểm)</th>
              <th className={`${thClass} text-right`}>Tổng phạm vi (điểm)</th>
              <th className={`${thClass} text-right`}>Việc còn lại</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className={tdClass}>{formatDate(e.recordedAt, true)}</td>
                <td className={`${tdClass} text-right`}>{e.remainingPoints}</td>
                <td className={`${tdClass} text-right`}>{e.totalPoints}</td>
                <td className={`${tdClass} text-right`}>
                  {e.remainingCount}/{e.issueCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** Velocity chỉ đọc snapshot của sprint đã đóng. */
function VelocityTab() {
  const { state } = useDemo();
  const rows = velocity(state, useProject().id);
  if (!rows.length) return <EmptyState title="Chưa có sprint đã đóng" description="Velocity có sau khi hoàn tất ít nhất một sprint." />;
  const available = rows.filter((r) => r.completed !== null);
  const avg = available.length ? Math.round(available.reduce((t, r) => t + (r.completed ?? 0), 0) / available.length) : null;
  return (
    <div className="space-y-4">
      <Card title="Velocity theo sprint đã đóng">
        <Legend
          items={[
            { color: '#c1c7d0', label: 'Commitment lúc bắt đầu' },
            { color: '#36b37e', label: 'Hoàn thành khi đóng' },
          ]}
        />
        <div className="mt-3 overflow-x-auto">
          <VelocityChart rows={rows.map((r) => ({ id: r.sprint.id, name: r.sprint.name, committed: r.committed, completed: r.completed, available: r.available }))} />
        </div>
        <p className="mt-2 text-sm text-[#42526e]">
          Trung bình hoàn thành: <strong>{avg ?? '—'}</strong> điểm/sprint ({available.length} sprint có số liệu).
        </p>
      </Card>
      <Card title="Bảng số liệu">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Sprint</th>
              <th className={thClass}>Đóng lúc</th>
              <th className={`${thClass} text-right`}>Commitment</th>
              <th className={`${thClass} text-right`}>Hoàn thành</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sprint.id}>
                <td className={tdClass}>{r.sprint.name}</td>
                <td className={tdClass}>{formatDate(r.sprint.completedAt, true)}</td>
                <td className={`${tdClass} text-right`}>{r.committed ?? 'Không có lịch sử'}</td>
                <td className={`${tdClass} text-right`}>{r.completed ?? 'Không có lịch sử'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
