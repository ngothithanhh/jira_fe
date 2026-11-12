'use client';

import { useQuery } from '@tanstack/react-query';
import { ConnectedError, connectedRequest, hasPendingLogout, withSessionLock } from '../client';
import type { AccountContext } from '../session';

type SprintState = 'FUTURE' | 'ACTIVE' | 'CLOSED';

export type ReportProject = { projectId: number; projectName: string; projectKey: string };
export type ReportSprint = {
  sprintId: number;
  projectId: number;
  sprintName: string;
  state: SprintState;
  startDate: string | null;
  endDate: string | null;
};
type Totals = {
  totalPoints: number;
  remainingPoints: number;
  issueCount: number;
  remainingCount: number;
  invalidEstimateCount: number;
};
export type Summary = {
  sprintId: number;
  state: SprintState;
  current: Totals;
  committedPoints: number | null;
  committedCount: number | null;
  completedPoints: number | null;
  completedCount: number | null;
  baselineAvailable: boolean;
};
export type Burndown = {
  sprintId: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  observedStart: string | null;
  finishedAt: string | null;
  baselineAvailable: boolean;
  points: (Totals & { recordedAt: string })[];
};
export type Velocity = {
  sprintId: number;
  sprintName: string;
  committedPoints: number | null;
  completedPoints: number | null;
  completedCount: number | null;
  finishedAt: string | null;
  completionAvailable: boolean;
  baselineAvailable: boolean;
};

const VELOCITY_LIMIT = 10;
const reportKey = (userId: number) => ['connected', 'reports', userId] as const;

/** Kiểm danh tính dưới khóa phiên để kết quả báo cáo không được ghi vào cache của tài khoản trước. */
async function reportRead<T>(userId: number, path: string, signal: AbortSignal) {
  const read = () => withSessionLock(async () => {
    signal.throwIfAborted();
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng trên thiết bị này.');
    const account = await connectedRequest<AccountContext>('account/context', { signal }, false);
    signal.throwIfAborted();
    if (account.user.userId !== userId || hasPendingLogout()) {
      throw new ConnectedError(409, 'Tài khoản đã thay đổi. Vui lòng mở lại báo cáo.');
    }
    return connectedRequest<T>(path, { signal }, false);
  });

  try {
    return await read();
  } catch (error) {
    if (signal.aborted || !(error instanceof ConnectedError) || error.status !== 401) throw error;
    // Khôi phục phiên ngoài khóa và kiểm lại danh tính trước lần đọc mới.
    await connectedRequest<AccountContext>('account/context', { signal });
    return read();
  }
}

function useReportQuery<T>(userId: number, scope: (string | number)[], path: string) {
  return useQuery({
    queryKey: [...reportKey(userId), ...scope],
    queryFn: ({ signal }) => reportRead<T>(userId, path, signal),
    networkMode: 'always',
    refetchOnReconnect: true,
  });
}

export function useReportProjects(userId: number) {
  return useReportQuery<ReportProject[]>(userId, ['projects'], 'projects/getList');
}

export function useReportSprints(userId: number, projectId: number) {
  return useReportQuery<ReportSprint[]>(userId, [projectId, 'sprints'], 'sprints/project/' + projectId);
}

export function useSprintSummary(userId: number, projectId: number, sprintId: number) {
  return useReportQuery<Summary>(userId, [projectId, 'summary', sprintId], 'sprints/' + sprintId + '/reports/summary');
}

export function useSprintBurndown(userId: number, projectId: number, sprintId: number) {
  return useReportQuery<Burndown>(userId, [projectId, 'burndown', sprintId], 'sprints/' + sprintId + '/reports/burndown');
}

export function useProjectVelocity(userId: number, projectId: number) {
  return useReportQuery<Velocity[]>(userId, [projectId, 'velocity', VELOCITY_LIMIT], 'projects/' + projectId + '/reports/velocity?limit=' + VELOCITY_LIMIT);
}
