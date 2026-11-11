import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, DEMO_USER } from '../src/features/ui-demo/fixtures.ts';
import * as L from '../src/features/ui-demo/logic.ts';

// Các test kiểm transition của bộ giao diện mẫu; không gọi API hay DB.
const now = '2026-11-12T10:00:00.000Z';
const as = (actorId) => ({ actorId, now });
const pm = as(DEMO_USER.pm);
const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? '' : `${result.code}: ${result.message}`);
  return result.state;
};

test('seed: mỗi issue một bản ghi, project SCR đủ dữ liệu phân trang', () => {
  const s = createSeed();
  assert.equal(new Set(s.issues.map((i) => i.id)).size, s.issues.length);
  assert.ok(L.projectIssues(s, 1).length >= 25);
  const page = L.searchIssues(s, 1, {}, 'number', 'asc', 3, 10);
  assert.equal(page.page, 3);
  assert.equal(page.items.length, 10);
  // Trang vượt tổng bị kẹp về trang cuối.
  assert.equal(L.searchIssues(s, 1, {}, 'number', 'asc', 99, 50).page, 1);
});

test('DONE theo category: status tên "Đã nghiệm thu" vẫn là hoàn thành', () => {
  const s = createSeed();
  const issue = L.findIssue(s, 127);
  assert.equal(L.findStatus(s, issue.statusId).name, 'Đã nghiệm thu');
  assert.equal(L.isDone(s, issue), true);
  const m = L.sprintMetrics(s, 104);
  assert.deepEqual([m.totalPoints, m.remainingPoints, m.issueCount, m.remainingCount], [25, 20, 8, 6]);
});

test('product backlog: loại DONE và sprint mở, giữ việc chỉ có link CLOSED', () => {
  const s = createSeed();
  const ids = L.productBacklog(s, 1).map((i) => i.id);
  assert.ok(ids.includes(123), 'SCR-23 thuộc Sprint 02 đã đóng vẫn ở backlog');
  assert.ok(!ids.includes(124) && !ids.includes(131) && !ids.includes(105));
});

test('search giữ đúng scope project và lọc AND', () => {
  const s = createSeed();
  const mob = L.searchIssues(s, 3, {}, 'number', 'asc', 1, 50);
  assert.ok(mob.items.every((i) => i.projectId === 3));
  const bugsUnassigned = L.searchIssues(s, 1, { typeId: 3, assignee: 'none' }, 'number', 'asc', 1, 50).items;
  assert.deepEqual(bugsUnassigned.map((i) => i.key), ['SCR-29']);
  assert.deepEqual(L.searchIssues(s, 1, { keyword: 'mob-1' }, 'number', 'asc', 1, 50).items, []);
});

test('board: cột WIP đầy chặn move, lỗi giữ nguyên state đầu vào', () => {
  const s = createSeed();
  const before = structuredClone(s);
  const blocked = L.moveCard(s, pm, { boardId: 201, sprintId: 104, issueId: 126, columnId: 302, statusId: 2, position: 0, expectedVersion: L.findIssue(s, 126).version });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'CONFLICT');
  assert.deepEqual(s, before);
  // Đưa SCR-24 sang Hoàn thành giải phóng WIP rồi SCR-26 vào được.
  let next = ok(L.moveCard(s, pm, { boardId: 201, sprintId: 104, issueId: 124, columnId: 303, statusId: 5, position: 0, expectedVersion: L.findIssue(s, 124).version }));
  assert.equal(L.findIssue(next, 124).version, L.findIssue(s, 124).version + 1);
  next = ok(L.moveCard(next, pm, { boardId: 201, sprintId: 104, issueId: 126, columnId: 302, statusId: 2, position: 1, expectedVersion: L.findIssue(next, 126).version }));
  const view = L.boardView(next, 201, 104);
  assert.deepEqual(view.columns[1].issues.map((i) => i.id), [125, 126]);
  // Status chưa map vẫn hiện trong nhóm riêng.
  assert.deepEqual(view.unmapped.map((i) => i.key), ['SCR-30']);
});

test('board: version cũ, workflow không có cạnh và status chưa map đều bị chặn', () => {
  const s = createSeed();
  const v = L.findIssue(s, 126).version;
  assert.equal(L.moveCard(s, pm, { boardId: 201, sprintId: 104, issueId: 126, columnId: 303, statusId: 5, position: 0, expectedVersion: v + 5 }).code, 'CONFLICT');
  assert.equal(L.moveCard(s, pm, { boardId: 201, sprintId: 104, issueId: 126, columnId: 303, statusId: 4, position: 0, expectedVersion: v }).code, 'VALIDATION');
  assert.equal(L.moveCard(s, pm, { boardId: 201, sprintId: 104, issueId: 126, columnId: 303, statusId: 2, position: 0, expectedVersion: v }).code, 'VALIDATION');
});

