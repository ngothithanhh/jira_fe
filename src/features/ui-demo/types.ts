/**
 * Model chuẩn của bộ giao diện mẫu /ui-review.
 * Đây là state cục bộ trong trình duyệt, không phải DTO backend và không được gửi tới API.
 * Mọi quan hệ giữ bằng ID; mỗi thực thể chỉ có một bản ghi nguồn trong mảng tương ứng.
 */

export type StatusCategory = 'TO_DO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'HIGHEST' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';
export type SprintState = 'FUTURE' | 'ACTIVE' | 'CLOSED';
export type RoleScope = 'GLOBAL' | 'PROJECT';
export type IssueTypeIcon = 'story' | 'task' | 'bug' | 'subtask';

export type PermissionCode =
  | 'VIEW_PROJECT'
  | 'CREATE_PROJECT'
  | 'EDIT_PROJECT'
  | 'DELETE_PROJECT'
  | 'ADD_MEMBER'
  | 'CREATE_ISSUE'
  | 'EDIT_ISSUE'
  | 'DELETE_ISSUE'
  | 'MANAGE_SPRINT'
  | 'MANAGE_BOARD'
  | 'MANAGE_CONFIG'
  | 'MANAGE_USERS'
  | 'VIEW_AUDIT';

export type DemoUser = {
  id: number;
  userName: string;
  fullName: string;
  email: string;
  enabled: boolean;
  /** Object URL ảnh cục bộ do người duyệt chọn; null thì hiển thị chữ viết tắt. */
  avatarUrl: string | null;
  createdAt: string;
};

export type DemoProject = {
  id: number;
  key: string;
  name: string;
  description: string;
  leadId: number;
  /** Bộ đếm số issue đã cấp; xóa issue không hạ số này để key không bị tái dùng. */
  issueSequence: number;
  createdAt: string;
};

export type DemoIssue = {
  id: number;
  projectId: number;
  number: number;
  key: string;
  title: string;
  description: string;
  typeId: number;
  statusId: number;
  priority: Priority;
  /** null là chưa ước lượng, khác 0 điểm. */
  points: number | null;
  assigneeId: number | null;
  reporterId: number | null;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type DemoSprint = {
  id: number;
  projectId: number;
  name: string;
  goal: string;
  state: SprintState;
  startDate: string | null;
  endDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type DemoBoard = { id: number; projectId: number; name: string };
export type DemoColumn = { id: number; boardId: number; name: string; position: number; wipLimit: number };
export type DemoStatus = { id: number; name: string; category: StatusCategory; color: string };
export type DemoIssueType = { id: number; name: string; description: string; icon: IssueTypeIcon; color: string };
export type DemoRole = { id: number; name: string; scope: RoleScope; reserved: boolean; description: string };
export type DemoPermission = { code: PermissionCode; name: string; description: string };

export type Membership = { projectId: number; userId: number; roleId: number; joinedAt: string };
export type UserRoleAssignment = { userId: number; roleId: number; assignedAt: string };
export type RolePermission = { roleId: number; code: PermissionCode };
export type ProjectIssueType = { projectId: number; typeId: number; isDefault: boolean };
/** position null là chưa xếp thủ công; selector dùng priority rồi số issue để sắp. */
export type SprintIssue = { sprintId: number; issueId: number; position: number | null; addedAt: string };
export type BoardRank = { boardId: number; columnId: number; issueId: number; position: number };
export type ColumnStatus = { columnId: number; statusId: number };
export type WorkflowRule = { id: number; fromStatusId: number; toStatusId: number };

export type DemoComment = {
  id: number;
  issueId: number;
  /** null là dữ liệu cũ không còn tác giả. */
  authorId: number | null;
  text: string;
  createdAt: string;
  updatedAt: string | null;
  version: number;
};

export type DemoAttachment = {
  id: number;
  issueId: number;
  uploaderId: number | null;
  name: string;
  size: number;
  mime: string;
  /** Object URL của tệp người duyệt chọn; phải revoke khi xóa/reset. */
  objectUrl: string | null;
  /** Nội dung mẫu dạng text để xem/tải, không phải file từ máy chủ. */
  sampleText: string | null;
  createdAt: string;
};

export type NotificationType = 'ASSIGNED' | 'COMMENT' | 'MEMBER_ADDED' | 'SPRINT' | 'STATUS';
export type DemoNotification = {
  id: number;
  recipientId: number;
  type: NotificationType;
  title: string;
  body: string;
  projectId: number | null;
  issueId: number | null;
  read: boolean;
  createdAt: string;
};

export type AuditEvent = {
  id: number;
  /** null là thao tác hệ thống. */
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: number;
  projectId: number | null;
  detail: string;
  createdAt: string;
};

export type SprintSnapshot = {
  sprintId: number;
  /** START: chụp lúc bắt đầu; OBSERVED: sprint cũ chỉ có số từ lần quan sát đầu. */
  origin: 'START' | 'OBSERVED';
  baselineAvailable: boolean;
  committedPoints: number | null;
  committedCount: number | null;
  /** Chỉ ghi một lần khi hoàn tất; null ở sprint chưa đóng hoặc dữ liệu cũ thiếu lịch sử. */
  completedPoints: number | null;
  completedCount: number | null;
  completionAvailable: boolean;
  completedIssueIds: number[];
  unfinishedIssueIds: number[];
};

export type BurndownEvent = {
  id: number;
  sprintId: number;
  recordedAt: string;
  totalPoints: number;
  remainingPoints: number;
  issueCount: number;
  remainingCount: number;
};

export type DemoState = {
  session: { userId: number } | null;
  /** Bộ đếm ID chung; xóa rồi tạo lại không trùng ID. */
  nextId: number;
  users: DemoUser[];
  projects: DemoProject[];
  issues: DemoIssue[];
  sprints: DemoSprint[];
  boards: DemoBoard[];
  columns: DemoColumn[];
  statuses: DemoStatus[];
  issueTypes: DemoIssueType[];
  roles: DemoRole[];
  permissions: DemoPermission[];
  memberships: Membership[];
  userRoles: UserRoleAssignment[];
  rolePermissions: RolePermission[];
  projectIssueTypes: ProjectIssueType[];
  sprintIssues: SprintIssue[];
  /** Thứ tự product backlog do người dùng kéo; ID không có trong danh sách xếp sau theo priority. */
  backlogOrder: { projectId: number; issueIds: number[] }[];
  boardRanks: BoardRank[];
  columnStatuses: ColumnStatus[];
  workflowRules: WorkflowRule[];
  comments: DemoComment[];
  attachments: DemoAttachment[];
  notifications: DemoNotification[];
  auditEvents: AuditEvent[];
  sprintSnapshots: SprintSnapshot[];
  burndownEvents: BurndownEvent[];
};

/** Người thực hiện và thời điểm được truyền vào để transition thuần, test được và không đọc đồng hồ ẩn. */
export type ActionContext = { actorId: number | null; now: string };

export type ActionError = {
  ok: false;
  code: 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHENTICATED';
  message: string;
  fieldErrors?: Record<string, string>;
};
export type ActionSuccess = { ok: true; state: DemoState; entityId?: number };
export type ActionResult = ActionSuccess | ActionError;
