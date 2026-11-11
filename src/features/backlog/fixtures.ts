import type { PlanningData, PlanningIssue } from './types';

/** Fixture chỉ cấp cho trang /ui-review ở development; trang project thật không dùng dữ liệu này. */
function issue(
  id: number,
  title: string,
  type: string,
  status: string,
  points: number,
  assignee: string | null,
  priority = 'MEDIUM',
): PlanningIssue {
  return {
    id,
    key: `SCR-${id}`,
    title,
    type,
    status,
    points,
    assignee,
    assigneeId: assignee ? (id % 4) + 1 : null,
    priority,
    version: 0,
    description:
      'Xây dựng trải nghiệm rõ ràng, dễ sử dụng cho thành viên trong dự án.\n\nTiêu chí hoàn thành:\n• Hiển thị đúng dữ liệu và quyền truy cập.\n• Có phản hồi khi tải, khi lỗi và khi thành công.\n• Hoạt động tốt trên desktop và điện thoại.',
  };
}

export const planningFixture: PlanningData = {
  projectId: 1,
  projectKey: 'SCR',
  projectName: 'Hệ thống quản lý dự án',
  issueTypes: [
    { id: 1, name: 'Story', isDefault: true },
    { id: 2, name: 'Task', isDefault: false },
    { id: 3, name: 'Bug', isDefault: false },
  ],
  sprints: [
    {
      id: 101,
      name: 'Sprint 03',
      goal: 'Hoàn thiện trải nghiệm quản lý công việc và cộng tác trong nhóm.',
      state: 'ACTIVE',
      startDate: '2026-11-09',
      endDate: '2026-11-22',
      issues: [
        issue(
          24,
          'Thiết kế màn hình backlog và lập kế hoạch sprint',
          'Story',
          'Đang thực hiện',
          8,
          'Minh Anh',
          'HIGH',
        ),
        issue(25, 'Xây dựng luồng tạo và cập nhật công việc', 'Task', 'Đang thực hiện', 5, 'Hoàng Nam'),
        issue(26, 'Sửa lỗi bộ lọc không giữ trạng thái khi tải lại', 'Bug', 'Cần làm', 3, 'Thu Hà', 'HIGH'),
        issue(27, 'Bổ sung kiểm thử phân quyền thành viên dự án', 'Task', 'Hoàn thành', 3, 'Quốc Bảo'),
      ],
    },
    {
      id: 102,
      name: 'Sprint 04',
      goal: 'Thông báo và báo cáo tiến độ dự án.',
      state: 'FUTURE',
      startDate: '2026-11-23',
      endDate: '2026-12-06',
      issues: [
        issue(31, 'Thông báo khi được giao công việc mới', 'Story', 'Cần làm', 5, 'Thu Hà'),
        issue(32, 'Hiển thị báo cáo tổng kết sprint', 'Story', 'Cần làm', 8, 'Minh Anh'),
      ],
    },
  ],
  backlog: [
    issue(35, 'Tải lên và xem tệp đính kèm trong công việc', 'Story', 'Cần làm', 5, 'Hoàng Nam', 'HIGH'),
    issue(36, 'Thêm bình luận và lịch sử hoạt động', 'Story', 'Cần làm', 5, null),
    issue(37, 'Cải thiện giao diện trên thiết bị di động', 'Task', 'Cần làm', 3, 'Minh Anh'),
    issue(38, 'Cấu hình giới hạn công việc cho từng cột', 'Task', 'Cần làm', 3, 'Quốc Bảo'),
    issue(39, 'Tìm kiếm công việc theo mã và tiêu đề', 'Story', 'Cần làm', 5, null, 'LOW'),
  ],
};
