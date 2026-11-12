import test from 'node:test';
import assert from 'node:assert/strict';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3127';
const jwt = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url')}.signature`;
const request = (path, init = {}) => new Request(`${origin}/api/backend/${path}`, init);
const json = (data, status = 200) => Response.json(data, { status });

/** Mock riêng transport để kiểm hợp đồng cầu nối; HTTP/DB thật được kiểm bằng script tích hợp riêng. */
async function withBackend(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('unknown path/method and foreign origin stop before upstream', async () => {
  await withBackend(() => { assert.fail('must not call backend'); }, async () => {
    assert.equal((await backendRoute(request('admin/users'), ['admin', 'users'])).status, 404);
    assert.equal((await backendRoute(request('projects/getList', { method: 'DELETE' }), ['projects', 'getList'])).status, 404);
    assert.equal((await backendRoute(request('auth/login', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }), ['auth', 'login'])).status, 403);
    assert.equal((await backendRoute(request('auth/refresh', { method: 'POST' }), ['auth', 'refresh'])).status, 403);
  });
});

test('login sets HttpOnly cookie pair and never returns credentials or user-supplied roles', async () => {
  await withBackend(async (url, init) => {
    assert.ok(url.endsWith('/auth/login'));
    assert.deepEqual(JSON.parse(init.body), { email: 'person@example.test', password: 'test-password' });
    assert.equal(init.redirect, 'error');
    return json({ token: jwt, refreshToken: 'refresh-secret' });
  }, async () => {
    const response = await backendRoute(request('auth/login', { method: 'POST', headers: { origin }, body: JSON.stringify({ email: 'person@example.test', password: 'test-password', roleId: 1 }) }), ['auth', 'login']);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: true });
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((c) => c.includes('HttpOnly') && c.includes('SameSite=lax')));
    assert.ok(cookies.some((c) => c.includes('jira_refresh=refresh-secret') && c.includes('Path=/api/backend/auth')));
    assert.match(response.headers.get('cache-control'), /no-store/);
  });
});

test('refresh ignores browser body and forwards cookie token only', async () => {
  await withBackend(async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { refreshToken: 'real-cookie' });
    assert.equal(init.headers.Authorization, undefined, 'stale access must not block refresh at BE JWT filter');
    return json({ token: jwt, refreshToken: 'rotated' });
  }, async () => {
    const response = await backendRoute(request('auth/refresh', { method: 'POST', headers: { origin, cookie: 'jira_refresh=real-cookie; jira_access=expired-or-revoked' }, body: '{"refreshToken":"attacker"}' }), ['auth', 'refresh']);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /rotated/);
  });
});

test('public Host can differ from Next internal URL without trusting a foreign Origin', async () => {
  await withBackend(async () => json({ token: jwt, refreshToken: 'rotated' }), async () => {
    const good = request('auth/refresh', { method: 'POST', headers: { host: '127.0.0.1:3130', origin: 'http://127.0.0.1:3130', cookie: 'jira_refresh=old' } });
    assert.equal((await backendRoute(good, ['auth', 'refresh'])).status, 200);
    const bad = request('auth/refresh', { method: 'POST', headers: { host: '127.0.0.1:3130', origin: 'https://evil.example', cookie: 'jira_refresh=old' } });
    assert.equal((await backendRoute(bad, ['auth', 'refresh'])).status, 403);
  });
});

test('missing/malformed credentials and invalid context scope do not reach backend', async () => {
  await withBackend(() => { assert.fail('must not call backend'); }, async () => {
    assert.equal((await backendRoute(request('auth/me'), ['auth', 'me'])).status, 401);
    assert.equal((await backendRoute(request('auth/me', { headers: { cookie: 'jira_access=%ZZ' } }), ['auth', 'me'])).status, 401);
    assert.equal((await backendRoute(request('account/context?projectId=0'), ['account', 'context'])).status, 400);
    assert.equal((await backendRoute(request('account/context?userId=8'), ['account', 'context'])).status, 400);
    assert.equal((await backendRoute(request('auth/login', { method: 'POST', headers: { origin }, body: 'null' }), ['auth', 'login'])).status, 400);
    assert.equal((await backendRoute(request('auth/register', { method: 'POST', headers: { origin }, body: JSON.stringify({ email: 'person@example.test', password: 'short' }) }), ['auth', 'register'])).status, 400);
  });
});

test('protected reads use Bearer, preserve forbidden and do not clear valid session', async () => {
  await withBackend(async (url, init) => {
    assert.ok(url.endsWith('/account/context?projectId=10'));
    assert.equal(init.headers.Authorization, 'Bearer opaque-access');
    assert.equal(init.cache, 'no-store');
    return json({ message: 'private debug details' }, 403);
  }, async () => {
    const response = await backendRoute(request('account/context?projectId=10', { headers: { cookie: 'jira_access=opaque-access' } }), ['account', 'context']);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.ok(!JSON.stringify(await response.json()).includes('private debug'));
  });
});

