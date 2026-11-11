import type {
  AuditEvent,
  DemoIssue,
  DemoState,
  PermissionCode,
  Priority,
  RolePermission,
  SprintIssue,
} from './types';

/**
 * Seed của bộ giao diện mẫu. Mỗi lần gọi trả bản mới để reset không dính tham chiếu cũ.
 * Dữ liệu được dựng để duyệt các tình huống: project rỗng, project không phải thành viên,
 * user bị khóa, status DONE tên tùy chỉnh, cột WIP đã đầy, status chưa map cột,
 * sprint CLOSED có/không có snapshot, comment legacy không tác giả và inbox trỏ tới issue đã xóa.
 * Không chứa tài khoản, mật khẩu hoặc token thật.
 */

// ID người dùng mẫu; dùng hằng số để test và tài liệu dẫn đúng persona.
export const DEMO_USER = { admin: 1, pm: 2, dev: 3, dev2: 4, dev3: 5, disabled: 6, outsider: 7 } as const;
export const DEMO_PROJECT = { scr: 1, empty: 2, mobile: 3 } as const;

const ALL_PERMISSIONS: PermissionCode[] = [
  'VIEW_PROJECT',
  'CREATE_PROJECT',
  'EDIT_PROJECT',
  'DELETE_PROJECT',
  'ADD_MEMBER',
  'CREATE_ISSUE',
  'EDIT_ISSUE',
  'DELETE_ISSUE',
  'MANAGE_SPRINT',
  'MANAGE_BOARD',
  'MANAGE_CONFIG',
  'MANAGE_USERS',
  'VIEW_AUDIT',
];

const ROLE_PERMISSIONS: Record<number, PermissionCode[]> = {
  1: ALL_PERMISSIONS,
  2: ['CREATE_PROJECT'],
  3: [
    'VIEW_PROJECT',
    'EDIT_PROJECT',
    'DELETE_PROJECT',
    'ADD_MEMBER',
    'CREATE_ISSUE',
    'EDIT_ISSUE',
    'DELETE_ISSUE',
    'MANAGE_SPRINT',
    'MANAGE_BOARD',
  ],
  4: ['VIEW_PROJECT', 'CREATE_ISSUE', 'EDIT_ISSUE'],
  5: ['VIEW_PROJECT'],
};

const LONG_DESCRIPTION =
  'Xây dựng trải nghiệm rõ ràng, dễ sử dụng cho thành viên trong dự án.\n\nTiêu chí hoàn thành:\n• Hiển thị đúng dữ liệu và quyền truy cập.\n• Có phản hồi khi tải, khi lỗi và khi thành công.\n• Hoạt động tốt trên desktop và điện thoại.';

type IssueSeed = [
  number, // projectId
  number, // number
  string, // title
  number, // typeId
  number, // statusId
  number | null, // points
  number | null, // assigneeId
  Priority,
  string?, // description
  number?, // parentId (issue id)
];

