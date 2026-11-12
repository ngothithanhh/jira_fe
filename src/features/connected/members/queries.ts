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
  | { kind: 'role'; userId: number; roleId: number }
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
  return { path: path + '/' + change.userId + '/role', init: { method: 'PUT', body: JSON.stringify({ roleId: change.roleId }) } };
}

export function useMemberWrite(actorId: number, projectId: number) {
  const queryClient = useQueryClient();
  const captureScope = useProjectMutationScope();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain,setUncertain] = useState(false);

  /** Gửi đúng một thao tác, xác minh actor/scope trước khi invalidate và trước khi cập nhật form. */
  async function submit(change: MemberChange, complete: () => void) {
    if (submitting.current || uncertain) return;
    const current = captureScope();
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const { path, init } = memberMutation(projectId, change);
      // Kiểm quyền cache hiện tại ngay trước dispatch sau khóa/auth; lỗi gate không cho form cũ tiếp tục ghi.
      const canDispatch=()=>{
        const key=projectKeys.detail(actorId,projectId);
        const state=queryClient.getQueryState(key);
        const data=queryClient.getQueryData<{context:{systemAdmin:boolean;projectPermissions:string[]}}>(key);
        return current()&&state?.status!=='error'&&!!data&&(data.context.systemAdmin||data.context.projectPermissions.includes(change.kind==='remove'?'DELETE_MEMBER':'ADD_MEMBER'));
      };
      await connectedMutation<void>(path, actorId, init, canDispatch);
      let refresh: Promise<unknown> | undefined;
      const accepted = await completeConnectedMutation(actorId, current, () => {
        refresh = Promise.all([
          queryClient.invalidateQueries({ queryKey: [...memberKey(actorId, projectId), 'list'] }),
          queryClient.invalidateQueries({ queryKey: candidateKey(actorId, projectId), refetchType: 'none' }),
          queryClient.invalidateQueries({ queryKey: ['connected', 'issue-refs', actorId, projectId] }),
          queryClient.invalidateQueries({ queryKey: projectKeys.list(actorId) }),
          queryClient.invalidateQueries({ queryKey: projectKeys.detail(actorId, projectId) }),
        ]);
      });
      if (!accepted) {
        // Request ghi đã thành công nhưng không probe được actor: bỏ cache liên quan ở trạng thái stale,
        // không refetch bằng cookie có thể đã đổi và không mở submit để người dùng gửi lại việc đã commit.
        if(current()) {
          await Promise.all(['members','issue-refs','projects','project'].map(domain=>queryClient.invalidateQueries({
            predicate:q=>q.queryKey[0]==='connected'&&q.queryKey[1]===domain&&q.queryKey[2]===actorId&&(domain==='projects'||q.queryKey[3]===projectId),
            refetchType:'none',
          })));
          setUncertain(true);setError('Thao tác đã được máy chủ xác nhận nhưng chưa tải lại được kết quả. Tải lại trang trước khi thao tác tiếp.');
        }
        return;
      }
      await refresh;
      const finished=await completeConnectedMutation(actorId, current, complete);
      if(!finished&&current()){setUncertain(true);setError('Thao tác đã lưu. Chưa xác nhận được phiên để hoàn tất giao diện; tải lại trang trước khi thao tác tiếp.');}
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

  return { busy, uncertain, error, submit, clearError: () => setError(null) };
}