test('reorder nhận đủ scope; danh sách con do bộ lọc bị từ chối', () => {
  const s = createSeed();
  const ids = L.productBacklog(s, 1).map((i) => i.id);
  assert.equal(L.reorderBacklog(s, pm, 1, ids.slice(1)).code, 'CONFLICT');
  assert.equal(L.reorderBacklog(s, pm, 1, [...ids, ids[0]]).code, 'CONFLICT');
  const next = ok(L.reorderBacklog(s, pm, 1, [...ids].reverse()));
  assert.deepEqual(L.productBacklog(next, 1).map((i) => i.id), [...ids].reverse());
  assert.equal(L.productBacklog(next, 1).length, ids.length);
});

test('hoàn tất sprint giữ CLOSED và link lịch sử; snapshot velocity không bị sửa ngược', () => {
  const s = createSeed();
  assert.equal(L.startSprint(s, pm, 105).code, 'CONFLICT', 'chỉ một ACTIVE mỗi project');
  const closed = ok(L.completeSprint(s, pm, 104, null));
  const sprint = L.findSprint(closed, 104);
  assert.equal(sprint.state, 'CLOSED');
  assert.equal(L.sprintIssueList(closed, 104).length, 8, 'link của sprint đóng vẫn giữ');
  const snap = L.snapshotOf(closed, 104);
  assert.deepEqual([snap.completedPoints, snap.completedCount], [5, 2]);
  assert.ok(L.productBacklog(closed, 1).some((i) => i.id === 124), 'việc chưa xong về product backlog');
  // Sửa points của việc DONE sau khi đóng không đổi completed snapshot/velocity.
  const issue = L.findIssue(closed, 128);
  const edited = ok(L.updateIssue(closed, pm, 128, { points: 13 }, issue.version));
  const v = L.velocity(edited, 1).find((x) => x.sprint.id === 104);
  assert.equal(v.completed, 5);
  // Sprint cũ không có snapshot hiển thị là không có dữ liệu thay vì 0.
  assert.equal(L.velocity(edited, 1).find((x) => x.sprint.id === 101).available, false);
  const started = ok(L.startSprint(edited, pm, 105));
  assert.equal(L.findSprint(started, 105).state, 'ACTIVE');
  assert.equal(L.snapshotOf(started, 105).committedPoints, 18);
});

test('hoàn tất sprint chuyển việc chưa xong sang sprint FUTURE cùng project', () => {
  const s = createSeed();
  assert.equal(L.completeSprint(s, pm, 104, 103).code, 'VALIDATION');
  const next = ok(L.completeSprint(s, pm, 104, 105));
  assert.ok(L.sprintIssueList(next, 105).some((i) => i.id === 124));
  assert.ok(L.sprintIssueList(next, 104).some((i) => i.id === 124), 'vẫn hiện trong lịch sử sprint đóng');
});

test('burndown: đổi point trong sprint ACTIVE ghi điểm mới; render/đọc không ghi', () => {
  const s = createSeed();
  const count = s.burndownEvents.length;
  L.boardView(s, 201, 104);
  L.sprintMetrics(s, 104);
  assert.equal(s.burndownEvents.length, count);
  const next = ok(L.updateIssue(s, pm, 126, { points: 5 }, L.findIssue(s, 126).version));
  assert.equal(next.burndownEvents.length, count + 1);
  assert.equal(next.burndownEvents.at(-1).totalPoints, 27);
});

test('workflow và parent: chặn chuyển không có cạnh và chu kỳ cha-con', () => {
  const s = createSeed();
  assert.equal(L.updateIssue(s, pm, 126, { statusId: 4 }, L.findIssue(s, 126).version).code, 'VALIDATION');
  assert.equal(L.updateIssue(s, pm, 124, { parentId: 141 }, L.findIssue(s, 124).version).code, 'VALIDATION');
  assert.equal(L.updateIssue(s, pm, 124, { parentId: 124 }, L.findIssue(s, 124).version).code, 'VALIDATION');
  assert.equal(L.updateIssue(s, pm, 124, { assigneeId: DEMO_USER.outsider }, L.findIssue(s, 124).version).code, 'VALIDATION');
});

test('xóa issue: chặn khi còn việc con/tệp; key không tái dùng sau xóa', () => {
  const s = createSeed();
  assert.equal(L.deleteIssue(s, pm, 124, L.findIssue(s, 124).version).code, 'CONFLICT');
  const deleted = ok(L.deleteIssue(s, pm, 136, L.findIssue(s, 136).version));
  assert.equal(L.findIssue(deleted, 136), undefined);
  const created = ok(L.createIssue(deleted, pm, 1, { title: 'Việc mới', typeId: 2, priority: 'MEDIUM' }));
  const fresh = L.findIssue(created, created.entityId ?? 0) ?? created.issues.at(-1);
  assert.equal(fresh.key, 'SCR-46');
  assert.ok(L.productBacklog(created, 1).some((i) => i.key === 'SCR-46'));
});

