import test from 'node:test';
import assert from 'node:assert/strict';
import { completePendingLogout, connectedRequest, markLogoutPending, withSessionLock } from '../src/features/connected/client.ts';

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
