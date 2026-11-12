export const overviewLabels = {
  users: 'Người dùng',
  enabledUsers: 'Tài khoản đang hoạt động',
  enabledAdmins: 'Quản trị viên đang hoạt động',
  projects: 'Dự án',
  issues: 'Công việc',
  activeSprints: 'Sprint đang chạy',
  closedSprints: 'Sprint đã đóng',
} as const;

export type OverviewField = keyof typeof overviewLabels;
export const overviewFields = Object.keys(overviewLabels) as OverviewField[];
type AdminOverview = Record<OverviewField, number>;

/** Kiểm đủ số đếm từ API. Chỉ hiển thị 0 khi backend trả đúng giá trị 0. */
export function parseAdminOverview(value: unknown): AdminOverview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dữ liệu tổng quan không hợp lệ.');
  }
  const fields = value as Record<string, unknown>;
  const counts = overviewFields.map((field) => {
    const count = fields[field];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Dữ liệu tổng quan thiếu chỉ số hoặc có chỉ số không hợp lệ.');
    }
    return [field, count] as const;
  });
  return Object.fromEntries(counts) as AdminOverview;
}
