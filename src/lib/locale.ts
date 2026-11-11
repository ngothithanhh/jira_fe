// Translate built-in labels for display while preserving API values and custom names.
const labels: Record<string, string> = {
  BACKLOG: 'Chờ xử lý', TODO: 'Cần làm', TO_DO: 'Cần làm', UNKNOWN: 'Không xác định',
  IN_PROGRESS: 'Đang thực hiện', IN_REVIEW: 'Đang xét duyệt', DONE: 'Hoàn thành',
  HIGHEST: 'Cao nhất', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp', LOWEST: 'Thấp nhất',
  ADMIN: 'Quản trị viên', ADMINISTRATOR: 'Quản trị viên', MEMBER: 'Thành viên',
  PM: 'Quản lý dự án', PROJECT_MANAGER: 'Quản lý dự án',
  TASK: 'Công việc', BUG: 'Lỗi', STORY: 'Yêu cầu', EPIC: 'Hạng mục lớn', SUBTASK: 'Công việc con',
};

export function localizeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return labels[value.trim().replace(/[ -]+/g, '_').toUpperCase()] || value;
}
