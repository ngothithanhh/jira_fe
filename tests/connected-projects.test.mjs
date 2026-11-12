import test from 'node:test';
import assert from 'node:assert/strict';
import { projectErrors, projectIdFromRoute, projectItem, projectPayload } from '../src/features/connected/projects/model.ts';

test('project mapper keeps IDs, null leader and real counts without inventing zeros', () => {
  const item = projectItem({ projectId: 18, projectKey: 'SHOP', projectName: 'Shop', description: null, leader: null, issueCount: 7, memberCount: 2, sprintCount: 3, activeSprintName: null });
  assert.equal(item.id, 18); assert.equal(item.issueCount, 7); assert.equal(item.memberCount, 2);
  assert.equal(item.leaderName, null); assert.equal(item.description, '');
  assert.equal(projectItem({ projectId: 1 }).issueCount, undefined);
});

test('route accepts backend int IDs only and never falls back to another project', () => {
  for (const value of ['0', '-1', '01', '1.5', 'NaN', '2147483648', '../1', '']) assert.equal(projectIdFromRoute(value), null);
  assert.equal(projectIdFromRoute('2147483647'), 2147483647);
});

test('write payload strips identity/lead/count and never changes key during edit', () => {
  const draft = { name: ' Shop ', key: ' ABC ', description: 'Exact description', leadId: 99, issueCount: 200 };
  assert.deepEqual(projectPayload(draft, true), { projectName: 'Shop', projectKey: 'ABC', description: 'Exact description' });
  assert.deepEqual(projectPayload(draft, false), { projectName: 'Shop', description: 'Exact description' });
});

test('form validates limits before sending while legacy keys remain usable', () => {
  assert.ok(projectErrors({ name: ' ', key: 'ABC', description: '' }, true).name);
  assert.ok(projectErrors({ name: 'Good', key: '', description: '' }, true).key);
  assert.ok(projectErrors({ name: 'Good', key: 'ABC', description: 'x'.repeat(256) }, true).description);
  assert.deepEqual(projectErrors({ name: 'Good', key: 'legacy_key', description: '' }, true), {});
});
