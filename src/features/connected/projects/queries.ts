'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { connectedReadForActor, connectedRequest, hasPendingLogout } from '../client';
import { useSession, type AccountContext } from '../session';
import type { ProjectDto } from './model';

export const projectKeys = {
  list: (userId?: number) => ['connected', 'projects', userId] as const,
  detail: (userId: number | undefined, id: number | null) => ['connected', 'project', userId, id] as const,
};

/** API list đã lọc VIEW_PROJECT và trả grouped counts; không dựng N request thống kê mỗi dòng. */
export function useProjects() {
  const { data } = useSession();
  return useQuery({ queryKey: projectKeys.list(data?.user.userId), enabled: !!data,
    queryFn: ({ signal }) => connectedReadForActor(data!.user.userId, signal, () => connectedRequest<ProjectDto[]>('projects/getList', { signal }, false)), retry: false });
}

/** Đọc context đúng project trước detail; không đủ quyền thì dừng, không đọc dữ liệu một dự án khác thay thế. */
export function useConnectedProject(id: number | null) {
  const { data } = useSession();
  return useQuery({ queryKey: projectKeys.detail(data?.user.userId, id), enabled: !!data && id !== null,
    queryFn: ({ signal }) => connectedReadForActor(data!.user.userId, signal, async () => {
      const context = await connectedRequest<AccountContext>(`account/context?projectId=${id}`, { signal }, false);
      const project = await connectedRequest<ProjectDto>(`projects/${id}`, { signal }, false);
      return { context, project };
    }), retry: false });
}

/** Chỉ refresh cache của phiên vừa ghi; response cũ sau logout/đổi tài khoản không dựng lại cache người trước. */
export function useRefreshProjects() {
  const client = useQueryClient();
  const { data } = useSession();
  const actorId = data?.user.userId;
  return async (id?: number, deleted = false) => {
    if (client.getQueryData<AccountContext | null>(['connected', 'session'])?.user.userId !== actorId) return;
    if (id && deleted) client.removeQueries({ queryKey: projectKeys.detail(actorId, id) });
    await client.invalidateQueries({ queryKey: projectKeys.list(actorId) });
    if (id && !deleted) await client.invalidateQueries({ queryKey: projectKeys.detail(actorId, id) });
  };
}

/**
 * Giữ kết quả mutation trong đúng vòng đời form/phiên đã bắt đầu, kể cả khi user đăng nhập lại cùng ID.
 * Caller lấy hàm kiểm ở lúc submit và kiểm lại trước/sau invalidate; unmount hoặc sự kiện đổi phiên vô hiệu hóa nó.
 */
export function useProjectMutationScope() {
  const client = useQueryClient();
  const { data } = useSession();
  const ref = useRef({ mounted: false, generation: 0 });
  useEffect(() => {
    ref.current.mounted = true;
    const changed = () => { ref.current.generation++; };
    window.addEventListener('jira-session', changed);
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('jira-connected-session') : null;
    if (channel) channel.onmessage = changed;
    return () => { ref.current.mounted = false; ref.current.generation++; window.removeEventListener('jira-session', changed); channel?.close(); };
  }, []);
  return () => {
    const generation = ref.current.generation;
    const userId = data?.user.userId;
    return () => ref.current.mounted && ref.current.generation === generation && !hasPendingLogout()
      && client.getQueryData<AccountContext | null>(['connected', 'session'])?.user.userId === userId;
  };
}
