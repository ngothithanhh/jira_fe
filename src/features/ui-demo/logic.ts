import type {
  ActionContext,
  ActionError,
  ActionResult,
  AuditEvent,
  DemoColumn,
  DemoIssue,
  DemoNotification,
  DemoState,
  DemoUser,
  IssueTypeIcon,
  NotificationType,
  PermissionCode,
  Priority,
  RoleScope,
  StatusCategory,
} from './types';

/*
 * Logic thuần của bộ giao diện mẫu: selector đọc state và transition trả state mới.
 * File không import runtime từ module khác để chạy được bằng `node --experimental-strip-types` trong test.
 * Mọi transition: kiểm phiên/quyền/quan hệ ID và dữ liệu nhập trước; lỗi trả ActionError và KHÔNG đổi state.
 * Audit, notification và điểm burndown được tạo trong cùng transition, không có side effect bên ngoài.
 */

// ───────────────────────────── Hằng số và tiện ích chung ─────────────────────────────

export const PRIORITIES: Priority[] = ['HIGHEST', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'];
export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGHEST: 'Cao nhất',
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
  LOWEST: 'Thấp nhất',
};
export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  TO_DO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Hoàn thành',
};
/** Tên role có nghĩa nghiệp vụ cố định: admin hệ thống và PM (tối đa một người mỗi project). */
export const ADMIN_ROLE = 'SYSTEM_ADMIN';
export const PM_ROLE = 'PROJECT_MANAGER';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const priorityRank = (priority: Priority) => PRIORITIES.indexOf(priority);
const lower = (text: string) => text.trim().toLocaleLowerCase('vi');
const byteLength = (text: string) => new TextEncoder().encode(text).length;

function fail(code: ActionError['code'], message: string, fieldErrors?: Record<string, string>): ActionError {
  return { ok: false, code, message, fieldErrors };
}
const isError = (value: unknown): value is ActionError =>
  typeof value === 'object' && value !== null && (value as ActionError).ok === false;

// ───────────────────────────── Selector cơ bản ─────────────────────────────

export const findUser = (s: DemoState, id: number | null | undefined) =>
  id == null ? undefined : s.users.find((u) => u.id === id);
export const findProject = (s: DemoState, id: number) => s.projects.find((p) => p.id === id);
export const findIssue = (s: DemoState, id: number) => s.issues.find((i) => i.id === id);
export const findStatus = (s: DemoState, id: number) => s.statuses.find((st) => st.id === id);
export const findType = (s: DemoState, id: number) => s.issueTypes.find((t) => t.id === id);
export const findSprint = (s: DemoState, id: number) => s.sprints.find((sp) => sp.id === id);
export const findBoard = (s: DemoState, id: number) => s.boards.find((b) => b.id === id);
export const findColumn = (s: DemoState, id: number) => s.columns.find((c) => c.id === id);
export const findRole = (s: DemoState, id: number) => s.roles.find((r) => r.id === id);
export const roleByName = (s: DemoState, name: string) => s.roles.find((r) => r.name === name);

/** Tên hiển thị; người dùng đã mất (dữ liệu legacy) không làm UI lỗi. */
export function userLabel(s: DemoState, id: number | null | undefined, fallback = 'Người dùng không còn tồn tại') {
  return findUser(s, id)?.fullName ?? fallback;
}

/** Hoàn thành được xác định bằng category DONE của status, không suy từ tên trạng thái. */
export function isDone(s: DemoState, issue: Pick<DemoIssue, 'statusId'>) {
  return findStatus(s, issue.statusId)?.category === 'DONE';
}

export const projectIssues = (s: DemoState, projectId: number) => s.issues.filter((i) => i.projectId === projectId);
export const projectMembers = (s: DemoState, projectId: number) =>
  s.memberships.filter((m) => m.projectId === projectId);
export const projectSprints = (s: DemoState, projectId: number) => s.sprints.filter((sp) => sp.projectId === projectId);
export const projectBoards = (s: DemoState, projectId: number) => s.boards.filter((b) => b.projectId === projectId);
export const isMember = (s: DemoState, projectId: number, userId: number) =>
  s.memberships.some((m) => m.projectId === projectId && m.userId === userId);

/** Loại công việc gán cho project, mặc định đứng đầu. */
export function projectTypes(s: DemoState, projectId: number) {
  return s.projectIssueTypes
    .filter((pt) => pt.projectId === projectId)
    .map((pt) => ({ ...findType(s, pt.typeId)!, isDefault: pt.isDefault }))
    .filter((t) => t.id !== undefined)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id);
}

// ───────────────────────────── Quyền ─────────────────────────────

/**
 * Quyền của user: quyền role toàn cục áp dụng mọi nơi; quyền role thành viên chỉ áp dụng trong projectId.
 * User bị khóa hoặc không tồn tại không có quyền nào.
 */
export function permissionsOf(s: DemoState, userId: number | null | undefined, projectId?: number) {
  const user = findUser(s, userId);
  const result = new Set<PermissionCode>();
  if (!user || !user.enabled) return result;
  const roleIds = s.userRoles.filter((a) => a.userId === user.id).map((a) => a.roleId);
  if (projectId !== undefined) {
    const membership = s.memberships.find((m) => m.projectId === projectId && m.userId === user.id);
    if (membership) roleIds.push(membership.roleId);
  }
  for (const rp of s.rolePermissions) if (roleIds.includes(rp.roleId)) result.add(rp.code);
  return result;
}
export const can = (s: DemoState, userId: number | null | undefined, code: PermissionCode, projectId?: number) =>
  permissionsOf(s, userId, projectId).has(code);

export function isAdmin(s: DemoState, userId: number | null | undefined) {
  const admin = roleByName(s, ADMIN_ROLE);
  const user = findUser(s, userId);
  return !!admin && !!user?.enabled && s.userRoles.some((a) => a.userId === user.id && a.roleId === admin.id);
}

/** Project user được xem: thành viên, hoặc có VIEW_PROJECT toàn cục (admin). */
export function visibleProjects(s: DemoState, userId: number | null | undefined) {
  return s.projects.filter((p) => can(s, userId, 'VIEW_PROJECT', p.id));
}

function actor(s: DemoState, ctx: ActionContext): DemoUser | ActionError {
  const user = findUser(s, ctx.actorId);
  if (!user) return fail('UNAUTHENTICATED', 'Bạn cần vào phiên demo trước khi thao tác.');
  if (!user.enabled) return fail('FORBIDDEN', 'Tài khoản đang bị khóa.');
  return user;
}
function requirePerm(s: DemoState, ctx: ActionContext, code: PermissionCode, projectId?: number): ActionError | null {
  const user = actor(s, ctx);
  if (isError(user)) return user;
  return can(s, user.id, code, projectId) ? null : fail('FORBIDDEN', 'Vai trò hiện tại không có quyền thực hiện thao tác này.');
}

// ───────────────────────────── Sprint, backlog, số liệu ─────────────────────────────

/** Sprint FUTURE/ACTIVE đang chứa issue; CLOSED chỉ là lịch sử. */
export function openSprintOf(s: DemoState, issueId: number) {
  const links = s.sprintIssues.filter((l) => l.issueId === issueId);
  return s.sprints.find((sp) => sp.state !== 'CLOSED' && links.some((l) => l.sprintId === sp.id));
}

const fallbackOrder = (a: DemoIssue, b: DemoIssue) =>
  priorityRank(a.priority) - priorityRank(b.priority) || a.number - b.number || a.id - b.id;

/** Issue của sprint theo rank đã xếp; việc chưa có rank xếp sau theo priority rồi số issue. */
export function sprintIssueList(s: DemoState, sprintId: number) {
  const links = s.sprintIssues.filter((l) => l.sprintId === sprintId);
  return links
    .map((l) => ({ link: l, issue: findIssue(s, l.issueId) }))
    .filter((x): x is { link: (typeof links)[number]; issue: DemoIssue } => !!x.issue)
    .sort((a, b) => {
      if (a.link.position !== null && b.link.position !== null) return a.link.position - b.link.position;
      if (a.link.position !== null) return -1;
      if (b.link.position !== null) return 1;
      return fallbackOrder(a.issue, b.issue);
    })
    .map((x) => x.issue);
}

/** Product backlog: issue chưa DONE và không thuộc sprint FUTURE/ACTIVE; link CLOSED không loại issue. */
export function productBacklog(s: DemoState, projectId: number) {
  const order = s.backlogOrder.find((o) => o.projectId === projectId)?.issueIds ?? [];
  const items = projectIssues(s, projectId).filter((i) => !isDone(s, i) && !openSprintOf(s, i.id));
  return items.sort((a, b) => {
    const ia = order.indexOf(a.id),
      ib = order.indexOf(b.id);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return fallbackOrder(a, b);
  });
}

export type SprintMetrics = {
  totalPoints: number;
  remainingPoints: number;
  issueCount: number;
  remainingCount: number;
  donePoints: number;
  doneCount: number;
};
/** Số liệu hiện tại; points null tính 0 nhưng vẫn đếm issue. */
export function sprintMetrics(s: DemoState, sprintId: number): SprintMetrics {
  const issues = sprintIssueList(s, sprintId);
  const done = issues.filter((i) => isDone(s, i));
  const sum = (list: DemoIssue[]) => list.reduce((t, i) => t + (i.points ?? 0), 0);
  return {
    totalPoints: sum(issues),
    remainingPoints: sum(issues) - sum(done),
    issueCount: issues.length,
    remainingCount: issues.length - done.length,
    donePoints: sum(done),
    doneCount: done.length,
  };
}

export const snapshotOf = (s: DemoState, sprintId: number) => s.sprintSnapshots.find((x) => x.sprintId === sprintId);

/** Velocity chỉ đọc snapshot CLOSED, không tính lại từ point hiện tại của issue. */
export function velocity(s: DemoState, projectId: number) {
  return projectSprints(s, projectId)
    .filter((sp) => sp.state === 'CLOSED')
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.id - b.id)
    .map((sprint) => {
      const snap = snapshotOf(s, sprint.id);
      return {
        sprint,
        committed: snap?.baselineAvailable ? snap.committedPoints : null,
        completed: snap?.completionAvailable ? snap.completedPoints : null,
        available: !!snap?.completionAvailable,
      };
    });
}

// ───────────────────────────── Workflow, board, WIP ─────────────────────────────

/** Chuyển hợp lệ khi có cạnh workflow from→to; giữ nguyên status luôn hợp lệ. */
export function canTransition(s: DemoState, fromStatusId: number, toStatusId: number) {
  return fromStatusId === toStatusId || s.workflowRules.some((r) => r.fromStatusId === fromStatusId && r.toStatusId === toStatusId);
}
export function allowedStatuses(s: DemoState, fromStatusId: number) {
  return s.statuses.filter((st) => canTransition(s, fromStatusId, st.id));
}

export const boardColumns = (s: DemoState, boardId: number) =>
  s.columns.filter((c) => c.boardId === boardId).sort((a, b) => a.position - b.position || a.id - b.id);
export const columnStatusIds = (s: DemoState, columnId: number) =>
  s.columnStatuses.filter((m) => m.columnId === columnId).map((m) => m.statusId);

/** Cột của status trong một board; undefined nghĩa là status chưa map, card nằm ở "Chưa phân cột". */
export function columnForStatus(s: DemoState, boardId: number, statusId: number): DemoColumn | undefined {
  return boardColumns(s, boardId).find((c) => columnStatusIds(s, c.id).includes(statusId));
}

