'use client';

import { useRef, useState } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { completeConnectedMutation, connectedMutation, ConnectedError } from '../client';
import { projectKeys, useProjectMutationScope } from '../projects/queries';
import type { AccountContext } from '../session';
import { COLUMN_ORDER_HEADER, validColumnOrderToken } from './contract';
import type { BoardData, BoardDto } from './model';
import { boardDataKey } from './queries';

const uncertainOrders = new Set<string>();
const reloadMessage = 'Chưa xác nhận được kết quả. Tải lại trang trước khi đổi thứ tự cột tiếp.';

export function useColumnOrderWrite(actor: number | undefined, projectId: number, boardId: number, selected: boolean) {
  const client = useQueryClient();
  const capture = useProjectMutationScope();
  const selectedBoard = useRef(selected);
  selectedBoard.current = selected;
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const scopeKey = `${actor}:${projectId}:${boardId}`;
  const uncertain = uncertainOrders.has(scopeKey);
  const gateKey = projectKeys.detail(actor, projectId);
  const configKey = boardDataKey(actor, projectId, boardId, null);
  const affected = ({ queryKey: key }: Query) => key[0] === 'connected' && key[2] === actor && key[3] === projectId
    && (key[1] === 'board-catalog' || key[1] === 'board' && key[4] === boardId);
  const gateOnly = ({ queryKey: key }: Query) => key[0] === gateKey[0] && key[1] === gateKey[1] && key[2] === actor && key[3] === projectId;

  function assertDispatch(ids: number[], token: string) {
    const gate = client.getQueryState<{ context: AccountContext }>(gateKey);
    if (gate?.status !== 'success') throw new Error('Chưa xác nhận được quyền. Hãy tải lại dữ liệu board.');
    const context = gate.data?.context;
    if (!context || context.projectId !== projectId || !context.systemAdmin && !context.projectPermissions.includes('MANAGE_BOARD')) {
      throw new ConnectedError(403, 'Bạn không có quyền quản lý board này.');
    }
    const latest = client.getQueryState<BoardData>(configKey);
    const board = latest?.data?.board;
    if (latest?.status !== 'success' || board?.boardId !== boardId || board.projectId !== projectId) {
      throw new Error('Chưa xác nhận được dữ liệu board. Hãy tải lại.');
    }
    const actualIds = new Set(board.columns.map((column) => column.columnId));
    if (!validColumnOrderToken(token) || board.columnOrderToken !== token || new Set(ids).size !== ids.length
      || ids.length !== actualIds.size || ids.some((id) => !actualIds.has(id))) {
      throw new ConnectedError(409, 'Thứ tự hoặc tập cột đã thay đổi. Hãy tải thứ tự mới.');
    }
  }

  /** Đánh stale trước, chỉ refetch query active dưới scope đã kiểm actor. */
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
    return !!(accepted && reads && (await reads).every((result) => result.status === 'fulfilled' && result.value));
  }

  async function run(task: (current: () => boolean) => Promise<void>) {
    if (!actor || locked.current || uncertainOrders.has(scopeKey) || !selectedBoard.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    const inSession = capture();
    try {
      await task(() => inSession() && selectedBoard.current);
    } finally {
      locked.current = false;
      if (inSession()) setBusy(false);
    }
  }

  async function submit(ids: number[], token: string, saved: () => void) {
    await run(async (current) => {
      let dispatched = false;
      let committed = false;
      try {
        const response = await connectedMutation<undefined>(`boards/${boardId}/columns/order`, actor!, {
          method: 'PUT', headers: { [COLUMN_ORDER_HEADER]: token },
          body: JSON.stringify(ids.map((columnId, position) => ({ columnId, position }))),
        }, () => {
          if (!current() || uncertainOrders.has(scopeKey)) return false;
          assertDispatch(ids, token);
          return true;
        }, () => { dispatched = true; });
        committed = true;
        const loaded = await refresh(current);
        if (response !== undefined || !loaded || !await completeConnectedMutation(actor!, current, saved)) {
          throw new Error('Chưa tải lại được thứ tự cột.');
        }
      } catch (failure) {
        const status = failure instanceof ConnectedError ? failure.status : undefined;
        const unknown = committed || dispatched && (!status || status >= 500);
        if (unknown) uncertainOrders.add(scopeKey);
        if (!current()) return;
        if (!committed && status === 403) await refresh(current, gateOnly);
        if (status === 404 || status === 409) await client.invalidateQueries({ predicate: affected, refetchType: 'none' });
        const message = unknown ? reloadMessage : failure instanceof Error ? failure.message : 'Không thể lưu thứ tự cột.';
        const confirmed = await completeConnectedMutation(actor!, current, () => {
          setConflict(status === 404 || status === 409);
          setError(message);
        });
        if (!confirmed && current()) {
          setConflict(status === 404 || status === 409);
          setError(unknown ? reloadMessage : 'Chưa xác nhận được phiên. Hãy thử tải lại dữ liệu.');
        }
      }
    });
  }

  async function reload(apply: (board: BoardDto) => void) {
    await run(async (current) => {
      const gateReady = await refresh(current, gateOnly);
      const loaded = gateReady && await refresh(current);
      if (!current()) return;
      const updated = client.getQueryState<BoardData>(configKey);
      const board = updated?.data?.board;
      const gate = client.getQueryState<{ context: AccountContext }>(gateKey);
      const context = gate?.data?.context;
      if (loaded && updated?.status === 'success' && board?.boardId === boardId && board.projectId === projectId
          && validColumnOrderToken(board.columnOrderToken) && gate?.status === 'success'
          && context?.projectId === projectId && (context.systemAdmin || context.projectPermissions.includes('MANAGE_BOARD'))) {
        if (await completeConnectedMutation(actor!, current, () => { setConflict(false); apply(board); })) return;
      }
      if (current()) setError(updated?.error instanceof ConnectedError && updated.error.status === 404
        ? 'Board không còn tồn tại.' : 'Chưa tải lại được board hoặc quyền quản lý.');
    });
  }

  return { busy, conflict, uncertain, error: error || (uncertain ? reloadMessage : ''), submit, reload,
    clearError: () => { if (!conflict) setError(''); } };
}
