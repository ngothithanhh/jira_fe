import assert from 'node:assert/strict';
import test from 'node:test';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3127';
const base = 'projects/10/members';
const search = base + '/candidates/search';
const cookie = 'jira_access=access-for-test';

const call = (path, method = 'GET', body, requestOrigin = origin) => backendRoute(new Request(origin + '/api/backend/' + path, {
  method, headers: { cookie, origin: requestOrigin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), path.split('?')[0].split('/'));

test('member BFF forwards exact methods, minimal bodies and empty write responses', async (t) => {
  const cases = [
    { path: 'user-role', method: 'GET', payload: undefined, status: 200, json: [{ role: 7, roleName: 'DEVELOPER' }] },
    { path: search, method: 'POST', payload: { email: 'known@example.test' }, status: 200, json: [] },
    { path: base, method: 'POST', payload: { userId: 2, roleId: 7 }, status: 202, json: { state: 'PENDING' } },
    { path: base + '/2/role', method: 'PUT', payload: { roleId: 8 }, status: 204 },
    { path: base + '/2', method: 'DELETE', payload: undefined, status: 200 },
  ];
  let next = 0;
  const mock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    const expected = cases[next++];
    assert.ok(url.endsWith('/api/' + expected.path));
    assert.equal(init.method, expected.method);
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer access-for-test');
    assert.equal(init.body, JSON.stringify(expected.payload));
    return expected.json === undefined ? new Response(null, { status: expected.status }) : Response.json(expected.json, { status: expected.status });
  });

  for (const example of cases) {
    const response = await call(example.path, example.method, example.payload);
    assert.equal(response.status, example.status);
    assert.match(response.headers.get('cache-control'), /no-store/);
    if (example.json !== undefined) assert.deepEqual(await response.json(), example.json);
    else assert.equal(await response.text(), '');
  }
  assert.equal(mock.mock.callCount(), cases.length);
});

test('member BFF rejects extra parameters, bad IDs and cross-origin requests before BE', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { assert.fail('unexpected upstream call'); });
  assert.equal((await call(search, 'POST', { email: 'known@example.test' }, 'https://other.invalid')).status, 403);
  assert.equal((await call(search + '?email=known@example.test', 'POST', { email: 'known@example.test' })).status, 400);
  assert.equal((await call(search, 'POST', { email: 'known' })).status, 400);
  assert.equal((await call(base, 'POST', { userId: 2, roleId: 7, actorId: 1 })).status, 400);
  assert.equal((await call(base + '/2/role', 'PUT', { roleId: 0 })).status, 400);
  assert.equal((await call(base + '/2147483648', 'DELETE')).status, 400);
  assert.equal((await call('roles/7/permissions', 'POST', { permissionId: 1 })).status, 404);
  assert.equal(fetch.mock.callCount(), 0);
});