/** Tải của cột tính trên mọi issue của project map vào cột, không chỉ card đang hiện theo bộ lọc/sprint. */
export function columnLoad(s: DemoState, columnId: number) {
  const column = findColumn(s, columnId);
  const board = column && findBoard(s, column.boardId);
  if (!column || !board) return 0;
  const statusIds = columnStatusIds(s, columnId);
  return projectIssues(s, board.projectId).filter((i) => statusIds.includes(i.statusId)).length;
}

/**
 * Kiểm WIP trên mọi board của project khi issue đổi sang status mới.
 * Chỉ chặn khi issue thực sự đi vào cột khác và cột đích có WIP dương đã đầy.
 */
function checkWip(s: DemoState, projectId: number, fromStatusId: number | null, toStatusId: number): ActionError | null {
  for (const board of projectBoards(s, projectId)) {
    const target = columnForStatus(s, board.id, toStatusId);
    if (!target || target.wipLimit <= 0) continue;
    const source = fromStatusId === null ? undefined : columnForStatus(s, board.id, fromStatusId);
    if (source?.id === target.id) continue;
    if (columnLoad(s, target.id) >= target.wipLimit)
      return fail('CONFLICT', `Cột "${target.name}" (${board.name}) đã đạt giới hạn WIP ${target.wipLimit}.`);
  }
  return null;
}

/** Thứ tự card trong cột theo rank của board; card chưa xếp theo thứ tự sprint backlog. */
function orderColumnCards(s: DemoState, boardId: number, columnId: number, issues: DemoIssue[]) {
  const ranks = s.boardRanks.filter((r) => r.boardId === boardId && r.columnId === columnId);
  return [...issues].sort((a, b) => {
    const ra = ranks.find((r) => r.issueId === a.id),
      rb = ranks.find((r) => r.issueId === b.id);
    if (ra && rb) return ra.position - rb.position;
    if (ra) return -1;
    if (rb) return 1;
    return 0;
  });
}

export type BoardView = {
  columns: { column: DemoColumn; statusIds: number[]; issues: DemoIssue[]; load: number; full: boolean }[];
  unmapped: DemoIssue[];
};
/** Card của board trong phạm vi sprint đã chọn; cột lấy từ status hiện tại. */
export function boardView(s: DemoState, boardId: number, sprintId: number): BoardView {
  const scope = sprintIssueList(s, sprintId);
  const columns = boardColumns(s, boardId).map((column) => {
    const statusIds = columnStatusIds(s, column.id);
    const load = columnLoad(s, column.id);
    return {
      column,
      statusIds,
      issues: orderColumnCards(s, boardId, column.id, scope.filter((i) => statusIds.includes(i.statusId))),
      load,
      full: column.wipLimit > 0 && load >= column.wipLimit,
    };
  });
  const mapped = new Set(columns.flatMap((c) => c.statusIds));
  return { columns, unmapped: scope.filter((i) => !mapped.has(i.statusId)) };
}

// ───────────────────────────── Tìm kiếm issue ─────────────────────────────

export type IssueFilters = {
  keyword?: string;
  statusId?: number | null;
  typeId?: number | null;
  assignee?: number | 'none' | null;
  priority?: Priority | null;
  sprint?: number | 'backlog' | null;
};
export type IssueSort = 'number' | 'title' | 'priority' | 'createdAt' | 'updatedAt';

/** Lọc AND trong đúng project; keyword tìm literal không phân biệt hoa thường trên key/tiêu đề/mô tả. */
export function searchIssues(
  s: DemoState,
  projectId: number,
  filters: IssueFilters,
  sort: IssueSort = 'updatedAt',
  direction: 'asc' | 'desc' = 'desc',
  page = 1,
  size = 20,
) {
  const keyword = filters.keyword ? lower(filters.keyword) : '';
  const items = projectIssues(s, projectId).filter((i) => {
    if (keyword && !lower(`${i.key} ${i.title} ${i.description}`).includes(keyword)) return false;
    if (filters.statusId && i.statusId !== filters.statusId) return false;
    if (filters.typeId && i.typeId !== filters.typeId) return false;
    if (filters.assignee === 'none' && i.assigneeId !== null) return false;
    if (typeof filters.assignee === 'number' && i.assigneeId !== filters.assignee) return false;
    if (filters.priority && i.priority !== filters.priority) return false;
    if (filters.sprint === 'backlog' && openSprintOf(s, i.id)) return false;
    if (typeof filters.sprint === 'number' && !s.sprintIssues.some((l) => l.sprintId === filters.sprint && l.issueId === i.id))
      return false;
    return true;
  });
  const factor = direction === 'asc' ? 1 : -1;
  const compare = (a: DemoIssue, b: DemoIssue) => {
    const value =
      sort === 'number'
        ? a.number - b.number
        : sort === 'title'
          ? a.title.localeCompare(b.title, 'vi')
          : sort === 'priority'
            ? priorityRank(b.priority) - priorityRank(a.priority)
            : a[sort].localeCompare(b[sort]);
    // Tie-break bằng ID để thứ tự ổn định giữa các lần render/phân trang.
    return value * factor || a.id - b.id;
  };
  items.sort(compare);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, size, totalItems, totalPages };
}

// ───────────────────────────── Inbox, audit, tổng quan ─────────────────────────────

export function inbox(s: DemoState, userId: number | null | undefined) {
  return s.notifications
    .filter((n) => n.recipientId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}
export const unreadCount = (s: DemoState, userId: number | null | undefined) =>
  inbox(s, userId).filter((n) => !n.read).length;

export type AuditFilters = {
  entityType?: string;
  entityId?: number | null;
  actor?: number | 'system' | null;
  action?: string;
  from?: string;
  to?: string;
};
export function auditQuery(s: DemoState, filters: AuditFilters, page = 1, size = 20) {
  const items = s.auditEvents
    .filter((e) => {
      if (filters.entityType && e.entityType !== filters.entityType) return false;
      if (filters.entityId && e.entityId !== filters.entityId) return false;
      if (filters.actor === 'system' && e.actorId !== null) return false;
      if (typeof filters.actor === 'number' && e.actorId !== filters.actor) return false;
      if (filters.action && e.action !== filters.action) return false;
      if (filters.from && e.createdAt.slice(0, 10) < filters.from) return false;
      if (filters.to && e.createdAt.slice(0, 10) > filters.to) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalItems: items.length, totalPages };
}

export function adminOverview(s: DemoState) {
  const admin = roleByName(s, ADMIN_ROLE);
  return {
    users: s.users.length,
    enabledUsers: s.users.filter((u) => u.enabled).length,
    admins: s.users.filter((u) => u.enabled && s.userRoles.some((a) => a.userId === u.id && a.roleId === admin?.id)).length,
    projects: s.projects.length,
    issues: s.issues.length,
    activeSprints: s.sprints.filter((sp) => sp.state === 'ACTIVE').length,
    closedSprints: s.sprints.filter((sp) => sp.state === 'CLOSED').length,
  };
}

/** parent không được là chính nó hoặc hậu duệ của nó (tránh chu kỳ). */
export function wouldCreateCycle(s: DemoState, issueId: number, parentId: number) {
  let current: number | null = parentId;
  const seen = new Set<number>();
  while (current !== null && !seen.has(current)) {
    if (current === issueId) return true;
    seen.add(current);
    current = findIssue(s, current)?.parentId ?? null;
  }
  return false;
}

// ───────────────────────────── Khung transition ─────────────────────────────

type Draft = DemoState;
/**
 * Chạy một transition trên bản sao. fn trả ActionError thì bỏ bản sao (state cũ giữ nguyên);
 * trả số thì là ID thực thể vừa tạo/sửa. Sau cùng ghi điểm burndown cho sprint ACTIVE có số liệu đổi.
 */
function tx(state: DemoState, ctx: ActionContext, fn: (d: Draft) => ActionError | number | void): ActionResult {
  const before = new Map(
    state.sprints.filter((sp) => sp.state === 'ACTIVE').map((sp) => [sp.id, sprintMetrics(state, sp.id)]),
  );
  const d = structuredClone(state);
  const result = fn(d);
  if (isError(result)) return result;
  for (const sprint of d.sprints) {
    const old = before.get(sprint.id);
    if (sprint.state !== 'ACTIVE' || !old) continue;
    const now = sprintMetrics(d, sprint.id);
    if (now.totalPoints !== old.totalPoints || now.remainingPoints !== old.remainingPoints || now.issueCount !== old.issueCount)
      pushBurndown(d, ctx, sprint.id);
  }
  return { ok: true, state: d, entityId: typeof result === 'number' ? result : undefined };
}

const nextId = (d: Draft) => d.nextId++;
function audit(d: Draft, ctx: ActionContext, action: string, entityType: string, entityId: number, projectId: number | null, detail: string) {
  const event: AuditEvent = { id: nextId(d), actorId: ctx.actorId, action, entityType, entityId, projectId, detail, createdAt: ctx.now };
  d.auditEvents.push(event);
}
/** Không gửi cho chính người thao tác hoặc user bị khóa. */
function notify(
  d: Draft,
  ctx: ActionContext,
  recipientId: number | null,
  type: NotificationType,
  title: string,
  body: string,
  projectId: number | null,
  issueId: number | null,
) {
  const user = findUser(d, recipientId);
  if (!user || !user.enabled || user.id === ctx.actorId) return;
  const n: DemoNotification = { id: nextId(d), recipientId: user.id, type, title, body, projectId, issueId, read: false, createdAt: ctx.now };
  d.notifications.push(n);
}
function pushBurndown(d: Draft, ctx: ActionContext, sprintId: number) {
  const m = sprintMetrics(d, sprintId);
  d.burndownEvents.push({
    id: nextId(d),
    sprintId,
    recordedAt: ctx.now,
    totalPoints: m.totalPoints,
    remainingPoints: m.remainingPoints,
    issueCount: m.issueCount,
    remainingCount: m.remainingCount,
  });
}

const textError = (value: string, field: string, label: string, max: number, min = 1) => {
  const length = value.trim().length;
  return length < min || length > max ? { [field]: `${label} cần từ ${min} đến ${max} ký tự.` } : null;
};

// ───────────────────────────── UC01–02: phiên, tài khoản, người dùng ─────────────────────────────

/** Đăng nhập demo: chỉ kiểm email có trong dữ liệu mẫu và mật khẩu không trống; không so khớp mật khẩu thật. */
export function signIn(state: DemoState, input: { email: string; password: string }): ActionResult {
  const fieldErrors: Record<string, string> = {};
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fieldErrors.email = 'Email không hợp lệ.';
  if (!input.password) fieldErrors.password = 'Vui lòng nhập mật khẩu.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  const user = state.users.find((u) => lower(u.email) === lower(input.email));
  if (!user) return fail('VALIDATION', 'Email chưa có trong dữ liệu mẫu.', { email: 'Email chưa có trong dữ liệu mẫu.' });
  if (!user.enabled) return fail('FORBIDDEN', 'Tài khoản đã bị khóa. Liên hệ quản trị viên.');
  return { ok: true, state: { ...state, session: { userId: user.id } }, entityId: user.id };
}

export type SignUpInput = { userName: string; fullName: string; email: string; password: string; confirm: string };
export function signUp(state: DemoState, now: string, input: SignUpInput): ActionResult {
  const fieldErrors: Record<string, string> = {};
  if (!/^[a-zA-Z0-9._-]{1,50}$/.test(input.userName.trim()))
    fieldErrors.userName = 'Tên đăng nhập 1–50 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch.';
  if (!input.fullName.trim() || input.fullName.trim().length > 100) fieldErrors.fullName = 'Họ tên cần từ 1 đến 100 ký tự.';
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fieldErrors.email = 'Email không hợp lệ.';
  else if (state.users.some((u) => lower(u.email) === lower(input.email))) fieldErrors.email = 'Email đã được sử dụng.';
  if (state.users.some((u) => lower(u.userName) === lower(input.userName))) fieldErrors.userName = 'Tên đăng nhập đã tồn tại.';
  if (input.password.length < 8 || byteLength(input.password) > 72) fieldErrors.password = 'Mật khẩu từ 8 ký tự, tối đa 72 byte.';
  if (input.confirm !== input.password) fieldErrors.confirm = 'Mật khẩu nhập lại không khớp.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  return tx(state, { actorId: null, now }, (d) => {
    const id = nextId(d);
    d.users.push({
      id,
      userName: input.userName.trim(),
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      enabled: true,
      avatarUrl: null,
      createdAt: now,
    });
    d.session = { userId: id };
    audit(d, { actorId: id, now }, 'USER_REGISTERED', 'USER', id, null, `Đăng ký ${input.userName.trim()}`);
    return id;
  });
}

