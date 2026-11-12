import type { PlanningIssue } from '../../backlog/types';
export type Category = 'TO_DO' | 'IN_PROGRESS' | 'DONE';
export type StatusDto = { statusId: number; statusName: string; statusCategory: Category };
export type TypeDto = { issueTypeId: number; issueTypeName: string; isDefault: boolean };
export type MemberDto = { userId: number; userName: string; fullName: string | null };
export type References = { statuses: StatusDto[]; types: TypeDto[]; members: MemberDto[] };
export type IssueDto = {
  issueId: number; issueKey: string; projectId: number; projectKey: string; version: number | null;
  summary: string; description: string | null; priority: string | null; storyPoints: number;
  statusId: number; statusName: string; issueTypeId: number; issueTypeName: string;
  assigneeId: number | null; assigneeName: string | null; reporterId: number | null; reporterName: string | null;
  parentIssueId: number | null; createdAt: string; updatedAt: string;
};
export type IssuePage = { items: IssueDto[]; page: number; size: number; totalItems: number; totalPages: number };
export type SprintDto = { sprintId: number; projectId: number; sprintName: string; goal: string | null;
  state: 'FUTURE' | 'ACTIVE' | 'CLOSED'; startDate: string | null; endDate: string | null };
export type Filters = { keyword: string; statusId: string; typeId: string; assignee: string; priority: string; page: number; size: number; sort: string; direction: string };
export const initialFilters: Filters = { keyword: '', statusId: '', typeId: '', assignee: '', priority: '', page: 0, size: 20, sort: 'createdAt', direction: 'DESC' };

/** FE dùng trang 0 từ API; người chưa phân công không được biến thành assigneeId=0. */
export function searchQuery(filters: Filters) {
  const q = new URLSearchParams({ page: String(filters.page), size: String(filters.size), sort: filters.sort, direction: filters.direction });
  for (const k of ['keyword','statusId','typeId','priority'] as const) if (filters[k].trim()) q.set(k, filters[k].trim());
  if (filters.assignee === 'unassigned') q.set('unassigned','true');
  else if (filters.assignee) q.set('assigneeId', filters.assignee);
  return q.toString();
}

/** Giữ ID/nullable của API; DONE lấy category theo statusId, không đoán từ tên người dùng đặt. */
export function planningIssue(issue: IssueDto, statuses: StatusDto[]): PlanningIssue {
  const status = statuses.find((s) => s.statusId === issue.statusId);
  if (!status) throw new Error('Thiếu cấu hình trạng thái. Vui lòng tải lại.');
  return { id: issue.issueId, key: issue.issueKey, title: issue.summary, description: issue.description ?? '', type: issue.issueTypeName,
    status: issue.statusName, statusCategory: status.statusCategory, priority: issue.priority ?? 'MEDIUM', points: issue.storyPoints,
    assignee: issue.assigneeName, assigneeId: issue.assigneeId, version: issue.version };
}

/** DTO phải thuộc dự án đang mở, tránh cache/detail nhầm ID khi thay URL hoặc dữ liệu upstream sai. */
export function assertProject(issue: { projectId: number }, projectId: number) {
  if (issue.projectId !== projectId) throw new Error('Dữ liệu không thuộc dự án đang mở.');
}