// ID issue = projectId * 100 + number để đọc fixture dễ; issue tạo mới dùng nextId.
const ISSUE_SEEDS: IssueSeed[] = [
  // Sprint 00 (CLOSED, dữ liệu cũ không có snapshot)
  [1, 1, 'Khởi tạo cấu trúc dự án và quy ước đặt tên', 2, 5, 2, 2, 'MEDIUM'],
  [1, 2, 'Thiết lập đăng nhập bằng email', 1, 5, 5, 3, 'HIGH'],
  [1, 3, 'Trang hồ sơ người dùng', 1, 5, 3, 4, 'MEDIUM'],
  [1, 4, 'Lỗi không lưu được tên hiển thị có dấu', 3, 5, 1, 5, 'HIGH'],
  // Sprint 01 (CLOSED, có snapshot)
  [1, 5, 'Tạo và chỉnh sửa dự án', 1, 5, 5, 2, 'HIGH'],
  [1, 6, 'Quản lý thành viên dự án', 1, 5, 5, 3, 'MEDIUM'],
  [1, 7, 'Danh mục loại công việc', 2, 5, 3, 4, 'MEDIUM'],
  [1, 8, 'Danh mục trạng thái và workflow', 2, 5, 3, 5, 'MEDIUM'],
  [1, 9, 'Lỗi trùng mã dự án khi khác hoa thường', 3, 5, 2, 3, 'HIGHEST'],
  [1, 10, 'Màn hình danh sách công việc cơ bản', 1, 4, 3, 4, 'MEDIUM'],
  [1, 11, 'Phân quyền theo vai trò dự án', 1, 5, 5, 2, 'HIGH'],
  [1, 12, 'Kéo thả sắp xếp backlog', 1, 5, 5, 3, 'MEDIUM'],
  // Sprint 02 (CLOSED, có snapshot)
  [1, 13, 'Tạo sprint và đặt mục tiêu', 1, 5, 3, 2, 'MEDIUM'],
  [1, 14, 'Bắt đầu và hoàn tất sprint', 1, 5, 5, 3, 'HIGH'],
  [1, 15, 'Cấu hình cột của bảng công việc', 2, 5, 3, 5, 'MEDIUM'],
  [1, 16, 'Giới hạn WIP cho từng cột', 2, 4, 3, 4, 'LOW'],
  [1, 17, 'Lỗi mất thứ tự sau khi tải lại trang', 3, 5, 2, 3, 'HIGH'],
  [1, 18, 'Lịch sử thay đổi trạng thái công việc', 2, 5, 3, 5, 'MEDIUM'],
  [1, 19, 'Gửi thông báo khi có bình luận mới', 1, 5, 3, 4, 'MEDIUM'],
  [1, 23, 'Xuất danh sách công việc ra tệp CSV', 2, 1, 3, null, 'LOW', ''],
  // Sprint 03 (ACTIVE)
  [1, 24, 'Thiết kế màn hình backlog và lập kế hoạch sprint', 1, 2, 8, 2, 'HIGH', LONG_DESCRIPTION],
  [1, 25, 'Xây dựng luồng tạo và cập nhật công việc', 2, 3, 5, 3, 'MEDIUM'],
  [1, 26, 'Sửa lỗi bộ lọc không giữ trạng thái khi tải lại', 3, 1, 3, 4, 'HIGH'],
  [1, 27, 'Bổ sung kiểm thử phân quyền thành viên dự án', 2, 4, 3, 5, 'MEDIUM'],
  [1, 28, 'Tối ưu truy vấn danh sách công việc', 2, 5, 2, 3, 'MEDIUM'],
  [1, 29, 'Lỗi hiển thị avatar khi tên người dùng quá dài', 3, 1, 1, null, 'LOW', ''],
  [1, 30, 'Viết hướng dẫn sử dụng nhanh cho thành viên mới', 2, 6, 2, 4, 'LOWEST'],
  [1, 41, 'Vẽ khung giao diện backlog cho điện thoại', 4, 1, 1, 2, 'MEDIUM', '', 124],
  // Sprint 04 (FUTURE)
  [1, 31, 'Thông báo khi được giao công việc mới', 1, 1, 5, 4, 'MEDIUM'],
  [1, 32, 'Hiển thị báo cáo tổng kết sprint', 1, 1, 8, 2, 'HIGH'],
  [1, 33, 'Trang quản trị người dùng và vai trò hệ thống', 1, 1, 5, null, 'MEDIUM'],
  // Product backlog
  [1, 35, 'Tải lên và xem tệp đính kèm trong công việc', 1, 1, 5, 3, 'HIGH'],
  [1, 36, 'Thêm bình luận và lịch sử hoạt động', 1, 1, 5, null, 'MEDIUM'],
  [1, 37, 'Cải thiện giao diện trên thiết bị di động', 2, 1, 3, 2, 'MEDIUM'],
  [1, 38, 'Cấu hình giới hạn công việc cho từng cột', 2, 1, 3, 5, 'MEDIUM'],
  [1, 39, 'Tìm kiếm công việc theo mã và tiêu đề', 1, 1, 5, null, 'LOW'],
  [
    1,
    42,
    'Cho phép lọc công việc theo nhiều người phụ trách cùng lúc và lưu bộ lọc thành chế độ xem riêng của từng thành viên',
    1,
    1,
    null,
    null,
    'LOWEST',
    '',
  ],
  [1, 43, 'Lỗi biểu đồ burndown lệch múi giờ', 3, 1, 2, 4, 'HIGHEST'],
  [1, 44, 'Ghi chú phát hành cho phiên bản đầu tiên', 2, 6, 1, 2, 'LOW'],
  [1, 45, 'Kiểm tra truy cập bằng bàn phím trên bảng công việc', 2, 1, 3, 5, 'MEDIUM'],
  // Project MOB (người dùng 3 không phải thành viên)
  [3, 1, 'Màn hình đăng nhập ứng dụng di động', 1, 2, 5, 7, 'HIGH'],
  [3, 2, 'Nhận thông báo đẩy khi được giao việc', 2, 1, 3, 5, 'MEDIUM'],
  [3, 3, 'Lỗi bàn phím che ô nhập trên Android', 3, 1, 2, null, 'HIGH'],
];

