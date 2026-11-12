import assert from 'node:assert/strict';
import test from 'node:test';
import { backendRoute } from '../src/features/connected/server.ts';

const origin = 'http://localhost:3127';
const id = 'e1b425b9-f500-4c27-9b39-19adc892219c';
const token = 't'.repeat(43);
const recipient = 'account/project-invitations/' + id;
const proof = 'jira_invitation_proof_' + id + '=' + token;

function call(path, method = 'GET', body, cookie = '', requestOrigin = origin) {
  return backendRoute(new Request(origin + '/api/backend/' + path, {
    method, headers: { origin: requestOrigin, cookie }, ...(body !== undefined && { body: JSON.stringify(body) }),
  }), path.split('?')[0].split('/'));
}

test('invitation proof capture is same-origin and binds HttpOnly cookie to the ID', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('proof capture is local'));
  assert.equal((await call(recipient + '/proof', 'POST', { token }, '', 'https://wrong.test')).status, 403);
  assert.equal((await call(recipient + '/proof', 'POST', { token, actor: 2 })).status, 400);
  const response = await call(recipient + '/proof', 'POST', { token });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  const [cookie] = response.headers.getSetCookie();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=lax/);
  assert.ok(cookie.includes('Path=/api/backend/' + recipient));
});

test('email mode forwards proof in a header and never falls back to inbox', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.ok(url.endsWith(recipient + '/accept?link=true'));
    assert.equal(init.headers.get('X-Jira-Invitation-Proof'), token);
    assert.equal(init.headers.get('Authorization'), 'Bearer jwt');
    assert.equal(init.body, undefined);
    return Response.json({ code: 'LINK_INVALID' }, { status: 410 });
  });
  assert.equal((await call(recipient + '/accept?link=true', 'POST', undefined, 'jira_access=jwt')).status, 410);
  assert.equal((await call(recipient + '/accept?token=raw', 'POST', undefined, 'jira_access=jwt')).status, 400);
  assert.equal((await call(recipient + '/accept?link=true', 'POST', undefined, 'jira_access=jwt; ' + proof)).status, 410);
  assert.equal(mock.mock.callCount(), 1);
});

test('invitation BFF preserves 201, 204 and Retry-After', async (t) => {
  const project = 'projects/10/invitations';
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/revoke')) return new Response(null, { status: 204 });
    if (url.endsWith('/resend')) return Response.json({ code: 'COOLDOWN' }, { status: 429, headers: { 'Retry-After': '45' } });
    return Response.json({ invitationId: id, state: 'PENDING' }, { status: 201 });
  });
  const access = 'jira_access=jwt';
  assert.equal((await call(project, 'POST', { email: 'a@example.test', roleId: 7 }, access)).status, 201);
  assert.equal((await call(project + '/' + id + '/revoke', 'POST', undefined, access)).status, 204);
  const cooldown = await call(project + '/' + id + '/resend', 'POST', undefined, access);
  assert.equal(cooldown.status, 429);
  assert.equal(cooldown.headers.get('Retry-After'), '45');
});