test('rejected refresh clears both cookies; network error keeps credentials for deliberate recovery', async () => {
  const input = () => request('auth/refresh', { method: 'POST', headers: { origin, cookie: 'jira_refresh=old' } });
  await withBackend(async () => json({}, 401), async () => {
    const response = await backendRoute(input(), ['auth', 'refresh']);
    assert.equal(response.status, 401); assert.equal(response.headers.getSetCookie().length, 2);
    assert.ok(response.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
  });
  await withBackend(async () => { throw new Error('secret backend URL'); }, async () => {
    const response = await backendRoute(input(), ['auth', 'refresh']);
    assert.equal(response.status, 502); assert.equal(response.headers.has('set-cookie'), false);
    assert.ok(!JSON.stringify(await response.json()).includes('secret'));
  });
});

test('logout succeeds with 204 and always clears local cookies on upstream failure', async () => {
  await withBackend(async () => new Response(null, { status: 200 }), async () => {
    const response = await backendRoute(request('auth/logout', { method: 'POST', headers: { origin, cookie: 'jira_refresh=old' } }), ['auth', 'logout']);
    assert.equal(response.status, 204); assert.equal(await response.text(), '');
  });
  await withBackend(async () => { throw new Error('offline'); }, async () => {
    const response = await backendRoute(request('auth/logout', { method: 'POST', headers: { origin, cookie: 'jira_refresh=old' } }), ['auth', 'logout']);
    assert.equal(response.status, 502); assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get('x-jira-session-cleared'), '1');
    assert.match((await response.json()).message, /chưa xác nhận/);
  });
});

test('project writes enforce origin, Bearer and field allowlist independently from auth', async () => {
  await withBackend(async (url, init) => {
    assert.ok(url.endsWith('/projects/create'));
    assert.equal(init.headers.Authorization, 'Bearer access');
    assert.deepEqual(JSON.parse(init.body), { projectName: 'Shop', projectKey: 'SHOP', description: 'Store' });
    return json({ projectId: 18, projectKey: 'SHOP' });
  }, async () => {
    const response = await backendRoute(request('projects/create', { method: 'POST', headers: { origin, cookie: 'jira_access=access' }, body: JSON.stringify({ projectName: ' Shop ', projectKey: 'SHOP', description: 'Store', leadId: 999, issueCount: 500 }) }), ['projects', 'create']);
    assert.equal(response.status, 200); assert.equal((await response.json()).projectId, 18);
    assert.equal(response.headers.has('set-cookie'), false);
  });
  await withBackend(() => assert.fail('blocked before upstream'), async () => {
    assert.equal((await backendRoute(request('projects/18', { method: 'DELETE', headers: { origin: 'https://evil.test', cookie: 'jira_access=access' } }), ['projects', '18'])).status, 403);
    assert.equal((await backendRoute(request('projects/18', { method: 'DELETE', headers: { origin } }), ['projects', '18'])).status, 401);
    assert.equal((await backendRoute(request('projects/18?leadId=7', { headers: { cookie: 'jira_access=access' } }), ['projects', '18'])).status, 400);
    assert.equal((await backendRoute(request('projects/2147483648'), ['projects', '2147483648'])).status, 400);
  });
});

test('project patch cannot change key/lead; successful delete accepts 200 empty and 204', async () => {
  await withBackend(async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { projectName: 'Renamed', description: null });
    return json({ projectId: 18, projectKey: 'SHOP' });
  }, async () => {
    const response = await backendRoute(request('projects/18', { method: 'PATCH', headers: { origin, cookie: 'jira_access=access' }, body: JSON.stringify({ projectName: 'Renamed', projectKey: 'OTHER', leadId: 9 }) }), ['projects', '18']);
    assert.equal(response.status, 200);
  });
  for (const status of [200, 204]) await withBackend(async () => new Response(null, { status }), async () => {
    const response = await backendRoute(request('projects/18', { method: 'DELETE', headers: { origin, cookie: 'jira_access=access' } }), ['projects', '18']);
    assert.equal(response.status, status); assert.equal(await response.text(), '');
  });
});

test('project conflict stays actionable without deleting identity cookies', async () => {
  await withBackend(async () => json({ internalSql: 'private' }, 409), async () => {
    const response = await backendRoute(request('projects/18', { method: 'DELETE', headers: { origin, cookie: 'jira_access=access' } }), ['projects', '18']);
    assert.equal(response.status, 409); assert.match((await response.json()).message, /liên kết/);
    assert.equal(response.headers.has('set-cookie'), false);
  });
});
