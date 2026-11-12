'use client';

import { useRef, useState } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import type { PlanningData } from '@/features/backlog/types';
import { completeConnectedMutation, connectedMutation, ConnectedError } from '../client';
import { projectKeys, useProjectMutationScope } from '../projects/queries';
import type { AccountContext } from '../session';
import type { SprintDto } from './model';
import { validateSprintDates, type SprintPatch } from './sprint-contract';

const projectDomains = new Set(['project', 'planning', 'issues', 'issue', 'board', 'board-catalog', 'sprint', 'reports']);
const refreshOnConflict = new Set([403, 404, 409]);
// Một lần tải trang giữ khóa cho cả khi người dùng rời Backlog rồi quay lại bằng điều hướng nội bộ.
const uncertainScopes = new Set<string>();

export function useSprintWrite(actor: number | undefined, projectId: number) {
  const client = useQueryClient();
  const capture = useProjectMutationScope();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scopeKey = `${actor}:${projectId}`;
  const [uncertain, setUncertain] = useState(() => uncertainScopes.has(scopeKey));
  const gateKey = projectKeys.detail(actor, projectId);
  const planningKey = ['connected', 'planning', actor, projectId] as const;

  function latestSprint(id: number) {
    const gate = client.getQueryState<{ context: AccountContext }>(gateKey);
    const planning = client.getQueryState<PlanningData>(planningKey);
    if (gate?.status !== 'success' || planning?.status !== 'success') {
      throw new Error('Chưa tải được quyền hoặc trạng thái sprint. Hãy thử tải lại.');
    }
    const context = gate.data?.context;
    if (!context || context.projectId !== projectId || (!context.systemAdmin && !context.projectPermissions.includes('MANAGE_SPRINT'))) {
      throw new ConnectedError(403, 'Bạn không có quyền quản lý sprint trong dự án này.');
    }
    const sprint = planning.data?.sprints.find((candidate) => candidate.id === id);
    if (!sprint) throw new ConnectedError(404, 'Sprint không còn trong Backlog. Kiểm tra trạng thái mới.');
    return sprint;
  }

  const affected = ({ queryKey: key }: Query) => key[0] === 'connected' && key[2] === actor && (
    key[1] === 'projects' || key[1] === 'admin-overview' || key[1] === 'reports' && key[3] === 'projects'
    || key[3] === projectId && typeof key[1] === 'string' && projectDomains.has(key[1])
  );

  /** Đánh stale cache theo actor; chỉ khởi động tải lại dưới khóa sau khi xác nhận cookie. */
  async function refresh(current: () => boolean, predicate = affected) {
    await client.invalidateQueries({ predicate, refetchType: 'none' });
    let reads: Promise<PromiseSettledResult<boolean>[]> | undefined;
    const accepted = actor && await completeConnectedMutation(actor, current, () => {
      const active = client.getQueryCache().findAll({ predicate, type: 'active' });
      reads = Promise.allSettled(active.map(async (query) => {
        await client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { throwOnError: true });
        return !query.isActive() || query.state.fetchStatus !== 'paused';
      }));
    });
    if (!accepted || !reads) return false;
    const results = await reads;
    return results.every((result) => result.status === 'fulfilled' && result.value);
  }

  function validate(id: number, patch?: SprintPatch) {
    const sprint = latestSprint(id);
    if (sprint.state === 'ACTIVE' && (!patch || patch.startDate !== undefined || patch.endDate !== undefined)) {
      throw new ConnectedError(409, 'Sprint đã bắt đầu. Chỉ có thể sửa tên và mục tiêu.');
    }
    if (patch) validateSprintDates(patch.startDate ?? sprint.startDate, patch.endDate ?? sprint.endDate);
  }

  /** Một lần gửi; chỉ khóa thao tác đến reload nếu request đã gửi mà kết quả chưa được xác nhận. */
  async function submit(id: number, patch: SprintPatch | undefined, done: () => void) {
    if (!actor || locked.current || uncertainScopes.has(scopeKey)) return;
    locked.current = true;
    setBusy(true);
    setError('');
    const current = capture();
    let dispatched = false;
    let committed = false;
    try {
      const saved = await connectedMutation<SprintDto | undefined>(`sprints/${id}`, actor, patch
        ? { method: 'PATCH', body: JSON.stringify(patch) }
        : { method: 'DELETE' }, () => {
        if (!current() || uncertainScopes.has(scopeKey)) return false;
        validate(id, patch);
        return true;
      }, () => { dispatched = true; });
      committed = true;
      const loaded = await refresh(current);
      if (patch ? saved?.sprintId !== id || saved.projectId !== projectId : saved !== undefined) {
        throw new Error('Phản hồi sprint không hợp lệ.');
      }
      if (!loaded || !await completeConnectedMutation(actor, current, done)) {
        throw new Error('Chưa tải lại được sprint.');
      }
    } catch (failure) {
      const status = failure instanceof ConnectedError ? failure.status : undefined;
      const unknown = committed || dispatched && (!status || status >= 500);
      if (unknown) uncertainScopes.add(scopeKey);
      if (!current()) return;
      if (!committed && status !== undefined && refreshOnConflict.has(status)) await refresh(current);
      const message = committed ? 'Máy chủ đã nhận thay đổi. Tải lại trang để xác nhận kết quả.'
        : unknown ? 'Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp.'
        : failure instanceof Error ? failure.message : 'Không thể xử lý sprint.';
      const confirmed = await completeConnectedMutation(actor, current, () => {
        setUncertain(unknown);
        setError(message);
      });
      if (!confirmed && current()) {
        setUncertain(unknown);
        setError(unknown ? 'Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp.' : 'Chưa xác nhận được phiên. Hãy thử tải lại dữ liệu.');
      }
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  async function retry() {
    if (locked.current || uncertain) return;
    locked.current = true;
    setBusy(true);
    setError('');
    const current = capture();
    try {
      if (!await refresh(current) && current()) setError('Chưa tải lại được quyền hoặc dữ liệu sprint.');
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  }

  return { latestSprint, submit, retry, busy, error, uncertain, clearError: () => setError('') };
}
