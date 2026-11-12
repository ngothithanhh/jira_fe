'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectedError, completeConnectedMutation, connectedMutation, connectedRequest, hasPendingLogout, withSessionLock } from '../client';
import { projectKeys, useProjectMutationScope } from '../projects/queries';

export type Member = {
  userId: number;
  userName: string;
  fullName: string | null;
  email: string;
  roleId: number;
  role: string;
  assignedAt: string | null;
};
export type Candidate = Pick<Member, 'userId' | 'userName' | 'fullName'>;
export type ProjectRole = { role: number; roleName: string };
type MemberChange =
  | { kind: 'add' | 'role'; userId: number; roleId: number }
  | { kind: 'remove'; userId: number };

const memberPath = (projectId: number) => 'projects/' + projectId + '/members';
const memberKey = (actorId: number, projectId: number) => ['connected', 'members', actorId, projectId] as const;
const candidateKey = (actorId: number, projectId: number) => [...memberKey(actorId, projectId), 'candidate'] as const;

/** Đọc dưới cùng khóa phiên để cookie vừa đổi không đưa dữ liệu người mới vào query key người cũ. */
async function memberRead<T>(actorId: number, path: string, init: RequestInit & { signal: AbortSignal }) {
  const read = () => withSessionLock(async () => {
    init.signal.throwIfAborted();
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng trên thiết bị này.');
    const identity = await connectedRequest<{ user: { id: number } }>('auth/me', { signal: init.signal }, false);
    init.signal.throwIfAborted();
    if (identity.user.id !== actorId || hasPendingLogout()) {
      throw new ConnectedError(409, 'Tài khoản đã thay đổi. Vui lòng mở lại trang thành viên.');
    }
    return connectedRequest<T>(path, init, false);
  });
  try {
    return await read();
  } catch (error) {
    if (init.signal.aborted || !(error instanceof ConnectedError) || error.status !== 401) throw error;
    // Lookup POST chỉ đọc. Khôi phục phiên ngoài khóa rồi kiểm lại actor trước khi đọc.
    await connectedRequest('auth/me', { signal: init.signal });
    return read();
  }
}

export function useMembers(actorId: number, projectId: number) {
  return useQuery({
    queryKey: [...memberKey(actorId, projectId), 'list'],
    queryFn: ({ signal }) => memberRead<Member[]>(actorId, memberPath(projectId), { signal }),
  });
}

export function useMemberRoles(actorId: number, projectId: number, enabled: boolean) {
  return useQuery({
    queryKey: [...memberKey(actorId, projectId), 'roles'],
    enabled,
    queryFn: ({ signal }) => memberRead<ProjectRole[]>(actorId, 'user-role', { signal }),
    select: (roles) => roles.filter((role) => role.roleName.toUpperCase() !== 'SYSTEM_ADMIN'),
  });
}

export function useMemberCandidate(actorId: number, projectId: number, email: string | null) {
  return useQuery({
    queryKey: [...candidateKey(actorId, projectId), email],
    enabled: email !== null,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => memberRead<Candidate[]>(actorId, memberPath(projectId) + '/candidates/search', {
      method: 'POST', body: JSON.stringify({ email }), signal,
    }),
  });
}

function memberMutation(projectId: number, change: MemberChange) {
  const path = memberPath(projectId);
  if (change.kind === 'remove') return { path: path + '/' + change.userId, init: { method: 'DELETE' } };
  if (change.kind === 'role') {
    return { path: path + '/' + change.userId + '/role', init: { method: 'PUT', body: JSON.stringify({ roleId: change.roleId }) } };
  }
  return { path, init: { method: 'POST', body: JSON.stringify({ userId: change.userId, roleId: change.roleId }) } };
}

export function useMemberWrite(actorId: number, projectId: number) {
  const queryClient = useQueryClient();
  const captureScope = useProjectMutationScope();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Gửi đúng một thao tác, xác minh actor/scope trước khi invalidate và trước khi cập nhật form. */
  async function submit(change: MemberChange, complete: () => void) {
    if (submitting.current) return;
    const current = captureScope();
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const { path, init } = memberMutation(projectId, change);
      await connectedMutation<void>(path, actorId, init, current);
      let refresh: Promise<unknown> | undefined;
      const accepted = await completeConnectedMutation(actorId, current, () => {
        refresh = Promise.all([
          queryClient.invalidateQueries({ queryKey: [...memberKey(actorId, projectId), 'list'] }),
          queryClient.invalidateQueries({ queryKey: candidateKey(actorId, projectId), refetchType: 'none' }),
          queryClient.invalidateQueries({ queryKey: ['connected', 'issue-refs', actorId, projectId] }),
          queryClient.invalidateQueries({ queryKey: projectKeys.list(actorId) }),
          queryClient.invalidateQueries({ queryKey: projectKeys.detail(actorId, projectId) }),
          ...(change.kind === 'add' && change.userId === actorId
            ? [queryClient.invalidateQueries({ queryKey: ['connected', 'notifications', actorId] })] : []),
        ]);
      });
      if (!accepted) return;
      await refresh;
      await completeConnectedMutation(actorId, current, complete);
    } catch (failure) {
      if (!current()) return;
      const message = failure instanceof Error ? failure.message : 'Không thể thực hiện thao tác.';
      const confirmed = await completeConnectedMutation(actorId, current, () => setError(message));
      if (!confirmed && current()) setError('Không xác nhận được thao tác. Hãy tải lại danh sách trước khi thử lại.');
    } finally {
      submitting.current = false;
      if (current()) setBusy(false);
    }
  }

  return { busy, error, submit, clearError: () => setError(null) };
}
