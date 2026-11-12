import type { ProjectDraft, ProjectListItem } from '../../../components/project-ui/project-views';

export type ProjectDto = {
  projectId: number; projectName: string; projectKey: string; description: string | null;
  leader: { id: number; userName: string; email: string } | null;
  issueCount: number; memberCount: number; sprintCount: number; activeSprintName: string | null;
};

/** Giữ ID projects thật và số liệu máy chủ; trường count thiếu không được tự biến thành 0. */
export function projectItem(dto: ProjectDto): ProjectListItem {
  return { id: dto.projectId, name: dto.projectName, key: dto.projectKey, description: dto.description ?? '',
    leaderName: dto.leader?.userName ?? null, issueCount: dto.issueCount, memberCount: dto.memberCount, activeSprintName: dto.activeSprintName };
}

/** Kiểm form theo giới hạn projects; không tự đổi key cũ hoặc cấp lead/quyền từ browser. */
export function projectErrors(draft: ProjectDraft, creating: boolean) {
  const errors: Record<string, string> = {};
  if (!draft.name.trim() || draft.name.length > 100) errors.name = 'Tên dự án cần từ 1 đến 100 ký tự.';
  if (creating && (!draft.key.trim() || draft.key.length > 10)) errors.key = 'Mã dự án cần từ 1 đến 10 ký tự.';
  if (draft.description.length > 255) errors.description = 'Mô tả dự án tối đa 255 ký tự.';
  return errors;
}

/** Chuẩn hóa form thành DTO ghi; key chỉ có lúc tạo, mọi ID/lead và trường thống kê đều không được gửi. */
export function projectPayload(draft: ProjectDraft, creating: boolean) {
  return { projectName: draft.name.trim(), description: draft.description, ...(creating ? { projectKey: draft.key.trim() } : {}) };
}

/** ID từ route phải vừa int của backend; invalid route dừng ở 404, không đổi thành project đầu tiên. */
export function projectIdFromRoute(value: string) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 ? Number(value) : null;
}
