import type { PlanningData, PlanningIssue } from './types';

/** ID là issues.issue_id, không phải issue_number. DTO thiếu user/parent vẫn giữ null đúng nghĩa. */
export function mapPlanningIssue(dto: IssueDto): PlanningIssue {
  return {
    id: dto.issueId,
    key: dto.issueKey,
    title: dto.summary,
    description: dto.description ?? '',
    type: dto.issueTypeName ?? 'Task',
    status: dto.statusName ?? 'Chưa có trạng thái',
    priority: dto.priority ?? 'MEDIUM',
    points: dto.storyPoints ?? 0,
    assignee: dto.assigneeName ?? null,
    assigneeId: dto.assigneeId ?? null,
    version: dto.version ?? null,
  };
}

export type IssueDto = {
  issueId: number;
  issueKey: string;
  summary: string;
  description?: string | null;
  issueTypeName?: string | null;
  statusName?: string | null;
  priority?: string | null;
  storyPoints?: number;
  assigneeName?: string | null;
  assigneeId?: number | null;
  version?: number | null;
};

/** Chỉ đổi thứ tự của một nhóm trên bản sao; không sửa cache cũ để có thể rollback khi HTTP lỗi. */
export function orderedPlanning(data: PlanningData, group: number | null, ids: number[]): PlanningData {
  const current =
    group === null ? data.backlog : (data.sprints.find((sprint) => sprint.id === group)?.issues ?? []);
  const byId = new Map(current.map((issue) => [issue.id, issue]));
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new Error('Danh sách đã thay đổi. Vui lòng tải lại backlog.');
  }
  const ordered = ids.map((id) => byId.get(id)!);
  return group === null
    ? { ...data, backlog: ordered }
    : {
        ...data,
        sprints: data.sprints.map((sprint) =>
          sprint.id === group ? { ...sprint, issues: ordered } : sprint,
        ),
      };
}

/** Product↔sprint là một API link; không tạo chuỗi gỡ/thêm hai sprint có nguy cơ lưu dở. */
export function movedPlanning(
  data: PlanningData,
  issueId: number,
  from: number | null,
  to: number | null,
): PlanningData {
  if (from === to) return data;
  if (from !== null && to !== null)
    throw new Error('Đưa công việc về backlog trước khi chuyển sang sprint khác.');
  const source =
    from === null ? data.backlog : (data.sprints.find((sprint) => sprint.id === from)?.issues ?? []);
  const issue = source.find((item) => item.id === issueId);
  if (!issue || (to !== null && !data.sprints.some((sprint) => sprint.id === to)))
    throw new Error('Không tìm thấy công việc hoặc sprint.');
  return {
    ...data,
    backlog: from === null ? data.backlog.filter((item) => item.id !== issueId) : [...data.backlog, issue],
    sprints: data.sprints.map((sprint) =>
      sprint.id === from
        ? { ...sprint, issues: sprint.issues.filter((item) => item.id !== issueId) }
        : sprint.id === to
          ? { ...sprint, issues: [...sprint.issues, issue] }
          : sprint,
    ),
  };
}
