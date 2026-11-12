import test from 'node:test';
import assert from 'node:assert/strict';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3135';

function route(path, method = 'GET', data, headers = {}) {
  const request = new Request(origin + '/api/backend/' + path, {
    method,
    headers: { Origin: origin, Cookie: 'jira_access=test-access', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return backendRoute(request, path.split('?')[0].split('/'));
}

test('configuration BFF preserves workflow 201 and empty project type 200/204', async (t) => {
  const body = { fromStatusId: 1, toStatusId: 2 };
  const upstream = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer test-access');
    if (url.endsWith('/workflows/rules')) {
      assert.deepEqual(JSON.parse(init.body), body);
      return Response.json({ ruleId: 3, ...body }, { status: 201 });
    }
    if (init.method === 'POST') {
      assert.ok(url.endsWith('/projects/4/issue-types/5?isDefault=false'));
      return new Response(null, { status: 200 });
    }
    assert.equal(init.method, 'DELETE');
    return new Response(null, { status: 204 });
  });

  const created = await route('workflows/rules', 'POST', body);
  assert.equal(created.status, 201);
  assert.equal((await created.json()).ruleId, 3);
  const assigned = await route('projects/4/issue-types/5?isDefault=false', 'POST');
  assert.equal(assigned.status, 200);
  assert.equal(await assigned.text(), '');
  const removed = await route('projects/4/issue-types/5', 'DELETE');
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.equal(upstream.mock.callCount(), 3);
});

test('configuration BFF rejects missing auth, foreign Origin, invalid query and body before forwarding', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected upstream call'));
  assert.equal((await route('issue-types', 'GET', undefined, { Cookie: '' })).status, 401);
  assert.equal((await route('issue-types', 'POST', { typeName: 'Task' }, { Origin: 'http://localhost:4000' })).status, 403);
  assert.equal((await route('projects/4/issue-types/5?isDefault=true&isDefault=false', 'POST')).status, 400);
  assert.equal((await route('issue-statuses', 'POST', { statusName: 'Open', statusCategory: 'OTHER' })).status, 400);
  assert.equal((await route('workflows/rules', 'POST', { fromStatusId: 1, toStatusId: 1 })).status, 400);
  assert.equal((await route('workflows/rules/3', 'PUT', { fromStatusId: 1, toStatusId: 2 })).status, 404);
  assert.equal(upstream.mock.callCount(), 0);
});
