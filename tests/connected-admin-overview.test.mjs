import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminOverview } from '../src/features/connected/admin-overview/model.ts';
import { backendRoute } from '../src/features/connected/server.ts';

const counts = { users: 8, enabledUsers: 7, enabledAdmins: 2, projects: 3, issues: 6, activeSprints: 0, closedSprints: 4 };

function route(path, method = 'GET', cookie = 'jira_access=overview-test') {
  const url = new URL('http://localhost:3136/api/backend/' + path);
  return backendRoute(new Request(url, { method, headers: { Cookie: cookie } }), url.pathname.split('/').slice(3));
}

test('overview validates all seven counts and preserves real zero', () => {
  assert.deepEqual(parseAdminOverview(counts), counts);
  const { enabledAdmins, ...missing } = counts;
  for (const invalid of [null, [], missing, { ...counts, users: '8' }, { ...counts, issues: 1.5 },
    { ...counts, projects: -1 }, { ...counts, closedSprints: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parseAdminOverview(invalid), /Dữ liệu tổng quan/);
  }
});

test('overview allowlist rejects other admin routes, methods, query and missing session', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected upstream call'));
  assert.equal((await route('admin/audit-logs')).status, 404);
  assert.equal((await route('admin/overview', 'POST')).status, 404);
  assert.equal((await route('admin/overview?userId=12')).status, 400);
  assert.equal((await route('admin/overview', 'GET', '')).status, 401);
  assert.equal(upstream.mock.callCount(), 0);
});

test('overview forwards the session bearer and preserves upstream errors without caching', async (t) => {
  let status = 200;
  const upstream = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.ok(url.endsWith('/api/admin/overview'));
    assert.equal(init.headers.Authorization, 'Bearer overview-test');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.body, undefined);
    return Response.json(status === 200 ? counts : { message: 'Internal detail' }, { status });
  });
  const success = await route('admin/overview');
  assert.deepEqual(await success.json(), counts);
  assert.match(success.headers.get('Cache-Control'), /no-store/);
  for (status of [401, 403, 503]) {
    const response = await route('admin/overview');
    assert.equal(response.status, status);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.doesNotMatch(await response.text(), /Internal detail/);
  }
  assert.equal(upstream.mock.callCount(), 4);
});
