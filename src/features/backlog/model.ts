import type { PlanningData, PlanningIssue } from './types';

// Chỉ dùng trong bộ trang duyệt; đây không phải workflow hoặc cấu hình board lấy từ backend.
export const reviewBoardStatuses = ['Cần làm', 'Đang thực hiện', 'Hoàn thành'] as const;

/** Kéo card review chỉ sửa sprint ACTIVE đã chọn, giữ issue của các sprint khác và snapshot đầu vào. */
export function moveReviewCard(data: PlanningData, sprintId: number, id: number, status: string, position: number): PlanningData {
  const sprint = data.sprints.find(item => item.id === sprintId && item.state === 'ACTIVE');
  const selected = sprint?.issues.find(issue => issue.id === id);
  if (!sprint || !selected || !reviewBoardStatuses.some(value => value === status)) throw new Error('Không tìm thấy card hoặc cột trong sprint đang diễn ra.');
  const remaining = sprint.issues.filter(issue => issue.id !== id);
  const target = remaining.filter(issue => issue.status === status);
  if (!Number.isInteger(position) || position < 0 || position > target.length) throw new Error('Vị trí card không hợp lệ.');
  target.splice(position,0,{...selected,status,version:(selected.version ?? 0)+1});
  const ordered = reviewBoardStatuses.flatMap(column => column === status ? target : remaining.filter(issue => issue.status === column));
  // Status lạ từ fixture mới vẫn được giữ trong state; không làm mất issue ngoài ba cột mẫu.
  ordered.push(...remaining.filter(issue => !reviewBoardStatuses.some(value => value === issue.status)));
  return {...data,sprints:data.sprints.map(item => item.id === sprintId ? {...item,issues:ordered} : item)};
}

/** Đổi tên/mô tả bằng state review. Key chỉ đọc, không đổi projectId hay các quan hệ issue. */
export function renamedReviewProject(data: PlanningData, name: string): PlanningData {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error('Tên dự án cần từ 1 đến 100 ký tự.');
  return {...data,projectName:trimmed};
}

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
