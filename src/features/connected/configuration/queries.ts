'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectedError, completeConnectedMutation, connectedMutation, connectedRequest, hasPendingLogout, withSessionLock } from '../client';
import { useProjectMutationScope } from '../projects/queries';
import type { Category } from './contract';

export type IssueType = { issueTypeId: number; typeName: string };
export type Status = { statusId: number; statusName: string; statusCategory: Category };
export type WorkflowRule = { ruleId: number; fromStatus: Status; toStatus: Status };
export type ProjectType = { projectId: number; issueTypeId: number; issueTypeName: string; isDefault: boolean };
type Write = { path: string; method: 'POST' | 'PUT' | 'DELETE'; body?: Record<string, unknown> };

const families = new Set(['configuration', 'issue-refs', 'issues', 'issue', 'planning', 'transitions', 'board', 'board-catalog', 'reports']);

/** Dùng cùng khóa phiên khi đọc để kết quả không vào cache actor cũ nếu cookie vừa đổi. */
async function readForActor<T>(actor: number, path: string, signal: AbortSignal) {
  const read = () => withSessionLock(async () => {
    signal.throwIfAborted();
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã kết thúc.');
    const { user } = await connectedRequest<{ user: { id: number } }>('auth/me', { signal }, false);
    signal.throwIfAborted();
    if (user.id !== actor || hasPendingLogout()) throw new ConnectedError(409, 'Tài khoản đã thay đổi.');
    return connectedRequest<T>(path, { signal }, false);
  });
  try {
    return await read();
  } catch (error) {
    if (signal.aborted || !(error instanceof ConnectedError) || error.status !== 401) throw error;
    await connectedRequest('auth/me', { signal });
    return read();
  }
}

export function useConfiguration<T>(actor: number, path: string, projectId?: number) {
  return useQuery({
    queryKey: ['connected', 'configuration', actor, projectId, path],
    queryFn: ({ signal }) => readForActor<T>(actor, path, signal),
  });
}

export function useConfigurationWrite(actor: number, projectId?: number) {
  const client = useQueryClient();
  const captureScope = useProjectMutationScope();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ghi một lần bằng đúng actor; cập nhật cache và form sau khi kiểm lại scope. */
  async function submit(write: Write, completed: () => void) {
    if (pending.current) return;
    const current = captureScope();
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await connectedMutation(write.path, actor, { method: write.method, body: write.body && JSON.stringify(write.body) }, current);
      let refresh: Promise<void> | undefined;
      const accepted = await completeConnectedMutation(actor, current, () => {
        refresh = client.invalidateQueries({
          predicate: ({ queryKey: key }) => key[0] === 'connected' && typeof key[1] === 'string' && families.has(key[1])
            && key[2] === actor && (projectId === undefined || key[3] === projectId),
        });
      });
      if (!accepted) return;
      await refresh;
      await completeConnectedMutation(actor, current, completed);
    } catch (failure) {
      if (!current()) return;
      const message = failure instanceof Error ? failure.message : 'Không thể thực hiện thao tác.';
      const confirmed = await completeConnectedMutation(actor, current, () => setError(message));
      if (!confirmed && current()) setError('Chưa xác nhận được thao tác. Hãy tải lại dữ liệu trước khi thử lại.');
    } finally {
      pending.current = false;
      if (current()) setBusy(false);
    }
  }

  return { busy, error, submit, clearError: () => setError(null) };
}
