import assert from 'node:assert/strict';
import test from 'node:test';
import { changeConnectedPassword, connectedRequest, hasPendingLogout } from '../src/features/connected/client.ts';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3127';
const credentials = { oldPassword: 'previous-pass', newPassword: 'different-pass' };
const call = (path, method, body, options = {}) => backendRoute(new Request(origin + '/api/backend/' + path, {
  method,
  headers: { origin: options.origin ?? origin, ...(options.anonymous ? {} : { cookie: 'jira_access=test-access' }) },
  body: JSON.stringify(body),
}), path.split('?')[0].split('/'));

function assertCleared(response) {
  const cookies = response.headers.getSetCookie();
  assert.equal(response.headers.get('X-Jira-Session-Cleared'), '1');
  assert.equal(cookies.length, 2);
  assert.match(cookies.find((value) => value.startsWith('jira_access=')), /Path=\/api\/backend;/);
  assert.match(cookies.find((value) => value.startsWith('jira_refresh=')), /Path=\/api\/backend\/auth;/);
  assert.ok(cookies.every((value) => /HttpOnly/.test(value) && /Max-Age=0/.test(value)));
}

test('account BFF applies Origin, cookie and body allowlist before upstream', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { assert.fail('unexpected upstream'); });
  assert.equal((await call('account/profile', 'PATCH', { fullName: 'N', email: 'a@example.test', userId: 7 })).status, 400);
  assert.equal((await call('account/password', 'POST', { ...credentials, confirm: credentials.newPassword })).status, 400);
  assert.equal((await call('account/password', 'POST', { ...credentials, newPassword: 'ắ'.repeat(25) })).status, 400);
  assert.equal((await call('account/password', 'POST', credentials, { origin: 'https://other.invalid' })).status, 403);
  assert.equal((await call('account/password', 'POST', credentials, { anonymous: true })).status, 401);
  assert.equal((await call('account/password?userId=7', 'POST', credentials)).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test('profile returns user data and password clears session only on terminal or uncertain responses', async (t) => {
  let passwordStatus = 204;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer test-access');
    if (url.endsWith('/account/profile')) {
      assert.deepEqual(JSON.parse(init.body), { userName: 'fresh-name' });
      return Response.json({ userId: 7, userName: 'fresh-name' });
    }
    assert.deepEqual(JSON.parse(init.body), credentials);
    if (passwordStatus === 0) throw new Error('upstream timeout');
    return new Response(null, { status: passwordStatus });
  });
  const profile = await call('account/profile', 'PATCH', { userName: ' fresh-name ' });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).userName, 'fresh-name');
  assert.equal(profile.headers.getSetCookie().length, 0);

  for (const [upstream, expected] of [[204, 204], [400, 400], [401, 401], [500, 502], [200, 502], [0, 502]]) {
    passwordStatus = upstream;
    const result = await call('account/password', 'POST', credentials);
    assert.equal(result.status, expected);
    assert.equal(result.headers.get('cache-control'), 'no-store, private');
    if (upstream === 400) assert.equal(result.headers.getSetCookie().length, 0);
    else assertCleared(result);
    if (upstream === 204) assert.equal(await result.text(), '');
  }
  assert.equal(fetch.mock.callCount(), 7);
});

async function sessionEnvironment(run) {
  const keys = ['navigator', 'localStorage', 'window'];
  const previous = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const oldFetch = globalThis.fetch;
  const events = [];
  const data = new Map();
  let queue = Promise.resolve();
  let held = false;
  const target = new EventTarget();
  target.addEventListener('jira-session', (event) => events.push({ type: event.detail, held }));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, action) {
    const request = queue.then(async () => {
      held = true;
      try { return await action(); } finally { held = false; }
    });
    queue = request.catch(() => {});
    return request;
  } } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key),
  } });
  try { await run(events); } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => {
      if (previous[index]) Object.defineProperty(globalThis, key, previous[index]);
      else delete globalThis[key];
    });
  }
}

test('204 ends session under lock and discards a read already waiting to refresh', async () => {
  await sessionEnvironment(async (events) => {
    const calls = [];
    let dispatched;
    let finish;
    const sent = new Promise((resolve) => { dispatched = resolve; });
    const deferred = new Promise((resolve) => { finish = resolve; });
    globalThis.fetch = async (url) => {
      const route = url.replace('/api/backend/', '');
      calls.push(route);
      if (route === 'auth/me') return Response.json({ user: { id: 7 } });
      if (route === 'account/password') {
        dispatched();
        await deferred;
        return new Response(null, { status: 204, headers: { 'X-Jira-Session-Cleared': '1' } });
      }
      return new Response(null, { status: 401 });
    };
    const outcomes = [];
    const changing = changeConnectedPassword(7, credentials, () => true, (outcome) => outcomes.push(outcome));
    await sent;
    const reading = assert.rejects(connectedRequest('account/context'), (error) => error.status === 409);
    finish();
    await Promise.all([changing, reading]);
    assert.deepEqual(calls, ['auth/me', 'account/password', 'account/context']);
    assert.deepEqual(outcomes, ['changed']);
    assert.deepEqual(events, [{ type: 'ended', held: true }]);
    assert.equal(hasPendingLogout(), false);
  });
});

test('wrong password preserves session and lost response closes it with pending cookie cleanup', async () => {
  await sessionEnvironment(async (events) => {
    let lost = false;
    let sends = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith('/auth/me')) return Response.json({ user: { id: 7 } });
      sends++;
      if (lost) throw new Error('browser network failed');
      return Response.json({ message: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });
    };
    const outcomes = [];
    const change = () => changeConnectedPassword(7, credentials, () => true, (outcome) => outcomes.push(outcome));
    await assert.rejects(change(), (error) => error.status === 400);
    assert.equal(hasPendingLogout(), false);
    assert.deepEqual(events, []);
    lost = true;
    await change();
    assert.equal(sends, 2);
    assert.deepEqual(outcomes, ['uncertain']);
    assert.deepEqual(events, [{ type: 'ended', held: true }]);
    assert.equal(hasPendingLogout(), true);
  });
});
