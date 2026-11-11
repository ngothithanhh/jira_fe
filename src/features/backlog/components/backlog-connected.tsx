'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button } from '@/components/ui/button';
import { loadPlanning } from '../api';
import { movedPlanning, orderedPlanning } from '../model';
import type { PlanningActions, PlanningData } from '../types';
import { BacklogView } from './backlog-view';
import { PlanningShell } from './planning-shell';

/**
 * Trang thật dùng khóa query riêng theo project, giữ token bằng Axios interceptor sẵn có.
 * Mutation không retry; khóa thao tác, optimistic reorder/move, rollback nếu HTTP chưa thành công rồi refetch.
 * Nếu backend đã lưu mà refetch lỗi thì báo rõ, không giả vờ hoàn tác dữ liệu đã commit ở server.
 */
export function BacklogConnected({ projectId }: { projectId: number }) {
  const client = useQueryClient();
  const key = ['planning', projectId] as const;
  const query = useQuery({ queryKey: key, queryFn: () => loadPlanning(projectId), retry: false });
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function perform(work: () => Promise<unknown>, optimistic?: (current: PlanningData) => PlanningData) {
    if (lock.current) throw new Error('Một thao tác đang được lưu. Vui lòng chờ.');
    lock.current = true;
    setBusy(true);
    const previous = client.getQueryData<PlanningData>(key);
    let committed = false;
    try {
      if (optimistic && previous) client.setQueryData(key, optimistic(previous));
      await work();
      committed = true;
      await query.refetch({ throwOnError: true });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['tasks'] }),
        client.invalidateQueries({ queryKey: ['sprints'] }),
      ]);
    } catch (error) {
      if (!committed && previous) client.setQueryData(key, previous);
      if (!committed) await query.refetch();
      throw new Error(
        committed
          ? 'Đã lưu nhưng chưa tải lại được danh sách. Vui lòng nhấn thử lại.'
          : getApiErrorMessage(error),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const actions: PlanningActions = {
    async createIssue(draft) {
      if (!draft.title.trim()) throw new Error('Vui lòng nhập tên công việc.');
      await perform(() =>
        apiClient.post('/issues', {
          projectId,
          summary: draft.title.trim(),
          issueTypeId: draft.typeId,
          priority: draft.priority,
        }),
      );
    },
    async createSprint(draft) {
      if (!draft.name.trim()) throw new Error('Vui lòng nhập tên sprint.');
      if (draft.startDate && draft.endDate && new Date(draft.startDate) >= new Date(draft.endDate))
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
      await perform(() =>
        apiClient.post('/sprints', {
          projectId,
          sprintName: draft.name.trim(),
          goal: draft.goal.trim(),
          startDate: draft.startDate ? `${draft.startDate}T00:00:00` : null,
          endDate: draft.endDate ? `${draft.endDate}T00:00:00` : null,
        }),
      );
    },
    async moveIssue(id, from, to) {
      if (from === to) return;
      if (from !== null && to !== null)
        throw new Error('Đưa công việc về backlog trước khi chuyển sang sprint khác.');
      await perform(
        () =>
          to === null
            ? apiClient.delete(`/sprints/${from}/issues/${id}`)
            : apiClient.post(`/sprints/${to}/issues/${id}`),
        (current) => movedPlanning(current, id, from, to),
      );
    },
    async reorder(group, ids) {
      await perform(
        () =>
          apiClient.put(
            group === null ? `/projects/${projectId}/backlog/order` : `/sprints/${group}/issues/order`,
            { issueIds: ids },
          ),
        (current) => orderedPlanning(current, group, ids),
      );
    },
    async startSprint(id) {
      await perform(() => apiClient.put(`/sprints/${id}/start`));
    },
    async completeSprint(id, target) {
      await perform(() =>
        apiClient.put(`/sprints/${id}/complete`, null, {
          params: target === null ? {} : { moveToSprintId: target },
        }),
      );
    },
    async editIssue(id, edit) {
      await perform(() =>
        apiClient.put(`/issues/${id}`, { description: edit.description, storyPoints: edit.points }),
      );
    },
  };
  return (
    <PlanningShell
      projectId={projectId}
      projectName={query.data?.projectName ?? 'Dự án'}
      projectKey={query.data?.projectKey ?? '…'}
    >
      {query.isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center gap-3 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={20} />
          Đang tải kế hoạch sprint…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 p-8 text-center"
        >
          <h1 className="mb-3 text-lg font-semibold">Chưa tải được backlog</h1>
          <p className="mb-5 text-sm leading-6 text-slate-500">{getApiErrorMessage(query.error)}</p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            <RefreshCw size={15} />
            Thử lại
          </Button>
        </div>
      ) : (
        query.data && <BacklogView data={query.data} actions={actions} busy={busy} />
      )}
    </PlanningShell>
  );
}
