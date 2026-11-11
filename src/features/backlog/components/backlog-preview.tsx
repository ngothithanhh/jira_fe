'use client';

import { useState } from 'react';
import { planningFixture } from '../fixtures';
import { movedPlanning, orderedPlanning } from '../model';
import type { PlanningActions, PlanningData } from '../types';
import { BacklogView } from './backlog-view';
import { PlanningShell } from './planning-shell';

/** Preview dùng state bộ nhớ, không API/localStorage; reload sẽ trả fixture để không lẫn với dữ liệu thật. */
export function BacklogPreview() {
  const [data, setData] = useState<PlanningData>(() => structuredClone(planningFixture));
  const actions: PlanningActions = {
    async createIssue(draft) {
      const title = draft.title.trim();
      if (!title) throw new Error('Vui lòng nhập tên công việc.');
      setData((current) => {
        const id =
          Math.max(
            0,
            ...current.backlog.map((issue) => issue.id),
            ...current.sprints.flatMap((sprint) => sprint.issues.map((issue) => issue.id)),
          ) + 1;
        return {
          ...current,
          backlog: [
            ...current.backlog,
            {
              id,
              key: `${current.projectKey}-${id}`,
              title,
              type: current.issueTypes.find((type) => type.id === draft.typeId)?.name ?? 'Task',
              priority: draft.priority,
              status: 'Cần làm',
              description: '',
              points: 0,
              assignee: null,
              assigneeId: null,
              version: 0,
            },
          ],
        };
      });
    },
    async createSprint(draft) {
      validateSprintDates(draft.startDate, draft.endDate);
      if (!draft.name.trim()) throw new Error('Vui lòng nhập tên sprint.');
      setData((current) => ({
        ...current,
        sprints: [
          ...current.sprints,
          {
            id: Math.max(100, ...current.sprints.map((sprint) => sprint.id)) + 1,
            name: draft.name.trim(),
            goal: draft.goal.trim(),
            startDate: draft.startDate || null,
            endDate: draft.endDate || null,
            state: 'FUTURE',
            issues: [],
          },
        ],
      }));
    },
    async moveIssue(id, from, to) {
      const next = movedPlanning(data, id, from, to);
      setData(next);
    },
    async reorder(group, ids) {
      const next = orderedPlanning(data, group, ids);
      setData(next);
    },
    async startSprint(id) {
      if (data.sprints.some((sprint) => sprint.state === 'ACTIVE'))
        throw new Error('Hãy hoàn tất sprint đang diễn ra trước.');
      setData((current) => ({
        ...current,
        sprints: current.sprints.map((sprint) =>
          sprint.id === id ? { ...sprint, state: 'ACTIVE' } : sprint,
        ),
      }));
    },
    async completeSprint(id, target) {
      const unfinished =
        data.sprints
          .find((sprint) => sprint.id === id)
          ?.issues.filter((issue) => !/^(done|completed|hoàn thành|đã hoàn thành)$/i.test(issue.status)) ??
        [];
      setData((current) => ({
        ...current,
        backlog: target === null ? [...current.backlog, ...unfinished] : current.backlog,
        sprints: current.sprints
          .filter((sprint) => sprint.id !== id)
          .map((sprint) =>
            sprint.id === target ? { ...sprint, issues: [...sprint.issues, ...unfinished] } : sprint,
          ),
      }));
    },
    async editIssue(id, edit) {
      const update = (issues: PlanningData['backlog']) =>
        issues.map((issue) =>
          issue.id === id ? { ...issue, description: edit.description, points: edit.points } : issue,
        );
      setData((current) => ({
        ...current,
        backlog: update(current.backlog),
        sprints: current.sprints.map((sprint) => ({ ...sprint, issues: update(sprint.issues) })),
      }));
    },
  };
  return (
    <PlanningShell
      projectName={data.projectName}
      projectKey={data.projectKey}
      projectId={data.projectId}
      review
    >
      <BacklogView data={data} actions={actions} />
    </PlanningShell>
  );
}

/** Kiểm trước HTTP hoặc state update; ngày kết thúc phải sau ngày bắt đầu khi có đủ hai ngày. */
export function validateSprintDates(start: string, end: string) {
  if (start && end && new Date(start).getTime() >= new Date(end).getTime())
    throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
}
