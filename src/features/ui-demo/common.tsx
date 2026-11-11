'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { Avatar, EmptyState, PriorityIcon, StateView, StatusLozenge, TypeIcon } from '@/components/project-ui/kit';
import { findProject, findStatus, findType, findUser, PRIORITY_LABEL, can } from './logic';
import { useDemo } from './provider';
import type { DemoProject, DemoIssue, PermissionCode } from './types';

/** Đường dẫn bộ trang duyệt; mọi link nội bộ đi qua đây để không lệch tiền tố /ui-review. */
export const routes = {
  root: '/ui-review',
  signIn: '/ui-review/sign-in',
  signUp: '/ui-review/sign-up',
  projects: '/ui-review/projects',
  project: (projectId: number, section = 'overview') => `/ui-review/projects/${projectId}/${section}`,
  issue: (projectId: number, issueId: number, section = 'issues') => `/ui-review/projects/${projectId}/${section}?issueId=${issueId}`,
  notifications: '/ui-review/notifications',
  account: '/ui-review/account',
  admin: (section = '') => `/ui-review/admin${section ? `/${section}` : ''}`,
};

const ProjectContext = createContext<DemoProject | null>(null);

/** Project của route hiện tại; chỉ có trong /ui-review/projects/{id}/... sau khi đã kiểm tồn tại và quyền xem. */
export function useProject() {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useProject chỉ dùng trong trang dự án.');
  return project;
}
export const useOptionalProject = () => useContext(ProjectContext);

/**
 * Cổng trang dự án: projectId trên URL là nguồn quyết định phạm vi.
 * ID không phải số nguyên dương hoặc không tồn tại → 404; không có VIEW_PROJECT → 403. Không fallback sang project khác.
 */
export function ProjectGate({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { state, me } = useDemo();
  const id = /^\d+$/.test(projectId) ? Number(projectId) : NaN;
  const project = Number.isSafeInteger(id) && id > 0 ? findProject(state, id) : undefined;
  if (!project) return <StateView kind="not-found" title="Không tìm thấy dự án" description="Dự án không tồn tại hoặc đã bị xóa." />;
  if (!can(state, me?.id, 'VIEW_PROJECT', project.id))
    return <StateView kind="forbidden" description={`Bạn không phải thành viên của dự án ${project.key}. Liên hệ trưởng dự án để được thêm vào.`} />;
  return <ProjectContext.Provider value={project}>{children}</ProjectContext.Provider>;
}

/**
 * Bọc nội dung từng trang để áp kịch bản duyệt (tải/lỗi/403/404/rỗng).
 * Kịch bản chỉ đổi hiển thị; dữ liệu mẫu không bị thay đổi.
 */
export function Screen({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  const { scenario, setScenario } = useDemo();
  if (scenario === 'loading') return <StateView kind="loading" />;
  if (scenario === 'error') return <StateView kind="error" onRetry={() => setScenario('normal')} />;
  if (scenario === 'forbidden') return <StateView kind="forbidden" />;
  if (scenario === 'not-found') return <StateView kind="not-found" />;
  if (scenario === 'empty') return <>{empty ?? <EmptyState title="Chưa có dữ liệu" description="Trang này hiện chưa có nội dung." />}</>;
  return <>{children}</>;
}

/** Quyền của persona hiện tại trong project (hoặc toàn cục khi không truyền projectId). */
export function useCan(code: PermissionCode, projectId?: number) {
  const { state, me } = useDemo();
  return can(state, me?.id, code, projectId);
}

/** Mở/đóng panel chi tiết bằng query issueId, giữ nguyên trang và state lọc của trang hiện tại. */
export function useIssueParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const issueId = params.get('issueId');
  const open = useCallback(
    (id: number) => {
      const next = new URLSearchParams(params.toString());
      next.set('issueId', String(id));
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete('issueId');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return { issueId: issueId && /^\d+$/.test(issueId) ? Number(issueId) : null, rawIssueId: issueId, open, close };
}

export function UserAvatar({ userId, size = 24 }: { userId: number | null; size?: number }) {
  const { state } = useDemo();
  const user = findUser(state, userId);
  if (userId !== null && !user) return <Avatar name="?" title="Người dùng không còn tồn tại" size={size} />;
  return <Avatar name={user?.fullName ?? null} src={user?.avatarUrl} size={size} />;
}

export function IssueStatus({ statusId }: { statusId: number }) {
  const { state } = useDemo();
  const status = findStatus(state, statusId);
  return status ? <StatusLozenge name={status.name} category={status.category} /> : <StatusLozenge name="Không rõ" category="TO_DO" />;
}

export function IssueTypeIcon({ typeId }: { typeId: number }) {
  const { state } = useDemo();
  const type = findType(state, typeId);
  return <TypeIcon icon={type?.icon ?? 'task'} name={type?.name ?? 'Không rõ'} color={type?.color} />;
}

export function IssuePriority({ issue }: { issue: Pick<DemoIssue, 'priority'> }) {
  return <PriorityIcon priority={issue.priority} label={PRIORITY_LABEL[issue.priority]} />;
}