test('quyền: giữ admin cuối, tối đa một PM, role dự án không gán SYSTEM_ADMIN', () => {
  const s = createSeed();
  const admin = as(DEMO_USER.admin);
  assert.equal(L.setUserEnabled(s, admin, DEMO_USER.admin, false).code, 'CONFLICT');
  assert.equal(L.setGlobalRoles(s, admin, DEMO_USER.admin, []).code, 'CONFLICT');
  assert.equal(L.setUserEnabled(s, pm, DEMO_USER.dev, false).code, 'FORBIDDEN');
  assert.equal(L.addMember(s, pm, 1, DEMO_USER.outsider, 3).code, 'CONFLICT');
  assert.equal(L.addMember(s, pm, 1, DEMO_USER.outsider, 1).code, 'VALIDATION');
  assert.equal(L.removeMember(s, pm, 1, DEMO_USER.pm).code, 'CONFLICT', 'không gỡ lead');
  const added = ok(L.addMember(s, pm, 1, DEMO_USER.outsider, 4));
  assert.ok(L.inbox(added, DEMO_USER.outsider).some((n) => n.type === 'MEMBER_ADDED' && n.projectId === 1));
});

test('dev không phải thành viên MOB không xem được; admin xem mọi project', () => {
  const s = createSeed();
  assert.deepEqual(L.visibleProjects(s, DEMO_USER.dev).map((p) => p.key), ['SCR']);
  assert.equal(L.visibleProjects(s, DEMO_USER.admin).length, 3);
  assert.equal(L.visibleProjects(s, DEMO_USER.disabled).length, 0, 'user bị khóa không có quyền');
});

test('comment: chủ sở hữu hoặc EDIT_ISSUE; version cũ bị chặn; sửa không tạo thông báo mới', () => {
  let s = createSeed();
  s = ok(L.changeMemberRole(s, pm, 1, DEMO_USER.dev3, 5)); // Quốc Bảo thành VIEWER
  assert.equal(L.editComment(s, as(DEMO_USER.dev3), 501, 'Sửa', 0).code, 'FORBIDDEN');
  assert.equal(L.editComment(s, as(DEMO_USER.dev), 501, 'Sửa', 3).code, 'CONFLICT');
  const notifications = s.notifications.length;
  const edited = ok(L.editComment(s, as(DEMO_USER.dev), 501, 'Nội dung đã sửa', 0));
  assert.equal(edited.notifications.length, notifications);
  const comment = edited.comments.find((c) => c.id === 501);
  assert.equal(comment.version, 1);
  assert.ok(comment.updatedAt);
  const commented = ok(L.addComment(edited, as(DEMO_USER.dev), 124, 'Bình luận mới'));
  assert.ok(L.inbox(commented, DEMO_USER.pm).some((n) => n.type === 'COMMENT' && n.createdAt === now));
});

test('inbox: đọc tất cả chỉ chạm thông báo của persona hiện tại', () => {
  const s = createSeed();
  const devUnread = L.unreadCount(s, DEMO_USER.dev);
  const next = ok(L.markAllRead(s, pm));
  assert.equal(L.unreadCount(next, DEMO_USER.pm), 0);
  assert.equal(L.unreadCount(next, DEMO_USER.dev), devUnread);
  assert.equal(L.deleteNotification(next, pm, 705).code, 'FORBIDDEN');
});

test('cột và mapping: WIP thấp hơn tải bị chặn trước khi đổi tên; status không ở hai cột cùng board', () => {
  const s = createSeed();
  const r = L.updateColumn(s, pm, 302, { name: 'Tên mới', wipLimit: 1 });
  assert.equal(r.code, 'CONFLICT');
  assert.equal(L.findColumn(s, 302).name, 'Đang làm');
  assert.equal(L.mapStatus(s, pm, 301, 2).code, 'CONFLICT');
  assert.equal(L.deleteColumn(s, pm, 302).code, 'CONFLICT');
  const mapped = ok(L.mapStatus(s, pm, 301, 6));
  assert.equal(L.boardView(mapped, 201, 104).unmapped.length, 0);
});

test('tạo project rỗng và mẫu Scrum; key không trùng hoa thường', () => {
  const s = createSeed();
  assert.equal(L.createProject(s, pm, { name: 'X', key: 'scr', description: '', template: 'empty' }).code, 'VALIDATION');
  assert.equal(L.createProject(s, as(DEMO_USER.dev), { name: 'X', key: 'ABC', description: '', template: 'empty' }).code, 'FORBIDDEN');
  const r = L.createProject(s, pm, { name: 'Dự án thử', key: 'thu1', description: '', template: 'scrum' });
  const next = ok(r);
  const id = r.entityId;
  assert.equal(L.findProject(next, id).key, 'THU1');
  assert.equal(L.projectBoards(next, id).length, 1);
  assert.equal(L.projectTypes(next, id).length, 3);
  const removed = ok(L.deleteProject(next, pm, id, 'THU1'));
  assert.equal(L.projectBoards(removed, id).length, 0);
  assert.equal(removed.columns.length, s.columns.length);
});