export const signOut = (state: DemoState): DemoState => ({ ...state, session: null });

/** Công cụ duyệt: đổi sang persona có sẵn, kể cả user bị khóa để xem màn chặn. */
export function switchPersona(state: DemoState, userId: number): ActionResult {
  if (!findUser(state, userId)) return fail('NOT_FOUND', 'Không tìm thấy người dùng mẫu.');
  return { ok: true, state: { ...state, session: { userId } } };
}

export function updateProfile(
  state: DemoState,
  ctx: ActionContext,
  input: { userName: string; fullName: string; avatarUrl?: string | null },
): ActionResult {
  const me = actor(state, ctx);
  if (isError(me)) return me;
  const fieldErrors: Record<string, string> = {};
  if (!/^[a-zA-Z0-9._-]{1,50}$/.test(input.userName.trim()))
    fieldErrors.userName = 'Tên đăng nhập 1–50 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch.';
  else if (state.users.some((u) => u.id !== me.id && lower(u.userName) === lower(input.userName)))
    fieldErrors.userName = 'Tên đăng nhập đã tồn tại.';
  if (!input.fullName.trim() || input.fullName.trim().length > 100) fieldErrors.fullName = 'Họ tên cần từ 1 đến 100 ký tự.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  return tx(state, ctx, (d) => {
    const user = findUser(d, me.id)!;
    user.userName = input.userName.trim();
    user.fullName = input.fullName.trim();
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
    audit(d, ctx, 'PROFILE_UPDATED', 'USER', me.id, null, 'Cập nhật hồ sơ');
    return me.id;
  });
}

/** Chỉ mô phỏng validation; bản demo không lưu hoặc so khớp mật khẩu. */
export function changePassword(state: DemoState, ctx: ActionContext, input: { current: string; next: string; confirm: string }): ActionResult {
  const me = actor(state, ctx);
  if (isError(me)) return me;
  const fieldErrors: Record<string, string> = {};
  if (!input.current) fieldErrors.current = 'Vui lòng nhập mật khẩu hiện tại.';
  if (input.next.length < 8 || byteLength(input.next) > 72) fieldErrors.next = 'Mật khẩu mới từ 8 ký tự, tối đa 72 byte.';
  else if (input.next === input.current) fieldErrors.next = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (input.confirm !== input.next) fieldErrors.confirm = 'Mật khẩu nhập lại không khớp.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  return tx(state, ctx, (d) => {
    audit(d, ctx, 'PASSWORD_CHANGED', 'USER', me.id, null, 'Đổi mật khẩu (mô phỏng)');
  });
}

/** Số admin còn hoạt động nếu áp thay đổi giả định cho user đích. */
function enabledAdminsAfter(s: DemoState, userId: number, change: { enabled?: boolean; keepsAdmin?: boolean }) {
  const admin = roleByName(s, ADMIN_ROLE);
  return s.users.filter((u) => {
    const enabled = u.id === userId && change.enabled !== undefined ? change.enabled : u.enabled;
    const hasAdmin =
      u.id === userId && change.keepsAdmin !== undefined
        ? change.keepsAdmin
        : s.userRoles.some((a) => a.userId === u.id && a.roleId === admin?.id);
    return enabled && hasAdmin;
  }).length;
}

export function setUserEnabled(state: DemoState, ctx: ActionContext, userId: number, enabled: boolean): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_USERS');
  if (denied) return denied;
  const user = findUser(state, userId);
  if (!user) return fail('NOT_FOUND', 'Không tìm thấy người dùng.');
  if (!enabled && enabledAdminsAfter(state, userId, { enabled: false }) === 0)
    return fail('CONFLICT', 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
  return tx(state, ctx, (d) => {
    findUser(d, userId)!.enabled = enabled;
    audit(d, ctx, enabled ? 'USER_ENABLED' : 'USER_DISABLED', 'USER', userId, null, `${enabled ? 'Mở khóa' : 'Khóa'} ${user.userName}`);
    return userId;
  });
}

/** Gán tập role toàn cục; role project không được gán ở đây. */
export function setGlobalRoles(state: DemoState, ctx: ActionContext, userId: number, roleIds: number[]): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_USERS');
  if (denied) return denied;
  const user = findUser(state, userId);
  if (!user) return fail('NOT_FOUND', 'Không tìm thấy người dùng.');
  const unique = [...new Set(roleIds)];
  if (unique.some((id) => findRole(state, id)?.scope !== 'GLOBAL')) return fail('VALIDATION', 'Chỉ được gán role phạm vi hệ thống.');
  const admin = roleByName(state, ADMIN_ROLE);
  if (enabledAdminsAfter(state, userId, { keepsAdmin: !!admin && unique.includes(admin.id) }) === 0)
    return fail('CONFLICT', 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
  return tx(state, ctx, (d) => {
    const kept = d.userRoles.filter((a) => a.userId !== userId || unique.includes(a.roleId));
    const added = unique
      .filter((id) => !kept.some((a) => a.userId === userId && a.roleId === id))
      .map((roleId) => ({ userId, roleId, assignedAt: ctx.now }));
    d.userRoles = [...kept, ...added];
    audit(d, ctx, 'USER_ROLES_CHANGED', 'USER', userId, null, `Role hệ thống của ${user.userName}: ${unique.map((id) => findRole(d, id)?.name).join(', ') || 'không có'}`);
    return userId;
  });
}

// ───────────────────────────── UC03: project ─────────────────────────────

export type ProjectInput = { name: string; key: string; description: string; template: 'scrum' | 'empty' };

/** Tạo board với 3 cột theo category; mỗi status chỉ ở một cột của board. */
function createDefaultBoard(d: Draft, projectId: number, name: string) {
  const boardId = nextId(d);
  d.boards.push({ id: boardId, projectId, name });
  (['TO_DO', 'IN_PROGRESS', 'DONE'] as StatusCategory[]).forEach((category, position) => {
    const columnId = nextId(d);
    d.columns.push({ id: columnId, boardId, name: CATEGORY_LABEL[category], position, wipLimit: 0 });
    for (const st of d.statuses.filter((x) => x.category === category)) d.columnStatuses.push({ columnId, statusId: st.id });
  });
  return boardId;
}

export function createProject(state: DemoState, ctx: ActionContext, input: ProjectInput): ActionResult {
  const denied = requirePerm(state, ctx, 'CREATE_PROJECT');
  if (denied) return denied;
  const key = input.key.trim().toUpperCase();
  const fieldErrors: Record<string, string> = { ...textError(input.name, 'name', 'Tên dự án', 100) };
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) fieldErrors.key = 'Mã 2–10 ký tự, bắt đầu bằng chữ cái, chỉ gồm chữ không dấu và số.';
  else if (state.projects.some((p) => p.key.toUpperCase() === key)) fieldErrors.key = 'Mã dự án đã tồn tại.';
  if (input.description.length > 1000) fieldErrors.description = 'Mô tả tối đa 1000 ký tự.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  const pm = roleByName(state, PM_ROLE);
  if (!pm) return fail('CONFLICT', 'Thiếu role PROJECT_MANAGER trong cấu hình.');
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.projects.push({ id, key, name: input.name.trim(), description: input.description.trim(), leadId: ctx.actorId!, issueSequence: 0, createdAt: ctx.now });
    d.memberships.push({ projectId: id, userId: ctx.actorId!, roleId: pm.id, joinedAt: ctx.now });
    if (input.template === 'scrum') {
      const types = ['story', 'task', 'bug'].map((icon) => d.issueTypes.find((t) => t.icon === icon)).filter(Boolean);
      types.forEach((t, index) => d.projectIssueTypes.push({ projectId: id, typeId: t!.id, isDefault: index === 0 }));
      createDefaultBoard(d, id, `Bảng ${key}`);
    }
    audit(d, ctx, 'PROJECT_CREATED', 'PROJECT', id, id, `Tạo dự án ${key} (${input.template === 'scrum' ? 'mẫu Scrum' : 'rỗng'})`);
    return id;
  });
}

export function updateProject(
  state: DemoState,
  ctx: ActionContext,
  projectId: number,
  input: { name: string; description: string; leadId: number },
): ActionResult {
  const project = findProject(state, projectId);
  if (!project) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'EDIT_PROJECT', projectId);
  if (denied) return denied;
  const fieldErrors: Record<string, string> = { ...textError(input.name, 'name', 'Tên dự án', 100) };
  if (input.description.length > 1000) fieldErrors.description = 'Mô tả tối đa 1000 ký tự.';
  if (!isMember(state, projectId, input.leadId)) fieldErrors.leadId = 'Trưởng dự án phải là thành viên.';
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  return tx(state, ctx, (d) => {
    const p = findProject(d, projectId)!;
    p.name = input.name.trim();
    p.description = input.description.trim();
    p.leadId = input.leadId;
    audit(d, ctx, 'PROJECT_UPDATED', 'PROJECT', projectId, projectId, `Cập nhật thông tin ${p.key}`);
    return projectId;
  });
}

/** Xóa project và toàn bộ dữ liệu mẫu phụ thuộc để không để lại bản ghi mồ côi; audit giữ lại làm lịch sử. */
export function deleteProject(state: DemoState, ctx: ActionContext, projectId: number, confirmKey: string): ActionResult {
  const project = findProject(state, projectId);
  if (!project) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'DELETE_PROJECT', projectId);
  if (denied) return denied;
  if (confirmKey.trim().toUpperCase() !== project.key)
    return fail('VALIDATION', 'Mã xác nhận không khớp.', { confirm: `Nhập đúng mã ${project.key} để xóa.` });
  return tx(state, ctx, (d) => {
    const issueIds = new Set(projectIssues(d, projectId).map((i) => i.id));
    const sprintIds = new Set(projectSprints(d, projectId).map((sp) => sp.id));
    const boardIds = new Set(projectBoards(d, projectId).map((b) => b.id));
    const columnIds = new Set(d.columns.filter((c) => boardIds.has(c.boardId)).map((c) => c.id));
    d.projects = d.projects.filter((p) => p.id !== projectId);
    d.issues = d.issues.filter((i) => !issueIds.has(i.id));
    d.sprints = d.sprints.filter((sp) => !sprintIds.has(sp.id));
    d.sprintIssues = d.sprintIssues.filter((l) => !sprintIds.has(l.sprintId) && !issueIds.has(l.issueId));
    d.sprintSnapshots = d.sprintSnapshots.filter((x) => !sprintIds.has(x.sprintId));
    d.burndownEvents = d.burndownEvents.filter((x) => !sprintIds.has(x.sprintId));
    d.boards = d.boards.filter((b) => !boardIds.has(b.id));
    d.columns = d.columns.filter((c) => !columnIds.has(c.id));
    d.columnStatuses = d.columnStatuses.filter((m) => !columnIds.has(m.columnId));
    d.boardRanks = d.boardRanks.filter((r) => !boardIds.has(r.boardId));
    d.memberships = d.memberships.filter((m) => m.projectId !== projectId);
    d.projectIssueTypes = d.projectIssueTypes.filter((pt) => pt.projectId !== projectId);
    d.backlogOrder = d.backlogOrder.filter((o) => o.projectId !== projectId);
    d.comments = d.comments.filter((c) => !issueIds.has(c.issueId));
    d.attachments = d.attachments.filter((a) => !issueIds.has(a.issueId));
    d.notifications = d.notifications.filter((n) => n.projectId !== projectId);
    audit(d, ctx, 'PROJECT_DELETED', 'PROJECT', projectId, null, `Xóa dự án ${project.key}`);
  });
}