const at = (day: string, time = '09:00') => `2026-${day}T${time}:00.000Z`;

function buildIssues(): DemoIssue[] {
  return ISSUE_SEEDS.map(([projectId, number, title, typeId, statusId, points, assigneeId, priority, description, parentId]) => {
    const key = projectId === 1 ? 'SCR' : projectId === 3 ? 'MOB' : 'MKT';
    return {
      id: projectId * 100 + number,
      projectId,
      number,
      key: `${key}-${number}`,
      title,
      description: description ?? 'Mô tả ngắn gọn phạm vi công việc và tiêu chí nghiệm thu.',
      typeId,
      statusId,
      priority,
      points,
      assigneeId,
      reporterId: projectId === 3 ? 7 : 2,
      parentId: parentId ?? null,
      createdAt: at('10-01'),
      updatedAt: at(number > 23 ? '11-10' : '10-20', '10:00'),
      version: number % 3,
    };
  });
}

function links(sprintId: number, numbers: number[], addedAt: string): SprintIssue[] {
  return numbers.map((n, index) => ({ sprintId, issueId: 100 + n, position: index, addedAt }));
}

export function createSeed(): DemoState {
  const rolePermissions: RolePermission[] = Object.entries(ROLE_PERMISSIONS).flatMap(([roleId, codes]) =>
    codes.map((code) => ({ roleId: Number(roleId), code })),
  );
  const audit: AuditEvent[] = [
    [1, null, 'SYSTEM_SEED', 'SYSTEM', 0, null, 'Khởi tạo dữ liệu mẫu', '09-20'],
    [2, 1, 'PROJECT_CREATED', 'PROJECT', 1, 1, 'Tạo dự án SCR', '09-25'],
    [3, 2, 'SPRINT_COMPLETED', 'SPRINT', 101, 1, 'Hoàn tất Sprint 00 (dữ liệu cũ)', '10-11'],
    [4, 2, 'SPRINT_COMPLETED', 'SPRINT', 102, 1, 'Hoàn tất Sprint 01', '10-25'],
    [5, 2, 'SPRINT_COMPLETED', 'SPRINT', 103, 1, 'Hoàn tất Sprint 02', '11-08'],
    [6, 2, 'SPRINT_STARTED', 'SPRINT', 104, 1, 'Bắt đầu Sprint 03', '11-09'],
    [7, 1, 'USER_DISABLED', 'USER', 6, null, 'Khóa tài khoản lanchi', '11-02'],
    [8, 2, 'MEMBER_ADDED', 'MEMBER', 5, 1, 'Thêm Đỗ Quốc Bảo vào SCR với vai trò DEVELOPER', '10-02'],
    [9, 3, 'ISSUE_STATUS_CHANGED', 'ISSUE', 125, 1, 'SCR-25: Đang thực hiện → Đang review', '11-11'],
    [10, 5, 'ISSUE_STATUS_CHANGED', 'ISSUE', 127, 1, 'SCR-27: Đang review → Đã nghiệm thu', '11-12'],
    [11, 2, 'ISSUE_DELETED', 'ISSUE', 134, 1, 'Xóa SCR-34 (trùng nội dung)', '11-05'],
    [12, 1, 'PROJECT_CREATED', 'PROJECT', 3, 3, 'Tạo dự án MOB', '10-15'],
    [13, 2, 'PROJECT_CREATED', 'PROJECT', 2, 2, 'Tạo dự án MKT rỗng', '11-06'],
    [14, null, 'SPRINT_SNAPSHOT', 'SPRINT', 104, 1, 'Ghi điểm burndown tự động', '11-12'],
  ].map(([id, actorId, action, entityType, entityId, projectId, detail, day]) => ({
    id: id as number,
    actorId: actorId as number | null,
    action: action as string,
    entityType: entityType as string,
    entityId: entityId as number,
    projectId: projectId as number | null,
    detail: detail as string,
    createdAt: at(day as string, '08:30'),
  }));

  return {
    session: { userId: DEMO_USER.pm },
    nextId: 1000,
    users: [
      [1, 'quantri', 'Lê Quản Trị', 'admin@demo.vn', true],
      [2, 'minhanh', 'Nguyễn Minh Anh', 'minhanh@demo.vn', true],
      [3, 'hoangnam', 'Trần Hoàng Nam', 'hoangnam@demo.vn', true],
      [4, 'thuha', 'Phạm Thu Hà', 'thuha@demo.vn', true],
      [5, 'quocbao', 'Đỗ Quốc Bảo', 'quocbao@demo.vn', true],
      [6, 'lanchi', 'Vũ Lan Chi', 'lanchi@demo.vn', false],
      [7, 'vankhoa', 'Bùi Văn Khoa', 'vankhoa@demo.vn', true],
    ].map(([id, userName, fullName, email, enabled]) => ({
      id: id as number,
      userName: userName as string,
      fullName: fullName as string,
      email: email as string,
      enabled: enabled as boolean,
      avatarUrl: null,
      createdAt: at('09-20'),
    })),
    projects: [
      {
        id: 1,
        key: 'SCR',
        name: 'Hệ thống quản lý dự án',
        description: 'Quản lý công việc, sprint và tiến độ phát triển phần mềm.',
        leadId: 2,
        issueSequence: 45,
        createdAt: at('09-25'),
      },
      {
        id: 2,
        key: 'MKT',
        name: 'Website giới thiệu sản phẩm',
        description: '',
        leadId: 2,
        issueSequence: 0,
        createdAt: at('11-06'),
      },
      {
        id: 3,
        key: 'MOB',
        name: 'Ứng dụng di động',
        description: 'Ứng dụng di động cho thành viên theo dõi công việc.',
        leadId: 7,
        issueSequence: 3,
        createdAt: at('10-15'),
      },
    ],
    issues: buildIssues(),
    sprints: [
      [101, 'Sprint 00', 'Nền tảng tài khoản.', 'CLOSED', '09-28', '10-11'],
      [102, 'Sprint 01', 'Quản lý dự án và thành viên.', 'CLOSED', '10-12', '10-25'],
      [103, 'Sprint 02', 'Sprint và bảng công việc.', 'CLOSED', '10-26', '11-08'],
      [104, 'Sprint 03', 'Hoàn thiện trải nghiệm quản lý công việc và cộng tác trong nhóm.', 'ACTIVE', '11-09', '11-22'],
      [105, 'Sprint 04', 'Thông báo và báo cáo tiến độ dự án.', 'FUTURE', '11-23', '12-06'],
    ].map(([id, name, goal, state, start, end]) => ({
      id: id as number,
      projectId: 1,
      name: name as string,
      goal: goal as string,
      state: state as 'FUTURE' | 'ACTIVE' | 'CLOSED',
      startDate: `2026-${start}`,
      endDate: `2026-${end}`,
      startedAt: state === 'FUTURE' ? null : at(start as string),
      completedAt: state === 'CLOSED' ? at(end as string, '17:00') : null,
      createdAt: at('09-26'),
    })),
    boards: [
      { id: 201, projectId: 1, name: 'Bảng SCR' },
      { id: 202, projectId: 1, name: 'Bảng kiểm thử' },
      { id: 203, projectId: 3, name: 'Bảng MOB' },
    ],
    columns: [
      { id: 301, boardId: 201, name: 'Cần làm', position: 0, wipLimit: 0 },
      { id: 302, boardId: 201, name: 'Đang làm', position: 1, wipLimit: 2 },
      { id: 303, boardId: 201, name: 'Hoàn thành', position: 2, wipLimit: 0 },
      { id: 304, boardId: 202, name: 'Chờ kiểm thử', position: 0, wipLimit: 0 },
      { id: 305, boardId: 202, name: 'Đã kiểm thử', position: 1, wipLimit: 0 },
      { id: 306, boardId: 203, name: 'Cần làm', position: 0, wipLimit: 0 },
      { id: 307, boardId: 203, name: 'Đang làm', position: 1, wipLimit: 3 },
      { id: 308, boardId: 203, name: 'Xong', position: 2, wipLimit: 0 },
    ],
    statuses: [
      { id: 1, name: 'Cần làm', category: 'TO_DO', color: '#42526e' },
      { id: 2, name: 'Đang thực hiện', category: 'IN_PROGRESS', color: '#0052cc' },
      { id: 3, name: 'Đang review', category: 'IN_PROGRESS', color: '#6554c0' },
      // Tên tùy chỉnh nhưng category DONE: phát hiện code còn suy "hoàn thành" từ tên.
      { id: 4, name: 'Đã nghiệm thu', category: 'DONE', color: '#00875a' },
      { id: 5, name: 'Hoàn thành', category: 'DONE', color: '#00875a' },
      // Không map vào cột nào của Bảng SCR: board phải hiện nhóm "Chưa phân cột".
      { id: 6, name: 'Tạm hoãn', category: 'TO_DO', color: '#ff8b00' },
    ],
    issueTypes: [
      { id: 1, name: 'Story', description: 'Tính năng nhìn từ góc độ người dùng.', icon: 'story', color: '#36b37e' },
      { id: 2, name: 'Task', description: 'Công việc kỹ thuật cần hoàn thành.', icon: 'task', color: '#4c9aff' },
      { id: 3, name: 'Bug', description: 'Lỗi cần sửa.', icon: 'bug', color: '#de350b' },
      { id: 4, name: 'Sub-task', description: 'Phần việc con của một công việc khác.', icon: 'subtask', color: '#6b778c' },
    ],
    roles: [
      { id: 1, name: 'SYSTEM_ADMIN', scope: 'GLOBAL', reserved: true, description: 'Quản trị toàn hệ thống.' },
      { id: 2, name: 'PROJECT_CREATOR', scope: 'GLOBAL', reserved: false, description: 'Được tạo dự án mới.' },
      { id: 3, name: 'PROJECT_MANAGER', scope: 'PROJECT', reserved: false, description: 'Quản lý dự án; mỗi dự án tối đa một người.' },
      { id: 4, name: 'DEVELOPER', scope: 'PROJECT', reserved: false, description: 'Tạo và cập nhật công việc.' },
      { id: 5, name: 'VIEWER', scope: 'PROJECT', reserved: false, description: 'Chỉ xem dự án.' },
    ],
    permissions: [
      { code: 'VIEW_PROJECT', name: 'Xem dự án', description: 'Mở backlog, bảng, công việc và báo cáo.' },
      { code: 'CREATE_PROJECT', name: 'Tạo dự án', description: 'Tạo dự án mới và trở thành trưởng dự án.' },
      { code: 'EDIT_PROJECT', name: 'Sửa dự án', description: 'Đổi tên, mô tả và loại công việc của dự án.' },
      { code: 'DELETE_PROJECT', name: 'Xóa dự án', description: 'Xóa dự án và dữ liệu mẫu đi kèm.' },
      { code: 'ADD_MEMBER', name: 'Quản lý thành viên', description: 'Thêm, gỡ và đổi vai trò thành viên.' },
      { code: 'CREATE_ISSUE', name: 'Tạo công việc', description: 'Tạo công việc mới.' },
      { code: 'EDIT_ISSUE', name: 'Sửa công việc', description: 'Sửa, giao việc, kéo trên bảng, sửa bình luận người khác.' },
      { code: 'DELETE_ISSUE', name: 'Xóa công việc', description: 'Xóa công việc không còn việc con hoặc tệp.' },
      { code: 'MANAGE_SPRINT', name: 'Quản lý sprint', description: 'Tạo, bắt đầu, hoàn tất sprint và sắp xếp sprint backlog.' },
      { code: 'MANAGE_BOARD', name: 'Quản lý bảng', description: 'Tạo bảng, cột, WIP và ánh xạ trạng thái.' },
      { code: 'MANAGE_CONFIG', name: 'Cấu hình hệ thống', description: 'Loại công việc, trạng thái, workflow, vai trò.' },
      { code: 'MANAGE_USERS', name: 'Quản lý người dùng', description: 'Khóa/mở tài khoản và gán vai trò hệ thống.' },
      { code: 'VIEW_AUDIT', name: 'Xem nhật ký', description: 'Xem nhật ký kiểm tra và tổng quan hệ thống.' },
    ],
    memberships: [
      [1, 2, 3, '09-25'],
      [1, 3, 4, '10-01'],
      [1, 4, 4, '10-01'],
      [1, 5, 4, '10-02'],
      [1, 6, 5, '10-03'],
      [2, 2, 3, '11-06'],
      [3, 7, 3, '10-15'],
      [3, 5, 4, '10-16'],
    ].map(([projectId, userId, roleId, day]) => ({
      projectId: projectId as number,
      userId: userId as number,
      roleId: roleId as number,
      joinedAt: at(day as string),
    })),
    userRoles: [
      { userId: 1, roleId: 1, assignedAt: at('09-20') },
      { userId: 2, roleId: 2, assignedAt: at('09-20') },
      { userId: 7, roleId: 2, assignedAt: at('10-10') },
    ],
    rolePermissions,
    projectIssueTypes: [
      { projectId: 1, typeId: 1, isDefault: true },
      { projectId: 1, typeId: 2, isDefault: false },
      { projectId: 1, typeId: 3, isDefault: false },
      { projectId: 1, typeId: 4, isDefault: false },
      { projectId: 3, typeId: 2, isDefault: true },
      { projectId: 3, typeId: 3, isDefault: false },
    ],
    sprintIssues: [
      ...links(101, [1, 2, 3, 4], at('09-28')),
      ...links(102, [5, 6, 7, 8, 9, 10, 11, 12], at('10-12')),
      // SCR-12 chưa xong ở Sprint 01 nên được chuyển sang Sprint 02; link CLOSED cũ vẫn giữ lịch sử.
      ...links(103, [12, 13, 14, 15, 16, 17, 18, 19, 23], at('10-26')),
      ...links(104, [24, 25, 26, 27, 28, 29, 30], at('11-09')),
      { sprintId: 104, issueId: 141, position: null, addedAt: at('11-11') },
      ...links(105, [31, 32, 33], at('11-09')),
    ],
    backlogOrder: [{ projectId: 1, issueIds: [135, 136, 137, 138, 139, 123] }],
    boardRanks: [],
    columnStatuses: [
      { columnId: 301, statusId: 1 },
      { columnId: 302, statusId: 2 },
      { columnId: 302, statusId: 3 },
      { columnId: 303, statusId: 4 },
      { columnId: 303, statusId: 5 },
      { columnId: 304, statusId: 3 },
      { columnId: 305, statusId: 4 },
      { columnId: 306, statusId: 1 },
      { columnId: 307, statusId: 2 },
      { columnId: 307, statusId: 3 },
      { columnId: 308, statusId: 5 },
    ],
    workflowRules: [
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
      [3, 4],
      [3, 5],
      [2, 5],
      [4, 2],
      [5, 2],
      [1, 6],
      [6, 1],
    ].map(([fromStatusId, toStatusId], index) => ({ id: 401 + index, fromStatusId, toStatusId })),
    comments: [
      {
        id: 501,
        issueId: 124,
        authorId: 3,
        text: 'Mình đã xem bản phác thảo, phần nhóm sprint nên cho thu gọn được.',
        createdAt: at('11-10', '10:15'),
        updatedAt: null,
        version: 0,
      },
      {
        id: 502,
        issueId: 124,
        authorId: 2,
        text: 'Đồng ý, mình sẽ thêm nút thu gọn và hiện tổng story points ở tiêu đề nhóm.',
        createdAt: at('11-10', '11:02'),
        updatedAt: at('11-10', '11:20'),
        version: 1,
      },
      {
        id: 503,
        issueId: 124,
        authorId: null,
        text: 'Ghi chú chuyển từ hệ thống cũ: yêu cầu ban đầu nằm trong biên bản họp ngày 01/10.',
        createdAt: at('10-01', '08:00'),
        updatedAt: null,
        version: 0,
      },
      {
        id: 504,
        issueId: 125,
        authorId: 4,
        text: 'Form tạo công việc cần báo lỗi ngay tại trường khi bỏ trống tên.',
        createdAt: at('11-11', '14:40'),
        updatedAt: null,
        version: 0,
      },
    ],
    attachments: [
      {
        id: 601,
        issueId: 124,
        uploaderId: 2,
        name: 'yeu-cau-backlog.txt',
        size: 412,
        mime: 'text/plain',
        objectUrl: null,
        sampleText: 'Yêu cầu backlog (mẫu)\n- Nhóm theo sprint\n- Kéo thả sắp xếp\n- Tổng story points',
        createdAt: at('11-10', '09:00'),
      },
      {
        id: 602,
        issueId: 135,
        uploaderId: 3,
        name: 'ghi-chu-dinh-kem.txt',
        size: 128,
        mime: 'text/plain',
        objectUrl: null,
        sampleText: 'Giới hạn tệp và định dạng cần thống nhất với nhóm backend.',
        createdAt: at('11-08', '15:00'),
      },
    ],
    notifications: [
      [701, 2, 'ASSIGNED', 'Bạn được giao SCR-24', 'Thiết kế màn hình backlog và lập kế hoạch sprint', 1, 124, false, '11-09'],
      [702, 2, 'COMMENT', 'Trần Hoàng Nam bình luận SCR-24', 'Mình đã xem bản phác thảo, phần nhóm sprint…', 1, 124, false, '11-10'],
      [703, 2, 'SPRINT', 'Sprint 03 đã bắt đầu', 'Dự án Hệ thống quản lý dự án', 1, null, true, '11-09'],
      [704, 2, 'STATUS', 'SCR-34 đổi trạng thái', 'Công việc này sau đó đã bị xóa.', 1, 134, true, '11-04'],
      [705, 3, 'ASSIGNED', 'Bạn được giao SCR-25', 'Xây dựng luồng tạo và cập nhật công việc', 1, 125, false, '11-09'],
      [706, 3, 'COMMENT', 'Phạm Thu Hà bình luận SCR-25', 'Form tạo công việc cần báo lỗi ngay tại trường…', 1, 125, false, '11-11'],
      [707, 3, 'MEMBER_ADDED', 'Bạn được thêm vào SCR', 'Vai trò: DEVELOPER', 1, null, true, '10-01'],
      [708, 1, 'MEMBER_ADDED', 'Dự án MOB đã được tạo', 'Trưởng dự án: Bùi Văn Khoa', 3, null, true, '10-15'],
      [709, 5, 'STATUS', 'SCR-27 đã nghiệm thu', 'Bổ sung kiểm thử phân quyền thành viên dự án', 1, 127, false, '11-12'],
    ].map(([id, recipientId, type, title, body, projectId, issueId, read, day]) => ({
      id: id as number,
      recipientId: recipientId as number,
      type: type as 'ASSIGNED',
      title: title as string,
      body: body as string,
      projectId: projectId as number | null,
      issueId: issueId as number | null,
      read: read as boolean,
      createdAt: at(day as string, '09:30'),
    })),
    auditEvents: audit,
    sprintSnapshots: [
      {
        sprintId: 101,
        origin: 'OBSERVED',
        baselineAvailable: false,
        committedPoints: null,
        committedCount: null,
        completedPoints: null,
        completedCount: null,
        completionAvailable: false,
        completedIssueIds: [],
        unfinishedIssueIds: [],
      },
      {
        sprintId: 102,
        origin: 'START',
        baselineAvailable: true,
        committedPoints: 31,
        committedCount: 8,
        completedPoints: 26,
        completedCount: 7,
        completionAvailable: true,
        completedIssueIds: [105, 106, 107, 108, 109, 110, 111],
        unfinishedIssueIds: [112],
      },
      {
        sprintId: 103,
        origin: 'START',
        baselineAvailable: true,
        committedPoints: 29,
        committedCount: 9,
        completedPoints: 26,
        completedCount: 8,
        completionAvailable: true,
        completedIssueIds: [112, 113, 114, 115, 116, 117, 118, 119],
        unfinishedIssueIds: [123],
      },
      {
        sprintId: 104,
        origin: 'START',
        baselineAvailable: true,
        committedPoints: 24,
        committedCount: 7,
        completedPoints: null,
        completedCount: null,
        completionAvailable: false,
        completedIssueIds: [],
        unfinishedIssueIds: [],
      },
    ],
    burndownEvents: [
      [801, at('11-09', '09:00'), 24, 24, 7, 7],
      [802, at('11-10', '16:00'), 24, 22, 7, 6],
      [803, at('11-11', '10:00'), 25, 23, 8, 7],
      [804, at('11-12', '09:30'), 25, 20, 8, 6],
    ].map(([id, recordedAt, totalPoints, remainingPoints, issueCount, remainingCount]) => ({
      id: id as number,
      sprintId: 104,
      recordedAt: recordedAt as string,
      totalPoints: totalPoints as number,
      remainingPoints: remainingPoints as number,
      issueCount: issueCount as number,
      remainingCount: remainingCount as number,
    })),
  };
}
