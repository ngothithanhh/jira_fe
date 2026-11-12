const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.E2_ORIGIN;
const collector = process.env.E2_FAKE_MAIL;
const sender = process.env.E2_SENDER;
const recipient = process.env.E2_RECIPIENT;
const password = process.env.E2_PASSWORD;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(collector ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);

async function login(page, email, target) {
  await page.goto(origin + '/app/sign-in' + (target ? '?returnTo=' + encodeURIComponent(target) : ''));
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(origin + (target || '/app/projects'));
}

async function mail() {
  for (let i = 0; i < 75; i++) {
    const response = await fetch(collector + '/test-mail/invitations?' + encodeURIComponent(recipient));
    const items = await response.json();
    if (items.length) return new URL(items.at(-1));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Fake Brevo did not receive the project invitation');
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const ownerContext = await browser.newContext();
    const receiverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const owner = await ownerContext.newPage();
    const receiver = await receiverContext.newPage();
    await login(owner, sender);
    const created = await owner.evaluate(async () => {
      const response = await fetch('/api/backend/projects/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: 'Chromium E2', projectKey: 'E2BROWSER' }) });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(created.status, 200);
    const project = created.data.projectId;
    const members = origin + '/app/projects/' + project + '/members';
    await owner.goto(members);
    await owner.getByRole('button', { name: 'Mời thành viên', exact: true }).click();
    await owner.getByLabel('Email người nhận').fill(recipient);
    await owner.getByRole('button', { name: 'Gửi lời mời', exact: true }).dblclick();
    await owner.getByText(recipient, { exact: true }).waitFor();
    assert.equal(await owner.getByText(recipient, { exact: true }).count(), 1);
    const link = await mail();
    assert.equal(link.port, '3172');
    const reply = await receiver.goto(origin + link.pathname + link.hash);
    assert.equal(reply.headers()['referrer-policy'], 'no-referrer');
    await receiver.getByRole('link', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(new URL(receiver.url()).hash, '');
    const cookies = await receiverContext.cookies();
    assert.ok(cookies.some((cookie) => cookie.name.startsWith('jira_invitation_proof_') && cookie.httpOnly));
    await receiver.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await receiver.getByLabel(/^Email/).fill(recipient);
    await receiver.getByLabel(/^Mật khẩu/).fill(password);
    await receiver.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await receiver.waitForURL(origin + link.pathname);
    await receiver.getByRole('button', { name: 'Chấp nhận', exact: true }).waitFor();
    const denied = await receiver.evaluate(async (id) => (await fetch('/api/backend/projects/' + id)).status, project);
    assert.equal(denied, 403);
    await receiver.reload();
    await receiver.getByRole('button', { name: 'Chấp nhận', exact: true }).dblclick();
    await receiver.getByRole('link', { name: 'Mở dự án', exact: true }).click();
    await receiver.waitForURL(origin + '/app/projects/' + project + '/overview');
    await owner.goto(members);
    await owner.getByRole('table', { name: 'Thành viên dự án' }).getByText(recipient, { exact: true }).waitFor();
    assert.equal(await owner.getByRole('table', { name: 'Thành viên dự án' }).getByRole('row').count(), 3);
    console.log('PASS Chromium E2: two browser contexts, invite by email, fragment/cookie, F5, forbidden before accept, two members after accept');

    const email = 'browser-uncertain-e2@test.invalid';
    await owner.getByRole('button', { name: 'Mời thành viên', exact: true }).click();
    let posts = 0;
    await owner.route('**/api/backend/projects/' + project + '/invitations', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      assert.equal((await route.fetch()).status(), 201);
      await route.abort('internetdisconnected');
    });
    const dialog = owner.getByRole('dialog', { name: 'Mời thành viên' });
    await dialog.getByLabel('Email người nhận').fill(email);
    await dialog.getByRole('button', { name: 'Gửi lời mời', exact: true }).click();
    await dialog.getByText(/Chưa xác nhận được kết quả/).waitFor();
    assert.ok(await dialog.getByRole('button', { name: 'Gửi lời mời', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
    await owner.getByRole('button', { name: 'Mời thành viên', exact: true }).click();
    await dialog.getByLabel('Email người nhận').fill(email);
    assert.ok(await dialog.getByRole('button', { name: 'Gửi lời mời', exact: true }).isDisabled());
    assert.equal(posts, 1);
    await owner.unrouteAll();
    await owner.reload();
    await owner.getByRole('button', { name: 'Lời mời', exact: true }).click();
    await owner.getByText(email, { exact: true }).waitFor();
    assert.equal(await owner.getByText(email, { exact: true }).count(), 1);
    console.log('PASS Chromium E2: lost create response, repeat blocked, one invitation after reload');

    await owner.getByRole('button', { name: 'Mời thành viên', exact: true }).click();
    await dialog.getByLabel('Email người nhận').fill('browser-stale-e2@test.invalid');
    await owner.evaluate(() => new Promise((ready) => {
      void navigator.locks.request('jira-connected-session', () => new Promise((release) => {
        window.e2ReleaseSessionLock = release;
        ready();
      }));
    }));
    let staleWrites = 0;
    owner.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/projects/' + project + '/invitations')) staleWrites++;
    });
    await dialog.getByRole('button', { name: 'Gửi lời mời', exact: true }).click();
    const switched = await owner.evaluate(async ({ recipient, password }) => (await fetch('/api/backend/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recipient, password }),
    })).status, { recipient, password });
    assert.equal(switched, 200);
    await owner.evaluate(() => window.e2ReleaseSessionLock());
    await owner.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Gửi lời mời' && !button.disabled));
    assert.equal(staleWrites, 0);
    console.log('PASS Chromium E2: queued invite cannot be dispatched after actor changes');

    await login(owner, sender, '/app/projects/' + project + '/members');
    const row = owner.getByRole('table', { name: 'Thành viên dự án' }).getByRole('row').filter({ hasText: recipient });
    await row.getByRole('button', { name: /^Gỡ / }).click();
    await owner.getByRole('dialog').getByRole('button', { name: 'Gỡ thành viên', exact: true }).click();
    await row.waitFor({ state: 'hidden' });
    console.log('PASS Chromium E2: an accepted member can still be removed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