// ───────────────────────────── UC04: thành viên ─────────────────────────────

function memberRoleError(s: DemoState, projectId: number, userId: number, roleId: number): ActionError | null {
  const role = findRole(s, roleId);
  if (!role) return fail('NOT_FOUND', 'Không tìm thấy vai trò.');
  if (role.scope !== 'PROJECT') return fail('VALIDATION', 'Chỉ chọn vai trò phạm vi dự án; SYSTEM_ADMIN không gán cho dự án.');
  if (role.name === PM_ROLE && s.memberships.some((m) => m.projectId === projectId && m.roleId === roleId && m.userId !== userId))
    return fail('CONFLICT', 'Dự án đã có PROJECT_MANAGER. Đổi vai trò người hiện tại trước.');
  return null;
}

export function addMember(state: DemoState, ctx: ActionContext, projectId: number, userId: number, roleId: number): ActionResult {
  const project = findProject(state, projectId);
  if (!project) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'ADD_MEMBER', projectId);
  if (denied) return denied;
  const user = findUser(state, userId);
  if (!user) return fail('NOT_FOUND', 'Không tìm thấy người dùng.');
  if (!user.enabled) return fail('VALIDATION', 'Không thể thêm tài khoản đang bị khóa.');
  if (isMember(state, projectId, userId)) return fail('CONFLICT', 'Người dùng đã là thành viên.');
  const roleError = memberRoleError(state, projectId, userId, roleId);
  if (roleError) return roleError;
  return tx(state, ctx, (d) => {
    d.memberships.push({ projectId, userId, roleId, joinedAt: ctx.now });
    const roleName = findRole(d, roleId)!.name;
    notify(d, ctx, userId, 'MEMBER_ADDED', `Bạn được thêm vào ${project.key}`, `Vai trò: ${roleName}`, projectId, null);
    audit(d, ctx, 'MEMBER_ADDED', 'MEMBER', userId, projectId, `Thêm ${user.fullName} với vai trò ${roleName}`);
    return userId;
  });
}

/** Đổi role thành viên giữ joinedAt và không đụng role toàn cục. */
export function changeMemberRole(state: DemoState, ctx: ActionContext, projectId: number, userId: number, roleId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'ADD_MEMBER', projectId);
  if (denied) return denied;
  if (!isMember(state, projectId, userId)) return fail('NOT_FOUND', 'Người dùng không phải thành viên.');
  const roleError = memberRoleError(state, projectId, userId, roleId);
  if (roleError) return roleError;
  return tx(state, ctx, (d) => {
    d.memberships.find((m) => m.projectId === projectId && m.userId === userId)!.roleId = roleId;
    audit(d, ctx, 'MEMBER_ROLE_CHANGED', 'MEMBER', userId, projectId, `${userLabel(d, userId)} → ${findRole(d, roleId)!.name}`);
    return userId;
  });
}

export function removeMember(state: DemoState, ctx: ActionContext, projectId: number, userId: number): ActionResult {
  const project = findProject(state, projectId);
  if (!project) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'ADD_MEMBER', projectId);
  if (denied) return denied;
  if (!isMember(state, projectId, userId)) return fail('NOT_FOUND', 'Người dùng không phải thành viên.');
  if (project.leadId === userId) return fail('CONFLICT', 'Không thể gỡ trưởng dự án. Đổi trưởng dự án trong Cài đặt trước.');
  return tx(state, ctx, (d) => {
    d.memberships = d.memberships.filter((m) => !(m.projectId === projectId && m.userId === userId));
    audit(d, ctx, 'MEMBER_REMOVED', 'MEMBER', userId, projectId, `Gỡ ${userLabel(d, userId)} khỏi ${project.key}`);
  });
}

// ───────────────────────────── UC05: issue ─────────────────────────────

export type IssueInput = {
  title: string;
  typeId: number;
  priority: Priority;
  description?: string;
  assigneeId?: number | null;
  points?: number | null;
  parentId?: number | null;
  sprintId?: number | null;
};

function issueFieldErrors(s: DemoState, projectId: number, issueId: number | null, input: Partial<IssueInput>) {
  const errors: Record<string, string> = {};
  if (input.title !== undefined) Object.assign(errors, textError(input.title, 'title', 'Tiêu đề', 255));
  if (input.description !== undefined && input.description.length > 10000) errors.description = 'Mô tả tối đa 10000 ký tự.';
  if (input.typeId !== undefined && !s.projectIssueTypes.some((pt) => pt.projectId === projectId && pt.typeId === input.typeId))
    errors.typeId = 'Loại công việc chưa được gán cho dự án.';
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) errors.priority = 'Mức ưu tiên không hợp lệ.';
  if (input.points !== undefined && input.points !== null && (!Number.isInteger(input.points) || input.points < 0 || input.points > 1000))
    errors.points = 'Story points là số nguyên từ 0 đến 1000.';
  if (input.assigneeId != null && !isMember(s, projectId, input.assigneeId)) errors.assigneeId = 'Người phụ trách phải là thành viên dự án.';
  if (input.parentId != null) {
    const parent = findIssue(s, input.parentId);
    if (!parent || parent.projectId !== projectId) errors.parentId = 'Công việc cha phải cùng dự án.';
    else if (issueId !== null && wouldCreateCycle(s, issueId, input.parentId)) errors.parentId = 'Không thể chọn chính nó hoặc việc con làm công việc cha.';
  }
  return errors;
}

export function createIssue(state: DemoState, ctx: ActionContext, projectId: number, input: IssueInput): ActionResult {
  const project = findProject(state, projectId);
  if (!project) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'CREATE_ISSUE', projectId);
  if (denied) return denied;
  const fieldErrors = issueFieldErrors(state, projectId, null, input);
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', fieldErrors);
  const sprint = input.sprintId ? findSprint(state, input.sprintId) : undefined;
  if (input.sprintId && (!sprint || sprint.projectId !== projectId || sprint.state === 'CLOSED'))
    return fail('VALIDATION', 'Sprint không hợp lệ hoặc đã đóng.');
  // Status ban đầu: status TO_DO có ID nhỏ nhất; không gán cứng ID.
  const initial = [...state.statuses].filter((st) => st.category === 'TO_DO').sort((a, b) => a.id - b.id)[0];
  if (!initial) return fail('CONFLICT', 'Chưa có trạng thái nhóm "Cần làm" trong cấu hình.');
  const wip = checkWip(state, projectId, null, initial.id);
  if (wip) return wip;
  return tx(state, ctx, (d) => {
    const p = findProject(d, projectId)!;
    p.issueSequence += 1;
    const id = nextId(d);
    d.issues.push({
      id,
      projectId,
      number: p.issueSequence,
      key: `${p.key}-${p.issueSequence}`,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      typeId: input.typeId,
      statusId: initial.id,
      priority: input.priority,
      points: input.points ?? null,
      assigneeId: input.assigneeId ?? null,
      reporterId: ctx.actorId,
      parentId: input.parentId ?? null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      version: 0,
    });
    if (sprint) d.sprintIssues.push({ sprintId: sprint.id, issueId: id, position: null, addedAt: ctx.now });
    else {
      const order = d.backlogOrder.find((o) => o.projectId === projectId);
      if (order) order.issueIds.push(id);
      else d.backlogOrder.push({ projectId, issueIds: [...productBacklog(state, projectId).map((i) => i.id), id] });
    }
    if (input.assigneeId) notify(d, ctx, input.assigneeId, 'ASSIGNED', `Bạn được giao ${p.key}-${p.issueSequence}`, input.title.trim(), projectId, id);
    audit(d, ctx, 'ISSUE_CREATED', 'ISSUE', id, projectId, `Tạo ${p.key}-${p.issueSequence}`);
    return id;
  });
}

export type IssuePatch = Partial<Omit<IssueInput, 'sprintId'>> & { statusId?: number };

/** Sửa issue với version demo; đổi status kiểm cạnh workflow và WIP trên mọi board của project. */
export function updateIssue(state: DemoState, ctx: ActionContext, issueId: number, patch: IssuePatch, expectedVersion: number): ActionResult {
  const issue = findIssue(state, issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'EDIT_ISSUE', issue.projectId);
  if (denied) return denied;
  if (issue.version !== expectedVersion) return fail('CONFLICT', 'Dữ liệu mẫu đã thay đổi. Tải lại công việc rồi thử lại.');
  const fieldErrors = issueFieldErrors(state, issue.projectId, issueId, patch);
  if (patch.statusId !== undefined) {
    if (!findStatus(state, patch.statusId)) fieldErrors.statusId = 'Trạng thái không tồn tại.';
    else if (!canTransition(state, issue.statusId, patch.statusId))
      fieldErrors.statusId = `Workflow không cho phép chuyển từ "${findStatus(state, issue.statusId)?.name}" sang "${findStatus(state, patch.statusId)?.name}".`;
  }
  if (Object.keys(fieldErrors).length) return fail('VALIDATION', Object.values(fieldErrors)[0], fieldErrors);
  if (patch.statusId !== undefined && patch.statusId !== issue.statusId) {
    const wip = checkWip(state, issue.projectId, issue.statusId, patch.statusId);
    if (wip) return wip;
  }
  return tx(state, ctx, (d) => {
    const target = findIssue(d, issueId)!;
    const changes: string[] = [];
    const labels: Record<string, string> = {
      title: 'tiêu đề',
      description: 'mô tả',
      typeId: 'loại',
      priority: 'ưu tiên',
      points: 'story points',
      assigneeId: 'người phụ trách',
      parentId: 'công việc cha',
      statusId: 'trạng thái',
    };
    for (const [field, value] of Object.entries(patch) as [keyof IssuePatch, unknown][]) {
      if (value === undefined) continue;
      const next = typeof value === 'string' && field === 'title' ? value.trim() : value;
      if ((target as Record<string, unknown>)[field] === next) continue;
      (target as Record<string, unknown>)[field] = next;
      changes.push(labels[field] ?? field);
    }
    if (!changes.length) return issueId;
    target.version += 1;
    target.updatedAt = ctx.now;
    if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId && patch.assigneeId)
      notify(d, ctx, patch.assigneeId, 'ASSIGNED', `Bạn được giao ${target.key}`, target.title, target.projectId, issueId);
    if (patch.statusId !== undefined && patch.statusId !== issue.statusId) {
      const detail = `${target.key}: ${findStatus(d, issue.statusId)?.name} → ${findStatus(d, patch.statusId)?.name}`;
      notify(d, ctx, target.reporterId, 'STATUS', `${target.key} đổi trạng thái`, detail, target.projectId, issueId);
      audit(d, ctx, 'ISSUE_STATUS_CHANGED', 'ISSUE', issueId, target.projectId, detail);
    }
    audit(d, ctx, 'ISSUE_UPDATED', 'ISSUE', issueId, target.projectId, `${target.key}: sửa ${changes.join(', ')}`);
    return issueId;
  });
}

