'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectedError, completeConnectedMutation, connectedMutation, connectedRequest, hasPendingLogout, withSessionLock } from '../client';
import { projectKeys, useProjectMutationScope } from '../projects/queries';

const uncertain = new Set<string>();
export const inviteKey = (actor: number, scope: string | number) => ['connected', 'invitations', actor, scope] as const;

async function read<T>(actor: number, path: string, signal: AbortSignal) {
  if (!navigator.locks) throw new ConnectedError(409, 'Trình duyệt chưa hỗ trợ khóa phiên an toàn.');
  const scoped = () => withSessionLock(async () => {
    signal.throwIfAborted();
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng.');
    const me = await connectedRequest<{ user: { id: number } }>('auth/me', { signal }, false);
    signal.throwIfAborted();
    if (me.user.id !== actor || hasPendingLogout()) throw new ConnectedError(409, 'Tài khoản đã thay đổi.');
    return connectedRequest<T>(path, { signal }, false);
  });
  try { return await scoped(); }
  catch (cause) {
    if (signal.aborted || !(cause instanceof ConnectedError) || cause.status !== 401) throw cause;
    await connectedRequest('auth/me', { signal });
    return scoped();
  }
}

export function useInvitationRead<T>(actor: number, scope: number | string, path: string, enabled = true, revision = 0) {
  return useQuery({ queryKey: [...inviteKey(actor, scope), path, revision], enabled, queryFn: ({ signal }) => read<T>(actor, path, signal),
    refetchOnWindowFocus: true });
}

export function useInvitationWrite(actor: number, scope: number | string) {
  const cache = useQueryClient();
  const capture = useProjectMutationScope();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latch = actor + ':' + scope;
  const markUncertain = () => {
    uncertain.add(latch);
    setError('Chưa xác nhận được kết quả. Hãy tải lại trước khi thao tác tiếp.');
  };

  /** Kiểm quyền theo project sau khi có khóa phiên, và probe actor lần nữa trước khi nhận kết quả. */
  async function submit<T>(path: string, input: object | undefined, onDone: (value: T) => void) {
    if (sending.current || uncertain.has(latch)) return;
    const current = capture();
    const canDispatch = () => {
      if (!current() || uncertain.has(latch)) return false;
      if (typeof scope !== 'number') return true;
      const key = projectKeys.detail(actor, scope);
      const data = cache.getQueryData<{ context: { systemAdmin: boolean; projectPermissions: string[] } }>(key);
      return cache.getQueryState(key)?.status === 'success'
        && !!data && (data.context.systemAdmin || data.context.projectPermissions.includes('ADD_MEMBER'));
    };
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await connectedMutation<T>(path, actor,
        { method: 'POST', ...(input && { body: JSON.stringify(input) }) }, canDispatch);
      const applied = await completeConnectedMutation(actor, current, () => {
        void cache.invalidateQueries({ queryKey: inviteKey(actor, scope), refetchType: 'none' });
        const accepted = value as { projectId?: number; state?: string } | undefined;
        if (accepted?.state === 'ACCEPTED') {
          void cache.invalidateQueries({ predicate: ({ queryKey: key }) => key[0] === 'connected'
            && (key[1] === 'session' || (key[2] === actor && ['projects', 'project', 'members', 'issue-refs', 'notifications'].includes(String(key[1])))),
          refetchType: 'none' });
        }
        onDone(value);
      });
      if (!applied) {
        uncertain.add(latch);
        if (current()) markUncertain();
      }
    } catch (cause) {
      const ambiguous = !(cause instanceof ConnectedError) || cause.status === 0 || cause.status >= 500;
      if (ambiguous) uncertain.add(latch);
      if (current()) {
        if (ambiguous) markUncertain();
        else await completeConnectedMutation(actor, current, () => {
          setError(cause.message);
          if (cause.status === 409 || cause.status === 410) void cache.invalidateQueries({ queryKey: inviteKey(actor, scope) });
        });
      }
    } finally {
      sending.current = false;
      if (current()) setBusy(false);
    }
  }
  return { busy, uncertain: uncertain.has(latch), error, submit, clearError: () => setError('') };
}
