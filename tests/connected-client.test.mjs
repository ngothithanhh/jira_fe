import test from 'node:test';
import assert from 'node:assert/strict';
import { completeConnectedMutation, completePendingLogout, connectedMutation, connectedRequest, markLogoutPending, withSessionLock } from '../src/features/connected/client.ts';

/** Khóa và transport giả cho thứ tự xác định; không phải bằng chứng browser/DB đồng thời thật. */
async function sessionEnvironment(run) {
  const oldFetch = globalThis.fetch;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, action) {
    const result = queue.then(action); queue = result.catch(() => {}); return result;
  } } } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key),
  } });
  try { await run(); } finally {
    globalThis.fetch = oldFetch;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
  }
}

test('queued offline cleanup does not revoke a newly logged-in identity', async () => {
  await sessionEnvironment(async () => {
    let identity = 'A'; const logouts = [];
    let release; const gate = new Promise((r) => { release = r; });
    globalThis.fetch = async (url) => {
      if (url.endsWith('/logout')) { logouts.push(identity); identity = null; return new Response(null, { status: 204, headers: { 'X-Jira-Session-Cleared': '1' } }); }
      identity = 'B'; return Response.json({ authenticated: true });
    };
    markLogoutPending();
    const login = withSessionLock(async () => {
      await gate;
      await connectedRequest('auth/logout', { method: 'POST' }, false);
      await connectedRequest('auth/login', { method: 'POST', body: '{}' }, false);
    });
    const cleanup = completePendingLogout();
    release(); await Promise.all([login, cleanup]);
    assert.deepEqual(logouts, ['A']); assert.equal(identity, 'B');
  });
});

test('cancelled session query does not execute a queued logout', async () => {
  await sessionEnvironment(async () => {
    let release; const gate = new Promise((r) => { release = r; });
    let calls = 0; globalThis.fetch = async () => { calls++; return new Response(null, { status: 204 }); };
    markLogoutPending();
    const held = withSessionLock(() => gate);
    const controller = new AbortController();
    const cleanup = completePendingLogout(controller.signal);
    controller.abort(); release(); await Promise.all([held, cleanup]);
    assert.equal(calls, 0);
  });
});

test('business mutation does not replay a delayed 401 under another account', async () => {
  await sessionEnvironment(async () => {
    let mutationCalls = 0; let probes = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith('/auth/me')) { probes++; return Response.json({ user: { id: 8 } }); }
      mutationCalls++; return Response.json({ message: 'expired' }, { status: 401 });
    };
    await assert.rejects(connectedMutation('projects/18', 8, { method: 'DELETE' }), (error) => error.status === 401);
    assert.equal(probes, 1); assert.equal(mutationCalls, 1);
  });
});

test('queued business mutation checks actor after login before dispatching', async () => {
  await sessionEnvironment(async () => {
    let actor = 8; let release;
    const gate = new Promise((r) => { release = r; });
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith('/auth/me'), 'no project write allowed with mismatched actor');
      return Response.json({ user: { id: actor } });
    };
    const login = withSessionLock(async () => { await gate; actor = 9; });
    const queued = connectedMutation('projects/18', 8, { method: 'DELETE' });
    release(); await login;
    await assert.rejects(queued, (error) => error.status === 409);
  });
});

test('mutation recovers access before dispatch once and retains original actor', async () => {
  await sessionEnvironment(async () => {
    const requests = []; let probes = 0;
    globalThis.fetch = async (url) => {
      requests.push(url);
      if (url.endsWith('/auth/me')) return ++probes === 1 ? Response.json({}, { status: 401 }) : Response.json({ user: { id: 8 } });
      if (url.endsWith('/auth/refresh')) return Response.json({ authenticated: true });
      return Response.json({ projectId: 18 });
    };
    const result = await connectedMutation('projects/create', 8, { method: 'POST', body: '{}' });
    assert.equal(result.projectId, 18);
    assert.deepEqual(requests.map((url) => url.replace('/api/backend/', '')), ['auth/me', 'auth/refresh', 'auth/me', 'projects/create']);
  });
});

test('expired mutation scope stops even when re-login has the same user ID', async () => {
  await sessionEnvironment(async () => {
    let current = true;
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith('/auth/me'), 'write must not be dispatched after scope expires');
      current = false; return Response.json({ user: { id: 8 } });
    };
    await assert.rejects(connectedMutation('projects/18', 8, { method: 'DELETE' }, () => current), (error) => error.status === 409);
  });
});

test('rejected refresh closes the old session before any project write', async () => {
  await sessionEnvironment(async () => {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const target = new EventTarget(); const events = [];
    target.addEventListener('jira-session', (event) => events.push(event.detail));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith('/auth/me') || url.endsWith('/auth/refresh'));
      return Response.json({}, { status: 401 });
    };
    try {
      await assert.rejects(connectedMutation('projects/create', 8, { method: 'POST', body: '{}' }), (error) => error.status === 401);
      assert.deepEqual(events, ['ended']);
    } finally {
      if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    }
  });
});

test('completion rechecks cookie identity even before a delayed session event reaches cache', async () => {
  await sessionEnvironment(async () => {
    globalThis.fetch = async () => Response.json({ user: { id: 9 } });
    let completed = 0;
    const result = await completeConnectedMutation(8, () => true, () => { completed++; });
    assert.equal(result, false); assert.equal(completed, 0);
  });
});