/** Không xóa dây chuyền: còn việc con hoặc tệp đính kèm thì chặn để người dùng xử lý trước. */
export function deleteIssue(state: DemoState, ctx: ActionContext, issueId: number, expectedVersion: number): ActionResult {
  const issue = findIssue(state, issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'DELETE_ISSUE', issue.projectId);
  if (denied) return denied;
  if (issue.version !== expectedVersion) return fail('CONFLICT', 'Dữ liệu mẫu đã thay đổi. Tải lại công việc rồi thử lại.');
  const children = state.issues.filter((i) => i.parentId === issueId);
  if (children.length) return fail('CONFLICT', `Còn ${children.length} việc con (${children.map((c) => c.key).join(', ')}). Gỡ liên kết cha trước khi xóa.`);
  const files = state.attachments.filter((a) => a.issueId === issueId);
  if (files.length) return fail('CONFLICT', `Còn ${files.length} tệp đính kèm. Xóa tệp trước khi xóa công việc.`);
  return tx(state, ctx, (d) => {
    d.issues = d.issues.filter((i) => i.id !== issueId);
    d.comments = d.comments.filter((c) => c.issueId !== issueId);
    d.sprintIssues = d.sprintIssues.filter((l) => l.issueId !== issueId);
    d.boardRanks = d.boardRanks.filter((r) => r.issueId !== issueId);
    for (const order of d.backlogOrder) order.issueIds = order.issueIds.filter((id) => id !== issueId);
    audit(d, ctx, 'ISSUE_DELETED', 'ISSUE', issueId, issue.projectId, `Xóa ${issue.key}`);
  });
}

// ───────────────────────────── UC06: comment, attachment ─────────────────────────────

export function addComment(state: DemoState, ctx: ActionContext, issueId: number, text: string): ActionResult {
  const issue = findIssue(state, issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'VIEW_PROJECT', issue.projectId);
  if (denied) return denied;
  const error = textError(text, 'text', 'Bình luận', 10000);
  if (error) return fail('VALIDATION', error.text, error);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.comments.push({ id, issueId, authorId: ctx.actorId, text: text.trim(), createdAt: ctx.now, updatedAt: null, version: 0 });
    const title = `${userLabel(d, ctx.actorId)} bình luận ${issue.key}`;
    const body = text.trim().slice(0, 80);
    const recipients = new Set([issue.assigneeId, issue.reporterId].filter((x): x is number => x !== null));
    for (const r of recipients) notify(d, ctx, r, 'COMMENT', title, body, issue.projectId, issueId);
    audit(d, ctx, 'COMMENT_CREATED', 'ISSUE', issueId, issue.projectId, `Bình luận ${issue.key}`);
    return id;
  });
}

/** Chủ comment hoặc role có EDIT_ISSUE được sửa/xóa; sửa/xóa không tạo lại thông báo "bình luận mới". */
function commentGuard(state: DemoState, ctx: ActionContext, commentId: number, expectedVersion: number) {
  const comment = state.comments.find((c) => c.id === commentId);
  if (!comment) return fail('NOT_FOUND', 'Bình luận không còn tồn tại.');
  const issue = findIssue(state, comment.issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'VIEW_PROJECT', issue.projectId);
  if (denied) return denied;
  if (comment.authorId !== ctx.actorId && !can(state, ctx.actorId, 'EDIT_ISSUE', issue.projectId))
    return fail('FORBIDDEN', 'Chỉ tác giả hoặc người có quyền sửa công việc mới được thay đổi bình luận.');
  if (comment.version !== expectedVersion) return fail('CONFLICT', 'Bình luận đã được thay đổi. Tải lại rồi thử lại.');
  return { comment, issue };
}
export const canManageComment = (s: DemoState, userId: number | null | undefined, authorId: number | null, projectId: number) =>
  can(s, userId, 'VIEW_PROJECT', projectId) && ((authorId !== null && authorId === userId) || can(s, userId, 'EDIT_ISSUE', projectId));

export function editComment(state: DemoState, ctx: ActionContext, commentId: number, text: string, expectedVersion: number): ActionResult {
  const guard = commentGuard(state, ctx, commentId, expectedVersion);
  if (isError(guard)) return guard;
  const error = textError(text, 'text', 'Bình luận', 10000);
  if (error) return fail('VALIDATION', error.text, error);
  return tx(state, ctx, (d) => {
    const c = d.comments.find((x) => x.id === commentId)!;
    c.text = text.trim();
    c.updatedAt = ctx.now;
    c.version += 1;
    audit(d, ctx, 'COMMENT_UPDATED', 'ISSUE', guard.issue.id, guard.issue.projectId, `Sửa bình luận ${guard.issue.key}`);
    return commentId;
  });
}
export function deleteComment(state: DemoState, ctx: ActionContext, commentId: number, expectedVersion: number): ActionResult {
  const guard = commentGuard(state, ctx, commentId, expectedVersion);
  if (isError(guard)) return guard;
  return tx(state, ctx, (d) => {
    d.comments = d.comments.filter((x) => x.id !== commentId);
    audit(d, ctx, 'COMMENT_DELETED', 'ISSUE', guard.issue.id, guard.issue.projectId, `Xóa bình luận ${guard.issue.key}`);
  });
}

export type AttachmentInput = { name: string; size: number; mime: string; objectUrl: string | null; sampleText: string | null };
export function addAttachment(state: DemoState, ctx: ActionContext, issueId: number, input: AttachmentInput): ActionResult {
  const issue = findIssue(state, issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'EDIT_ISSUE', issue.projectId);
  if (denied) return denied;
  if (!input.name.trim()) return fail('VALIDATION', 'Tệp không có tên.');
  if (input.size > MAX_ATTACHMENT_BYTES) return fail('VALIDATION', `"${input.name}" vượt quá giới hạn 10 MB của bản mẫu.`);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.attachments.push({ id, issueId, uploaderId: ctx.actorId, ...input, createdAt: ctx.now });
    audit(d, ctx, 'ATTACHMENT_ADDED', 'ISSUE', issueId, issue.projectId, `Đính kèm ${input.name} vào ${issue.key}`);
    return id;
  });
}
export function removeAttachment(state: DemoState, ctx: ActionContext, attachmentId: number): ActionResult {
  const file = state.attachments.find((a) => a.id === attachmentId);
  if (!file) return fail('NOT_FOUND', 'Tệp không còn tồn tại.');
  const issue = findIssue(state, file.issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  if (file.uploaderId !== ctx.actorId) {
    const denied = requirePerm(state, ctx, 'EDIT_ISSUE', issue.projectId);
    if (denied) return denied;
  } else {
    const denied = requirePerm(state, ctx, 'VIEW_PROJECT', issue.projectId);
    if (denied) return denied;
  }
  return tx(state, ctx, (d) => {
    d.attachments = d.attachments.filter((a) => a.id !== attachmentId);
    audit(d, ctx, 'ATTACHMENT_REMOVED', 'ISSUE', issue.id, issue.projectId, `Xóa tệp ${file.name} khỏi ${issue.key}`);
  });
}

// ───────────────────────────── UC07: issue type ─────────────────────────────

export type IssueTypeInput = { name: string; description: string; icon: IssueTypeIcon; color: string };
function typeErrors(s: DemoState, id: number | null, input: IssueTypeInput) {
  const errors: Record<string, string> = { ...textError(input.name, 'name', 'Tên loại', 50) };
  if (s.issueTypes.some((t) => t.id !== id && lower(t.name) === lower(input.name))) errors.name = 'Tên loại đã tồn tại.';
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) errors.color = 'Màu dạng #RRGGBB.';
  return errors;
}
export function createIssueType(state: DemoState, ctx: ActionContext, input: IssueTypeInput): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const errors = typeErrors(state, null, input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.issueTypes.push({ id, ...input, name: input.name.trim(), description: input.description.trim() });
    audit(d, ctx, 'ISSUE_TYPE_CREATED', 'ISSUE_TYPE', id, null, `Tạo loại ${input.name.trim()}`);
    return id;
  });
}
export function updateIssueType(state: DemoState, ctx: ActionContext, typeId: number, input: IssueTypeInput): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  if (!findType(state, typeId)) return fail('NOT_FOUND', 'Không tìm thấy loại công việc.');
  const errors = typeErrors(state, typeId, input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    Object.assign(findType(d, typeId)!, { ...input, name: input.name.trim(), description: input.description.trim() });
    audit(d, ctx, 'ISSUE_TYPE_UPDATED', 'ISSUE_TYPE', typeId, null, `Sửa loại ${input.name.trim()}`);
    return typeId;
  });
}
export function deleteIssueType(state: DemoState, ctx: ActionContext, typeId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const type = findType(state, typeId);
  if (!type) return fail('NOT_FOUND', 'Không tìm thấy loại công việc.');
  const used = state.issues.filter((i) => i.typeId === typeId).length;
  if (used) return fail('CONFLICT', `Loại "${type.name}" đang được ${used} công việc sử dụng.`);
  const projects = state.projectIssueTypes.filter((pt) => pt.typeId === typeId).length;
  if (projects) return fail('CONFLICT', `Loại "${type.name}" đang gán cho ${projects} dự án. Gỡ khỏi dự án trước.`);
  return tx(state, ctx, (d) => {
    d.issueTypes = d.issueTypes.filter((t) => t.id !== typeId);
    audit(d, ctx, 'ISSUE_TYPE_DELETED', 'ISSUE_TYPE', typeId, null, `Xóa loại ${type.name}`);
  });
}
export function assignTypeToProject(state: DemoState, ctx: ActionContext, projectId: number, typeId: number): ActionResult {
  if (!findProject(state, projectId)) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'EDIT_PROJECT', projectId);
  if (denied) return denied;
  if (!findType(state, typeId)) return fail('NOT_FOUND', 'Không tìm thấy loại công việc.');
  if (state.projectIssueTypes.some((pt) => pt.projectId === projectId && pt.typeId === typeId)) return fail('CONFLICT', 'Loại đã được gán.');
  return tx(state, ctx, (d) => {
    const first = !d.projectIssueTypes.some((pt) => pt.projectId === projectId);
    d.projectIssueTypes.push({ projectId, typeId, isDefault: first });
    audit(d, ctx, 'PROJECT_TYPE_ASSIGNED', 'PROJECT', projectId, projectId, `Gán loại ${findType(d, typeId)!.name}`);
  });
}
export function removeTypeFromProject(state: DemoState, ctx: ActionContext, projectId: number, typeId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'EDIT_PROJECT', projectId);
  if (denied) return denied;
  const link = state.projectIssueTypes.find((pt) => pt.projectId === projectId && pt.typeId === typeId);
  if (!link) return fail('NOT_FOUND', 'Loại chưa được gán cho dự án.');
  if (link.isDefault) return fail('CONFLICT', 'Không thể gỡ loại mặc định. Chọn loại mặc định khác trước.');
  const used = projectIssues(state, projectId).filter((i) => i.typeId === typeId).length;
  if (used) return fail('CONFLICT', `Còn ${used} công việc thuộc loại này trong dự án.`);
  return tx(state, ctx, (d) => {
    d.projectIssueTypes = d.projectIssueTypes.filter((pt) => !(pt.projectId === projectId && pt.typeId === typeId));
    audit(d, ctx, 'PROJECT_TYPE_REMOVED', 'PROJECT', projectId, projectId, `Gỡ loại ${findType(d, typeId)?.name}`);
  });
}
export function setDefaultType(state: DemoState, ctx: ActionContext, projectId: number, typeId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'EDIT_PROJECT', projectId);
  if (denied) return denied;
  if (!state.projectIssueTypes.some((pt) => pt.projectId === projectId && pt.typeId === typeId)) return fail('NOT_FOUND', 'Loại chưa được gán cho dự án.');
  return tx(state, ctx, (d) => {
    for (const pt of d.projectIssueTypes) if (pt.projectId === projectId) pt.isDefault = pt.typeId === typeId;
    audit(d, ctx, 'PROJECT_DEFAULT_TYPE', 'PROJECT', projectId, projectId, `Loại mặc định: ${findType(d, typeId)!.name}`);
  });
}

