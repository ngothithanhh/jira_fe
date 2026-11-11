import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPlanningIssue, movedPlanning, orderedPlanning } from '../src/features/backlog/model.ts';
import { planningFixture } from '../src/features/backlog/fixtures.ts';

test('mapper giữ ID DB, version và các quan hệ nullable', () => {
  const issue = mapPlanningIssue({
    issueId: 42,
    issueKey: 'TEST-7',
    summary: 'Task',
    version: 9,
    assigneeId: null,
  });
  assert.equal(issue.id, 42);
  assert.equal(issue.key, 'TEST-7');
  assert.equal(issue.version, 9);
  assert.equal(issue.assignee, null);
  assert.equal(issue.assigneeId, null);
  assert.equal(issue.points, 0);
});
test('reorder là toàn bộ scope, giữ dữ liệu cũ để rollback', () => {
  const data = structuredClone(planningFixture);
  const before = structuredClone(data);
  const ids = data.backlog.map((issue) => issue.id).reverse();
  const next = orderedPlanning(data, null, ids);
  assert.deepEqual(
    next.backlog.map((issue) => issue.id),
    ids,
  );
  assert.deepEqual(data, before);
  assert.deepEqual(next.sprints, data.sprints);
});
test('reorder không chấp nhận ID thiếu, thừa, trùng hoặc dự án khác', () => {
  const data = structuredClone(planningFixture),
    ids = data.backlog.map((issue) => issue.id);
  for (const invalid of [ids.slice(1), [...ids, 999], ids.map(() => ids[0]), [999, ...ids.slice(1)]]) {
    assert.throws(() => orderedPlanning(data, null, invalid));
  }
});
test('rank sprint chỉ thay đúng sprint được chọn', () => {
  const data = structuredClone(planningFixture);
  const ids = data.sprints[0].issues.map((issue) => issue.id).reverse();
  const next = orderedPlanning(data, 101, ids);
  assert.deepEqual(
    next.sprints[0].issues.map((issue) => issue.id),
    ids,
  );
  assert.deepEqual(next.sprints[1], data.sprints[1]);
  assert.deepEqual(next.backlog, data.backlog);
});
test('chuyển product vào sprint rồi gỡ lại không nhân đôi hoặc làm mất issue', () => {
  const data = structuredClone(planningFixture),
    id = data.backlog[0].id;
  const moved = movedPlanning(data, id, null, 102);
  assert.equal(
    moved.backlog.some((issue) => issue.id === id),
    false,
  );
  assert.equal(moved.sprints[1].issues.filter((issue) => issue.id === id).length, 1);
  const returned = movedPlanning(moved, id, 102, null);
  assert.equal(returned.backlog.filter((issue) => issue.id === id).length, 1);
  assert.equal(
    returned.sprints[1].issues.some((issue) => issue.id === id),
    false,
  );
  assert.deepEqual(data, planningFixture);
});
test('không ghép hai request thành chuyển sprint giả nguyên tử', () => {
  assert.throws(() => movedPlanning(planningFixture, 24, 101, 102), /backlog/);
  assert.throws(() => movedPlanning(planningFixture, 999, null, 102));
  assert.throws(() => movedPlanning(planningFixture, 35, null, 999));
});
