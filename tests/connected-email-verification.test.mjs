import test from 'node:test';
import assert from 'node:assert/strict';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://127.0.0.1:3130';
const id = '12345678-1234-1234-1234-123456789abc';
const oldId = '87654321-1234-1234-1234-123456789abc';
const proof = 'x'.repeat(43);
const expires = new Date(Date.now() + 600_000).toISOString();
const pending = {
  challengeId: id, proofToken: proof, emailMasked: 'u***@example.test', state: 'PENDING',
  expiresAt: expires, proofExpiresAt: expires, resendAvailableAt: expires, deliveryState: 'QUEUED',
};
const registrationCookie = `jira_registration_active=${id}; jira_registration_active_${id}=${proof}; jira_access=old`;
const accountCookie = `jira_email_verification_active=${id}; jira_email_verification_active_${id}=${proof}; jira_access=actor`;

function route(path, { method = 'GET', body, cookie, requestOrigin = origin, headers } = {}) {
  const request = new Request(origin + '/api/backend/' + path, { method,
    headers: { origin: requestOrigin, ...(cookie && { cookie }), ...headers },
    ...(body && { body: JSON.stringify(body) }),
  });
  return backendRoute(request, path.split('?')[0].split('/'));
}

async function upstream(t, handle, run) {
  t.mock.method(globalThis, 'fetch', handle);
  await run();
}

test('register preserves 202 and sets proof-only cookies without returning proof to JS', async (t) => {
  await upstream(t, async (url, init) => {
    assert.match(url, /\/auth\/register$/);
    assert.equal(init.headers.get('Authorization'), null);
    assert.deepEqual(JSON.parse(init.body), { email: 'User@example.test', password: 'valid-password', userName: 'user', fullName: 'User' });
    return Response.json({ ...pending, token: 'must-not-leak' }, { status: 202 });
  }, async () => {
    const response = await route('auth/register', { method: 'POST', cookie: registrationCookie,
      body: { email: ' User@example.test ', password: 'valid-password', userName: 'user', fullName: 'User' } });
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.challengeId, id);
    assert.equal(payload.proofToken, undefined);
    assert.equal(payload.token, undefined);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => cookie.includes('Path=/api/backend/auth/registration')
      && cookie.includes('HttpOnly') && cookie.includes('SameSite=lax')));
    assert.ok(cookies.every((cookie) => !/jira_access|jira_refresh/.test(cookie)));
  });
});

test('stale challenge, external origin, query proof and body proof stop before upstream', async (t) => {
  await upstream(t, () => assert.fail('unexpected upstream'), async () => {
    assert.equal((await route('auth/registration/verify', { method: 'POST', cookie: registrationCookie, body: { challengeId: oldId, code: '123456' } })).status, 409);
    assert.equal((await route('auth/registration/resend', { method: 'POST', cookie: registrationCookie, body: { challengeId: id }, requestOrigin: 'https://bad.test' })).status, 403);
    assert.equal((await route('auth/registration/status?proofToken=bad', { cookie: registrationCookie })).status, 400);
    assert.equal((await route('auth/registration/verify', { method: 'POST', cookie: registrationCookie, body: { challengeId: id, code: '123456', proofToken: proof } })).status, 400);
    assert.equal((await route('account/email-verification/request', { method: 'POST', body: {} })).status, 401);
  });
});

test('verify sends bound proof and 204 clears only that proof cookie', async (t) => {
  await upstream(t, async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { challengeId: id, code: '123456', proofToken: proof });
    return new Response(null, { status: 204 });
  }, async () => {
    const response = await route('auth/registration/verify', { method: 'POST', cookie: registrationCookie, body: { challengeId: id, code: '123456' } });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    const [clear, extra] = response.headers.getSetCookie();
    assert.match(clear, new RegExp('^jira_registration_active_' + id + '='));
    assert.match(clear, /Max-Age=0/);
    assert.equal(extra, undefined);
  });
});

test('legacy status binds Bearer, strips proof from JSON, and 429 preserves Retry-After', async (t) => {
  await upstream(t, async (url, init) => {
    assert.equal(init.headers.get('Authorization'), 'Bearer actor');
    if (url.endsWith('/status')) {
      assert.equal(init.headers.get('X-Jira-Challenge-Id'), id);
      assert.equal(init.headers.get('X-Jira-Verification-Proof'), proof);
      return Response.json(pending);
    }
    return Response.json({ code: 'COOLDOWN' }, { status: 429, headers: { 'Retry-After': '42' } });
  }, async () => {
    const read = await route('account/email-verification/status', { cookie: accountCookie, headers: { 'X-Jira-Challenge-Id': id } });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).proofToken, undefined);
    const limited = await route('account/email-verification/request', { method: 'POST', cookie: accountCookie });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '42');
  });
});