// ───────────────────────────── UC08: status, workflow ─────────────────────────────

export type StatusInput = { name: string; category: StatusCategory; color: string };
function statusErrors(s: DemoState, id: number | null, input: StatusInput) {
  const errors: Record<string, string> = { ...textError(input.name, 'name', 'Tên trạng thái', 50) };
  if (s.statuses.some((st) => st.id !== id && lower(st.name) === lower(input.name))) errors.name = 'Tên trạng thái đã tồn tại.';
  if (!['TO_DO', 'IN_PROGRESS', 'DONE'].includes(input.category)) errors.category = 'Nhóm trạng thái không hợp lệ.';
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) errors.color = 'Màu dạng #RRGGBB.';
  return errors;
}
export function createStatus(state: DemoState, ctx: ActionContext, input: StatusInput): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const errors = statusErrors(state, null, input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.statuses.push({ id, ...input, name: input.name.trim() });
    audit(d, ctx, 'STATUS_CREATED', 'STATUS', id, null, `Tạo trạng thái ${input.name.trim()}`);
    return id;
  });
}
/** Đổi category ảnh hưởng ngay tới backlog/report (DONE theo category). */
export function updateStatus(state: DemoState, ctx: ActionContext, statusId: number, input: StatusInput): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  if (!findStatus(state, statusId)) return fail('NOT_FOUND', 'Không tìm thấy trạng thái.');
  const errors = statusErrors(state, statusId, input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    Object.assign(findStatus(d, statusId)!, { ...input, name: input.name.trim() });
    audit(d, ctx, 'STATUS_UPDATED', 'STATUS', statusId, null, `Sửa trạng thái ${input.name.trim()}`);
    return statusId;
  });
}
export function deleteStatus(state: DemoState, ctx: ActionContext, statusId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const status = findStatus(state, statusId);
  if (!status) return fail('NOT_FOUND', 'Không tìm thấy trạng thái.');
  const used = state.issues.filter((i) => i.statusId === statusId).length;
  if (used) return fail('CONFLICT', `Trạng thái "${status.name}" đang được ${used} công việc sử dụng.`);
  return tx(state, ctx, (d) => {
    d.statuses = d.statuses.filter((st) => st.id !== statusId);
    d.columnStatuses = d.columnStatuses.filter((m) => m.statusId !== statusId);
    d.workflowRules = d.workflowRules.filter((r) => r.fromStatusId !== statusId && r.toStatusId !== statusId);
    audit(d, ctx, 'STATUS_DELETED', 'STATUS', statusId, null, `Xóa trạng thái ${status.name} (gỡ ánh xạ và cạnh workflow liên quan)`);
  });
}
export function addWorkflowRule(state: DemoState, ctx: ActionContext, fromStatusId: number, toStatusId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  if (!findStatus(state, fromStatusId) || !findStatus(state, toStatusId)) return fail('NOT_FOUND', 'Trạng thái không tồn tại.');
  if (fromStatusId === toStatusId) return fail('VALIDATION', 'Trạng thái nguồn và đích phải khác nhau.');
  if (state.workflowRules.some((r) => r.fromStatusId === fromStatusId && r.toStatusId === toStatusId)) return fail('CONFLICT', 'Cạnh chuyển này đã tồn tại.');
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.workflowRules.push({ id, fromStatusId, toStatusId });
    audit(d, ctx, 'WORKFLOW_RULE_ADDED', 'WORKFLOW', id, null, `${findStatus(d, fromStatusId)!.name} → ${findStatus(d, toStatusId)!.name}`);
    return id;
  });
}
export function removeWorkflowRule(state: DemoState, ctx: ActionContext, ruleId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const rule = state.workflowRules.find((r) => r.id === ruleId);
  if (!rule) return fail('NOT_FOUND', 'Cạnh chuyển không tồn tại.');
  return tx(state, ctx, (d) => {
    d.workflowRules = d.workflowRules.filter((r) => r.id !== ruleId);
    audit(d, ctx, 'WORKFLOW_RULE_REMOVED', 'WORKFLOW', ruleId, null, `${findStatus(d, rule.fromStatusId)?.name} → ${findStatus(d, rule.toStatusId)?.name}`);
  });
}

// ───────────────────────────── UC09: role, permission ─────────────────────────────

export type RoleInput = { name: string; scope: RoleScope; description: string };
export function createRole(state: DemoState, ctx: ActionContext, input: RoleInput): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const name = input.name.trim().toUpperCase();
  const errors: Record<string, string> = {};
  if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(name)) errors.name = 'Tên role 3–50 ký tự IN HOA, số hoặc gạch dưới.';
  else if (state.roles.some((r) => r.name === name)) errors.name = 'Tên role đã tồn tại.';
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.roles.push({ id, name, scope: input.scope, reserved: false, description: input.description.trim() });
    audit(d, ctx, 'ROLE_CREATED', 'ROLE', id, null, `Tạo role ${name}`);
    return id;
  });
}
export function updateRole(state: DemoState, ctx: ActionContext, roleId: number, input: { name: string; description: string }): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const role = findRole(state, roleId);
  if (!role) return fail('NOT_FOUND', 'Không tìm thấy role.');
  const name = input.name.trim().toUpperCase();
  if ((role.reserved || role.name === PM_ROLE) && name !== role.name) return fail('CONFLICT', `Role ${role.name} có nghĩa nghiệp vụ cố định, không đổi tên.`);
  if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(name)) return fail('VALIDATION', 'Tên role không hợp lệ.', { name: 'Tên role 3–50 ký tự IN HOA, số hoặc gạch dưới.' });
  if (state.roles.some((r) => r.id !== roleId && r.name === name)) return fail('VALIDATION', 'Tên role đã tồn tại.', { name: 'Tên role đã tồn tại.' });
  return tx(state, ctx, (d) => {
    Object.assign(findRole(d, roleId)!, { name, description: input.description.trim() });
    audit(d, ctx, 'ROLE_UPDATED', 'ROLE', roleId, null, `Sửa role ${name}`);
    return roleId;
  });
}
export function deleteRole(state: DemoState, ctx: ActionContext, roleId: number): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const role = findRole(state, roleId);
  if (!role) return fail('NOT_FOUND', 'Không tìm thấy role.');
  if (role.reserved || role.name === PM_ROLE) return fail('CONFLICT', `Role ${role.name} là role hệ thống, không thể xóa.`);
  const used = state.userRoles.filter((a) => a.roleId === roleId).length + state.memberships.filter((m) => m.roleId === roleId).length;
  if (used) return fail('CONFLICT', `Role đang được dùng bởi ${used} lượt gán. Gỡ khỏi người dùng/thành viên trước.`);
  return tx(state, ctx, (d) => {
    d.roles = d.roles.filter((r) => r.id !== roleId);
    d.rolePermissions = d.rolePermissions.filter((rp) => rp.roleId !== roleId);
    audit(d, ctx, 'ROLE_DELETED', 'ROLE', roleId, null, `Xóa role ${role.name}`);
  });
}
/** Lưu toàn bộ tập quyền của role; SYSTEM_ADMIN reserved giữ đủ quyền để không khóa hệ thống. */
export function setRolePermissions(state: DemoState, ctx: ActionContext, roleId: number, codes: PermissionCode[]): ActionResult {
  const denied = requirePerm(state, ctx, 'MANAGE_CONFIG');
  if (denied) return denied;
  const role = findRole(state, roleId);
  if (!role) return fail('NOT_FOUND', 'Không tìm thấy role.');
  if (role.reserved) return fail('CONFLICT', `${role.name} luôn có đủ quyền, không chỉnh trong bản này.`);
  const valid = new Set(state.permissions.map((p) => p.code));
  if (codes.some((c) => !valid.has(c))) return fail('VALIDATION', 'Có quyền không tồn tại trong danh mục.');
  return tx(state, ctx, (d) => {
    d.rolePermissions = [...d.rolePermissions.filter((rp) => rp.roleId !== roleId), ...[...new Set(codes)].map((code) => ({ roleId, code }))];
    audit(d, ctx, 'ROLE_PERMISSIONS_CHANGED', 'ROLE', roleId, null, `${role.name}: ${codes.length} quyền`);
    return roleId;
  });
}

// ───────────────────────────── UC10–11: board, column, mapping ─────────────────────────────

function boardGuard(state: DemoState, ctx: ActionContext, boardId: number) {
  const board = findBoard(state, boardId);
  if (!board) return fail('NOT_FOUND', 'Không tìm thấy bảng.');
  const denied = requirePerm(state, ctx, 'MANAGE_BOARD', board.projectId);
  return denied ?? board;
}
export function createBoard(state: DemoState, ctx: ActionContext, projectId: number, name: string): ActionResult {
  if (!findProject(state, projectId)) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'MANAGE_BOARD', projectId);
  if (denied) return denied;
  const error = textError(name, 'name', 'Tên bảng', 100);
  if (error) return fail('VALIDATION', error.name, error);
  return tx(state, ctx, (d) => {
    const id = createDefaultBoard(d, projectId, name.trim());
    audit(d, ctx, 'BOARD_CREATED', 'BOARD', id, projectId, `Tạo bảng ${name.trim()}`);
    return id;
  });
}
export function renameBoard(state: DemoState, ctx: ActionContext, boardId: number, name: string): ActionResult {
  const board = boardGuard(state, ctx, boardId);
  if (isError(board)) return board;
  const error = textError(name, 'name', 'Tên bảng', 100);
  if (error) return fail('VALIDATION', error.name, error);
  return tx(state, ctx, (d) => {
    findBoard(d, boardId)!.name = name.trim();
    audit(d, ctx, 'BOARD_RENAMED', 'BOARD', boardId, board.projectId, `Đổi tên bảng thành ${name.trim()}`);
    return boardId;
  });
}
/** Chỉ xóa cột/mapping/rank của board; issue và project giữ nguyên. */
export function deleteBoard(state: DemoState, ctx: ActionContext, boardId: number): ActionResult {
  const board = boardGuard(state, ctx, boardId);
  if (isError(board)) return board;
  return tx(state, ctx, (d) => {
    const columnIds = new Set(d.columns.filter((c) => c.boardId === boardId).map((c) => c.id));
    d.boards = d.boards.filter((b) => b.id !== boardId);
    d.columns = d.columns.filter((c) => !columnIds.has(c.id));
    d.columnStatuses = d.columnStatuses.filter((m) => !columnIds.has(m.columnId));
    d.boardRanks = d.boardRanks.filter((r) => r.boardId !== boardId);
    audit(d, ctx, 'BOARD_DELETED', 'BOARD', boardId, board.projectId, `Xóa bảng ${board.name}`);
  });
}

