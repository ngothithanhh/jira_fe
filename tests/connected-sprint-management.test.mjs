import test from 'node:test';
import assert from 'node:assert/strict';
import { issueBody, issueRoute } from '../src/features/connected/issues/contract.ts';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3137';
const route = (path, method, body, requestOrigin = origin) => {
  const url = new URL(origin + '/api/backend/' + path);
  const request = new Request(url, { method, body, headers: { Origin: requestOrigin, Cookie: 'jira_access=test-access' } });
  return backendRoute(request, url.pathname.split('/').slice(3));
};

test('sprint PATCH preserves local time, supports clearing goal and rejects impossible dates', () => {
  const startDate = '2028-02-29T09:31:01.000004';
  assert.deepEqual(JSON.parse(issueBody('sprint-edit', { sprintName: ' Tiếp theo ', goal: '', startDate, endDate: null })),
    { sprintName: 'Tiếp theo', goal: '', startDate });
  for (const invalid of ['2026-02-29T09:00', '2026-04-31T09:00', '2026-04-30T24:00', '2026-04-30T12:00Z', '2026-04-30T12:00+07:00', '']) {
    assert.throws(() => issueBody('sprint-edit', { startDate: invalid }), /Thời gian/);
  }
  assert.throws(() => issueBody('sprint-edit', { startDate: '2028-02-29T09:31:01.0', endDate: '2028-02-29T09:31:01' }), /Ngày kết thúc/);
  assert.throws(() => issueBody('sprint-edit', { sprintName: '   ' }), /Tên sprint/);
  assert.throws(() => issueBody('sprint-edit', { goal: 'x'.repeat(256) }), /255/);
  assert.throws(() => issueBody('sprint-edit', { projectId: 20 }), /Trường/);
  assert.throws(() => issueRoute('sprints/2147483648', 'PATCH', new URLSearchParams()), /ID/);
  assert.equal(issueRoute('sprints/1/complete', 'PATCH', new URLSearchParams()), null);
});

test('BFF forwards only valid sprint PATCH and bodyless DELETE, preserving responses', async (t) => {
  const calls = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.ok(url.endsWith('/sprints/17'));
    assert.equal(init.headers.Authorization, 'Bearer test-access');
    if (init.method === 'DELETE') {
      assert.equal(init.body, undefined);
      return new Response(null, { status: 204 });
    }
    assert.deepEqual(JSON.parse(init.body), { goal: '' });
    return Response.json({ sprintId: 17, projectId: 2, goal: '' });
  });
  assert.equal((await route('sprints/17?projectId=2', 'PATCH', '{}')).status, 400);
  assert.equal((await route('sprints/17', 'DELETE', '{}')).status, 400);
  assert.equal((await route('sprints/17', 'DELETE', undefined, 'http://other.invalid')).status, 403);
  const patched = await route('sprints/17', 'PATCH', '{"goal":""}');
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).goal, '');
  const removed = await route('sprints/17', 'DELETE', '');
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.equal(calls.mock.callCount(), 2);
});