function columnErrors(name: string, wipLimit: number) {
  const errors: Record<string, string> = { ...textError(name, 'name', 'Tên cột', 100) };
  if (!Number.isInteger(wipLimit) || wipLimit < 0 || wipLimit > 999) errors.wipLimit = 'WIP là số nguyên từ 0 (không giới hạn) đến 999.';
  return errors;
}
export function createColumn(state: DemoState, ctx: ActionContext, boardId: number, input: { name: string; wipLimit: number }): ActionResult {
  const board = boardGuard(state, ctx, boardId);
  if (isError(board)) return board;
  const errors = columnErrors(input.name, input.wipLimit);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.columns.push({ id, boardId, name: input.name.trim(), wipLimit: input.wipLimit, position: boardColumns(d, boardId).length });
    audit(d, ctx, 'COLUMN_CREATED', 'COLUMN', id, board.projectId, `Thêm cột ${input.name.trim()} vào ${board.name}`);
    return id;
  });
}
/** WIP mới thấp hơn số issue hiện có bị chặn trước khi đổi bất kỳ trường nào (kể cả tên). */
export function updateColumn(state: DemoState, ctx: ActionContext, columnId: number, input: { name: string; wipLimit: number }): ActionResult {
  const column = findColumn(state, columnId);
  if (!column) return fail('NOT_FOUND', 'Không tìm thấy cột.');
  const board = boardGuard(state, ctx, column.boardId);
  if (isError(board)) return board;
  const errors = columnErrors(input.name, input.wipLimit);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  const load = columnLoad(state, columnId);
  if (input.wipLimit > 0 && input.wipLimit < load)
    return fail('CONFLICT', `Cột đang có ${load} công việc, không thể đặt WIP ${input.wipLimit}.`, { wipLimit: `Tối thiểu ${load} hoặc 0.` });
  return tx(state, ctx, (d) => {
    Object.assign(findColumn(d, columnId)!, { name: input.name.trim(), wipLimit: input.wipLimit });
    audit(d, ctx, 'COLUMN_UPDATED', 'COLUMN', columnId, board.projectId, `Cột ${input.name.trim()}: WIP ${input.wipLimit || 'không giới hạn'}`);
    return columnId;
  });
}
export function deleteColumn(state: DemoState, ctx: ActionContext, columnId: number): ActionResult {
  const column = findColumn(state, columnId);
  if (!column) return fail('NOT_FOUND', 'Không tìm thấy cột.');
  const board = boardGuard(state, ctx, column.boardId);
  if (isError(board)) return board;
  const load = columnLoad(state, columnId);
  if (load) return fail('CONFLICT', `Cột còn ${load} công việc theo ánh xạ. Chuyển việc hoặc gỡ ánh xạ trạng thái trước.`);
  return tx(state, ctx, (d) => {
    d.columns = d.columns.filter((c) => c.id !== columnId);
    d.columnStatuses = d.columnStatuses.filter((m) => m.columnId !== columnId);
    d.boardRanks = d.boardRanks.filter((r) => r.columnId !== columnId);
    boardColumns(d, column.boardId).forEach((c, index) => (c.position = index));
    audit(d, ctx, 'COLUMN_DELETED', 'COLUMN', columnId, board.projectId, `Xóa cột ${column.name}`);
  });
}
export function reorderColumns(state: DemoState, ctx: ActionContext, boardId: number, columnIds: number[]): ActionResult {
  const board = boardGuard(state, ctx, boardId);
  if (isError(board)) return board;
  const current = boardColumns(state, boardId).map((c) => c.id);
  if (columnIds.length !== current.length || new Set(columnIds).size !== columnIds.length || columnIds.some((id) => !current.includes(id)))
    return fail('CONFLICT', 'Danh sách cột đã thay đổi. Tải lại rồi sắp xếp lại.');
  return tx(state, ctx, (d) => {
    columnIds.forEach((id, index) => (findColumn(d, id)!.position = index));
    audit(d, ctx, 'COLUMNS_REORDERED', 'BOARD', boardId, board.projectId, `Sắp xếp cột ${board.name}`);
  });
}
/** Một status chỉ được ở một cột trong cùng board. */
export function mapStatus(state: DemoState, ctx: ActionContext, columnId: number, statusId: number): ActionResult {
  const column = findColumn(state, columnId);
  if (!column) return fail('NOT_FOUND', 'Không tìm thấy cột.');
  const board = boardGuard(state, ctx, column.boardId);
  if (isError(board)) return board;
  if (!findStatus(state, statusId)) return fail('NOT_FOUND', 'Không tìm thấy trạng thái.');
  const existing = columnForStatus(state, column.boardId, statusId);
  if (existing) return fail('CONFLICT', `Trạng thái đã thuộc cột "${existing.name}". Gỡ khỏi cột đó trước.`);
  return tx(state, ctx, (d) => {
    d.columnStatuses.push({ columnId, statusId });
    audit(d, ctx, 'STATUS_MAPPED', 'COLUMN', columnId, board.projectId, `${findStatus(d, statusId)!.name} → cột ${column.name}`);
  });
}
export function unmapStatus(state: DemoState, ctx: ActionContext, columnId: number, statusId: number): ActionResult {
  const column = findColumn(state, columnId);
  if (!column) return fail('NOT_FOUND', 'Không tìm thấy cột.');
  const board = boardGuard(state, ctx, column.boardId);
  if (isError(board)) return board;
  if (!state.columnStatuses.some((m) => m.columnId === columnId && m.statusId === statusId)) return fail('NOT_FOUND', 'Trạng thái chưa được ánh xạ vào cột này.');
  return tx(state, ctx, (d) => {
    d.columnStatuses = d.columnStatuses.filter((m) => !(m.columnId === columnId && m.statusId === statusId));
    audit(d, ctx, 'STATUS_UNMAPPED', 'COLUMN', columnId, board.projectId, `Gỡ ${findStatus(d, statusId)?.name} khỏi cột ${column.name}`);
  });
}

// ───────────────────────────── UC12: sprint ─────────────────────────────

export type SprintInput = { name: string; goal: string; startDate: string; endDate: string };
function sprintErrors(input: SprintInput) {
  const errors: Record<string, string> = { ...textError(input.name, 'name', 'Tên sprint', 100) };
  if (input.goal.length > 1000) errors.goal = 'Mục tiêu tối đa 1000 ký tự.';
  if (input.startDate && input.endDate && input.startDate >= input.endDate) errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu.';
  return errors;
}
function sprintGuard(state: DemoState, ctx: ActionContext, sprintId: number) {
  const sprint = findSprint(state, sprintId);
  if (!sprint) return fail('NOT_FOUND', 'Không tìm thấy sprint.');
  return requirePerm(state, ctx, 'MANAGE_SPRINT', sprint.projectId) ?? sprint;
}
export function createSprint(state: DemoState, ctx: ActionContext, projectId: number, input: SprintInput): ActionResult {
  if (!findProject(state, projectId)) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  const denied = requirePerm(state, ctx, 'MANAGE_SPRINT', projectId);
  if (denied) return denied;
  const errors = sprintErrors(input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    const id = nextId(d);
    d.sprints.push({
      id,
      projectId,
      name: input.name.trim(),
      goal: input.goal.trim(),
      state: 'FUTURE',
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      startedAt: null,
      completedAt: null,
      createdAt: ctx.now,
    });
    audit(d, ctx, 'SPRINT_CREATED', 'SPRINT', id, projectId, `Tạo ${input.name.trim()}`);
    return id;
  });
}
/** FUTURE sửa được mọi trường; ACTIVE chỉ tên/mục tiêu; CLOSED chỉ xem. */
export function updateSprint(state: DemoState, ctx: ActionContext, sprintId: number, input: SprintInput): ActionResult {
  const sprint = sprintGuard(state, ctx, sprintId);
  if (isError(sprint)) return sprint;
  if (sprint.state === 'CLOSED') return fail('CONFLICT', 'Sprint đã đóng chỉ dùng để xem lịch sử.');
  if (sprint.state === 'ACTIVE' && ((input.startDate || null) !== sprint.startDate || (input.endDate || null) !== sprint.endDate))
    return fail('CONFLICT', 'Sprint đang diễn ra chỉ được sửa tên và mục tiêu.');
  const errors = sprintErrors(input);
  if (Object.keys(errors).length) return fail('VALIDATION', 'Vui lòng kiểm tra lại thông tin.', errors);
  return tx(state, ctx, (d) => {
    Object.assign(findSprint(d, sprintId)!, {
      name: input.name.trim(),
      goal: input.goal.trim(),
      startDate: input.startDate || null,
      endDate: input.endDate || null,
    });
    audit(d, ctx, 'SPRINT_UPDATED', 'SPRINT', sprintId, sprint.projectId, `Sửa ${input.name.trim()}`);
    return sprintId;
  });
}
/** Xóa sprint nháp: gỡ link, issue trở về product backlog; lịch sử CLOSED khác giữ nguyên. */
export function deleteSprint(state: DemoState, ctx: ActionContext, sprintId: number): ActionResult {
  const sprint = sprintGuard(state, ctx, sprintId);
  if (isError(sprint)) return sprint;
  if (sprint.state !== 'FUTURE') return fail('CONFLICT', 'Chỉ xóa được sprint chưa bắt đầu.');
  return tx(state, ctx, (d) => {
    d.sprints = d.sprints.filter((sp) => sp.id !== sprintId);
    d.sprintIssues = d.sprintIssues.filter((l) => l.sprintId !== sprintId);
    audit(d, ctx, 'SPRINT_DELETED', 'SPRINT', sprintId, sprint.projectId, `Xóa ${sprint.name}`);
  });
}

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Bắt đầu: chỉ FUTURE, mỗi project tối đa một ACTIVE; chụp commitment và điểm burndown đầu tiên. */
export function startSprint(state: DemoState, ctx: ActionContext, sprintId: number): ActionResult {
  const sprint = sprintGuard(state, ctx, sprintId);
  if (isError(sprint)) return sprint;
  if (sprint.state !== 'FUTURE') return fail('CONFLICT', 'Chỉ bắt đầu được sprint chưa bắt đầu.');
  if (projectSprints(state, sprint.projectId).some((sp) => sp.state === 'ACTIVE'))
    return fail('CONFLICT', 'Hoàn tất sprint đang diễn ra trước khi bắt đầu sprint mới.');
  if (!sprintIssueList(state, sprintId).length) return fail('VALIDATION', 'Thêm ít nhất một công việc vào sprint trước khi bắt đầu.');
  return tx(state, ctx, (d) => {
    const sp = findSprint(d, sprintId)!;
    const today = ctx.now.slice(0, 10);
    sp.state = 'ACTIVE';
    sp.startedAt = ctx.now;
    sp.startDate = sp.startDate ?? today;
    sp.endDate = sp.endDate ?? addDays(sp.startDate, 14);
    const m = sprintMetrics(d, sprintId);
    d.sprintSnapshots = d.sprintSnapshots.filter((x) => x.sprintId !== sprintId);
    d.sprintSnapshots.push({
      sprintId,
      origin: 'START',
      baselineAvailable: true,
      committedPoints: m.totalPoints,
      committedCount: m.issueCount,
      completedPoints: null,
      completedCount: null,
      completionAvailable: false,
      completedIssueIds: [],
      unfinishedIssueIds: [],
    });
    pushBurndown(d, ctx, sprintId);
    const project = findProject(d, sp.projectId)!;
    for (const m2 of projectMembers(d, sp.projectId)) notify(d, ctx, m2.userId, 'SPRINT', `${sp.name} đã bắt đầu`, `Dự án ${project.name}`, project.id, null);
    audit(d, ctx, 'SPRINT_STARTED', 'SPRINT', sprintId, sp.projectId, `Bắt đầu ${sp.name}`);
    return sprintId;
  });
}

/**
 * Hoàn tất: chỉ ACTIVE; validate đích trước; chốt snapshot completed TRƯỚC khi chuyển việc chưa DONE.
 * Sprint chuyển CLOSED và giữ nguyên link của mọi issue để xem lịch sử.
 */
export function completeSprint(state: DemoState, ctx: ActionContext, sprintId: number, targetSprintId: number | null): ActionResult {
  const sprint = sprintGuard(state, ctx, sprintId);
  if (isError(sprint)) return sprint;
  if (sprint.state !== 'ACTIVE') return fail('CONFLICT', 'Chỉ hoàn tất được sprint đang diễn ra.');
  if (targetSprintId !== null) {
    const target = findSprint(state, targetSprintId);
    if (!target || target.projectId !== sprint.projectId || target.state !== 'FUTURE')
      return fail('VALIDATION', 'Sprint đích phải là sprint chưa bắt đầu của cùng dự án.');
  }
  return tx(state, ctx, (d) => {
    const issues = sprintIssueList(d, sprintId);
    const done = issues.filter((i) => isDone(d, i));
    const unfinished = issues.filter((i) => !isDone(d, i));
    const old = snapshotOf(d, sprintId);
    const m = sprintMetrics(d, sprintId);
    const snapshot = old ?? {
      sprintId,
      origin: 'OBSERVED' as const,
      baselineAvailable: false,
      committedPoints: m.totalPoints,
      committedCount: m.issueCount,
      completedPoints: null,
      completedCount: null,
      completionAvailable: false,
      completedIssueIds: [],
      unfinishedIssueIds: [],
    };
    Object.assign(snapshot, {
      completedPoints: m.donePoints,
      completedCount: m.doneCount,
      completionAvailable: true,
      completedIssueIds: done.map((i) => i.id),
      unfinishedIssueIds: unfinished.map((i) => i.id),
    });
    if (!old) d.sprintSnapshots.push(snapshot);
    pushBurndown(d, ctx, sprintId);
    const sp = findSprint(d, sprintId)!;
    sp.state = 'CLOSED';
    sp.completedAt = ctx.now;
    if (targetSprintId !== null) {
      for (const issue of unfinished) d.sprintIssues.push({ sprintId: targetSprintId, issueId: issue.id, position: null, addedAt: ctx.now });
    } else {
      const order = d.backlogOrder.find((o) => o.projectId === sp.projectId);
      if (order) order.issueIds.push(...unfinished.map((i) => i.id).filter((id) => !order.issueIds.includes(id)));
    }
    const where = targetSprintId === null ? 'product backlog' : findSprint(d, targetSprintId)!.name;
    audit(d, ctx, 'SPRINT_COMPLETED', 'SPRINT', sprintId, sp.projectId, `Hoàn tất ${sp.name}: ${done.length} xong, ${unfinished.length} chuyển về ${where}`);
    return sprintId;
  });
}

// ───────────────────────────── UC13–14: sprint backlog, product backlog ─────────────────────────────

/**
 * Chuyển issue giữa product backlog và sprint mở (targetSprintId null = về backlog).
 * Bản demo thực hiện trong một transition; khi nối BE, chuyển sprint→sprint cần gỡ rồi thêm.
 */
export function moveIssueToSprint(state: DemoState, ctx: ActionContext, issueId: number, targetSprintId: number | null): ActionResult {
  const issue = findIssue(state, issueId);
  if (!issue) return fail('NOT_FOUND', 'Công việc không còn tồn tại.');
  const denied = requirePerm(state, ctx, 'MANAGE_SPRINT', issue.projectId);
  if (denied) return denied;
  const source = openSprintOf(state, issueId);
  if ((source?.id ?? null) === targetSprintId) return { ok: true, state };
  if (targetSprintId !== null) {
    const target = findSprint(state, targetSprintId);
    if (!target || target.projectId !== issue.projectId) return fail('VALIDATION', 'Sprint không thuộc dự án của công việc.');
    if (target.state === 'CLOSED') return fail('CONFLICT', 'Không thay đổi công việc của sprint đã đóng.');
  }
  return tx(state, ctx, (d) => {
    if (source) d.sprintIssues = d.sprintIssues.filter((l) => !(l.sprintId === source.id && l.issueId === issueId));
    const order = d.backlogOrder.find((o) => o.projectId === issue.projectId);
    if (targetSprintId !== null) {
      d.sprintIssues.push({ sprintId: targetSprintId, issueId, position: null, addedAt: ctx.now });
      if (order) order.issueIds = order.issueIds.filter((id) => id !== issueId);
    } else if (order && !order.issueIds.includes(issueId)) order.issueIds.push(issueId);
    const to = targetSprintId === null ? 'product backlog' : findSprint(d, targetSprintId)!.name;
    audit(d, ctx, 'SPRINT_SCOPE_CHANGED', 'ISSUE', issueId, issue.projectId, `${issue.key} → ${to}`);
    return issueId;
  });
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));

/** Nhận danh sách ĐẦY ĐỦ ID của product backlog; thiếu/thừa/trùng là dữ liệu đã thay đổi. */
export function reorderBacklog(state: DemoState, ctx: ActionContext, projectId: number, issueIds: number[]): ActionResult {
  if (!findProject(state, projectId)) return fail('NOT_FOUND', 'Không tìm thấy dự án.');
  if (!can(state, ctx.actorId, 'EDIT_ISSUE', projectId) && !can(state, ctx.actorId, 'MANAGE_SPRINT', projectId))
    return fail('FORBIDDEN', 'Vai trò hiện tại không được sắp xếp backlog.');
  if (!sameSet(issueIds, productBacklog(state, projectId).map((i) => i.id))) return fail('CONFLICT', 'Danh sách đã thay đổi. Tải lại backlog rồi sắp xếp lại.');
  return tx(state, ctx, (d) => {
    d.backlogOrder = [...d.backlogOrder.filter((o) => o.projectId !== projectId), { projectId, issueIds: [...issueIds] }];
  });
}
export function reorderSprint(state: DemoState, ctx: ActionContext, sprintId: number, issueIds: number[]): ActionResult {
  const sprint = sprintGuard(state, ctx, sprintId);
  if (isError(sprint)) return sprint;
  if (sprint.state === 'CLOSED') return fail('CONFLICT', 'Không sắp xếp sprint đã đóng.');
  if (!sameSet(issueIds, sprintIssueList(state, sprintId).map((i) => i.id))) return fail('CONFLICT', 'Danh sách đã thay đổi. Tải lại sprint rồi sắp xếp lại.');
  return tx(state, ctx, (d) => {
    for (const link of d.sprintIssues) if (link.sprintId === sprintId) link.position = issueIds.indexOf(link.issueId);
  });
}

// ───────────────────────────── UC15: kéo card trên board ─────────────────────────────

export type MoveCardInput = {
  boardId: number;
  sprintId: number;
  issueId: number;
  columnId: number;
  statusId: number;
  /** Chỉ số chèn 0-based trong danh sách cột đầy đủ (theo sprint) sau khi bỏ chính card. */
  position: number;
  expectedVersion: number;
};
export function moveCard(state: DemoState, ctx: ActionContext, input: MoveCardInput): ActionResult {
  const board = findBoard(state, input.boardId);
  const issue = findIssue(state, input.issueId);
  const column = findColumn(state, input.columnId);
  if (!board || !issue || !column) return fail('NOT_FOUND', 'Không tìm thấy bảng, cột hoặc công việc.');
  if (column.boardId !== board.id || issue.projectId !== board.projectId) return fail('VALIDATION', 'Cột hoặc công việc không thuộc bảng này.');
  const denied = requirePerm(state, ctx, 'EDIT_ISSUE', board.projectId);
  if (denied) return denied;
  if (!columnStatusIds(state, column.id).includes(input.statusId)) return fail('VALIDATION', 'Trạng thái chưa được ánh xạ vào cột đích.');
  if (!sprintIssueList(state, input.sprintId).some((i) => i.id === issue.id)) return fail('VALIDATION', 'Công việc không thuộc sprint đang xem.');
  if (issue.version !== input.expectedVersion) return fail('CONFLICT', 'Dữ liệu mẫu đã thay đổi. Bảng đã được tải lại, hãy kéo lại.');
  if (!canTransition(state, issue.statusId, input.statusId))
    return fail('VALIDATION', `Workflow không cho phép chuyển từ "${findStatus(state, issue.statusId)?.name}" sang "${findStatus(state, input.statusId)?.name}".`);
  const wip = checkWip(state, board.projectId, issue.statusId, input.statusId);
  if (wip) return wip;
  const view = boardView(state, board.id, input.sprintId);
  const target = view.columns.find((c) => c.column.id === column.id)!.issues.filter((i) => i.id !== issue.id);
  if (!Number.isInteger(input.position) || input.position < 0 || input.position > target.length) return fail('VALIDATION', 'Vị trí card không hợp lệ.');
  return tx(state, ctx, (d) => {
    const it = findIssue(d, issue.id)!;
    const statusChanged = it.statusId !== input.statusId;
    if (statusChanged) {
      const detail = `${it.key}: ${findStatus(d, it.statusId)?.name} → ${findStatus(d, input.statusId)?.name}`;
      it.statusId = input.statusId;
      notify(d, ctx, it.reporterId, 'STATUS', `${it.key} đổi trạng thái`, detail, it.projectId, it.id);
      audit(d, ctx, 'ISSUE_STATUS_CHANGED', 'ISSUE', it.id, it.projectId, detail);
    } else audit(d, ctx, 'CARD_REORDERED', 'ISSUE', it.id, it.projectId, `${it.key}: đổi vị trí trong cột ${column.name}`);
    it.version += 1;
    it.updatedAt = ctx.now;
    const ordered = [...target];
    ordered.splice(input.position, 0, it);
    d.boardRanks = d.boardRanks.filter((r) => !(r.boardId === board.id && (r.issueId === it.id || (r.columnId === column.id && ordered.some((o) => o.id === r.issueId)))));
    ordered.forEach((o, position) => d.boardRanks.push({ boardId: board.id, columnId: column.id, issueId: o.id, position }));
    return it.id;
  });
}

// ───────────────────────────── UC17: notification ─────────────────────────────

export function markNotification(state: DemoState, ctx: ActionContext, id: number, read: boolean): ActionResult {
  const n = state.notifications.find((x) => x.id === id);
  if (!n) return fail('NOT_FOUND', 'Thông báo không còn tồn tại.');
  if (n.recipientId !== ctx.actorId) return fail('FORBIDDEN', 'Thông báo không thuộc người dùng hiện tại.');
  return tx(state, ctx, (d) => {
    d.notifications.find((x) => x.id === id)!.read = read;
  });
}
/** Chỉ chạm thông báo chưa đọc của persona đang đăng nhập. */
export function markAllRead(state: DemoState, ctx: ActionContext): ActionResult {
  const me = actor(state, ctx);
  if (isError(me)) return me;
  return tx(state, ctx, (d) => {
    let updated = 0;
    for (const n of d.notifications)
      if (n.recipientId === me.id && !n.read) {
        n.read = true;
        updated += 1;
      }
    return updated;
  });
}
export function deleteNotification(state: DemoState, ctx: ActionContext, id: number): ActionResult {
  const n = state.notifications.find((x) => x.id === id);
  if (!n) return fail('NOT_FOUND', 'Thông báo không còn tồn tại.');
  if (n.recipientId !== ctx.actorId) return fail('FORBIDDEN', 'Thông báo không thuộc người dùng hiện tại.');
  return tx(state, ctx, (d) => {
    d.notifications = d.notifications.filter((x) => x.id !== id);
  });
}
