const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.E1_ORIGIN;
const mailbox = process.env.E1_FAKE_MAIL;
const legacy = process.env.E1_LEGACY_EMAIL;
const password = process.env.E1_LEGACY_PASSWORD;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(mailbox ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(legacy ?? '', /@test\.invalid$/);
assert.ok(password);

async function latestCode(email) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(mailbox + '/test-mail?' + encodeURIComponent(email));
    assert.equal(response.status, 200);
    const codes = await response.json();
    if (codes.length) return codes.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Fake Brevo did not receive the verification mail');
}

async function register(page, email, name) {
  await page.getByLabel(/^Họ và tên/).fill('E1 Browser');
  await page.getByLabel(/^Tên người dùng/).fill(name);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/backend/auth/register'));
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  return response;
}

async function login(page, email) {
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/app/projects');
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext();
    const a = await context.newPage();
    const errors = [];
    a.on('pageerror', (error) => errors.push(error.message));
    const first = 'browser-first-e1@test.invalid';
    const second = 'browser-second-e1@test.invalid';
    await a.goto(origin + '/app/sign-up');
    const created = await register(a, first, 'e1-first');
    assert.equal(created.status(), 202);
    const publicView = await created.json();
    assert.equal(publicView.deliveryState, 'QUEUED');
    assert.equal(publicView.proofToken, undefined);
    await a.getByRole('heading', { name: 'Xác minh email' }).waitFor();
    const cookies = await context.cookies();
    assert.ok(cookies.some((cookie) => cookie.name.startsWith('jira_registration_active_') && cookie.httpOnly
      && cookie.path === '/api/backend/auth/registration' && cookie.sameSite === 'Lax'));
    assert.ok(cookies.every((cookie) => !['jira_access', 'jira_refresh'].includes(cookie.name)));
    assert.equal(await a.evaluate(() => sessionStorage.getItem('jira-registration-challenge')), publicView.challengeId);
    await a.reload();
    await a.getByLabel('Mã xác minh').waitFor();
    const firstCode = await latestCode(first);

    const b = await context.newPage();
    b.on('pageerror', (error) => errors.push(error.message));
    await b.goto(origin + '/app/sign-up');
    await b.getByRole('button', { name: 'Sửa email', exact: true }).click();
    // Browser nhận headers/cookie của lượt mới nhưng không nhận được kết quả start để chuyển màn.
    await b.route('**/api/backend/auth/register', async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 202);
      await route.fulfill({ response, status: 502, json: { message: 'Chưa xác nhận được kết quả xác minh.' } });
    }, { times: 1 });
    const replacement = await register(b, second, 'e1-second');
    assert.equal(replacement.status(), 502);
    await b.getByText('Chưa xác nhận được kết quả xác minh.', { exact: true }).waitFor();
    await b.reload();
    await b.getByLabel('Mã xác minh').waitFor();
    await a.getByLabel('Mã xác minh').fill(firstCode);
    await a.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await a.getByText(/Lượt xác minh đã đổi trong tab khác/).waitFor();

    const code = await latestCode(second);
    const badCode = code === '000000' ? '000001' : '000000';
    await b.getByLabel('Mã xác minh').fill(badCode);
    await b.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await b.getByText('Mã xác minh không đúng.', { exact: true }).waitFor();
    await b.getByLabel('Mã xác minh').fill(code);
    const verified = b.waitForResponse((r) => r.url().endsWith('/api/backend/auth/registration/verify'));
    await b.getByRole('button', { name: 'Xác minh', exact: true }).click();
    assert.equal((await verified).status(), 204);
    await b.waitForURL('**/app/sign-in?returnTo=*');
    assert.ok((await context.cookies()).every((cookie) => !['jira_access', 'jira_refresh'].includes(cookie.name)));
    await login(b, second);
    await b.goto(origin + '/app/account');
    await b.getByText('Email đã được xác minh.', { exact: true }).waitFor();
    console.log('PASS browser: register, HttpOnly proof, F5 after lost result, stale tab, wrong OTP, verify and manual login');

    const isolated = await browser.newContext();
    const c = await isolated.newPage();
    c.on('pageerror', (error) => errors.push(error.message));
    await c.goto(origin + '/app/sign-up');
    assert.equal((await register(c, second.toUpperCase(), 'duplicate')).status(), 409);
    await c.getByText(/Email đã được sử dụng/).waitFor();
    await c.goto(origin + '/app/sign-in');
    await login(c, legacy);
    await c.goto(origin + '/app/account');
    await c.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    const legacyCode = await latestCode(legacy);
    await c.reload();
    await c.getByLabel('Mã xác minh').fill(legacyCode);
    await c.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await c.getByText('Email đã được xác minh.', { exact: true }).waitFor();
    assert.equal(await c.evaluate(async () => (await fetch('/api/backend/auth/me')).status), 200);
    assert.deepEqual(errors, []);
    console.log('PASS browser: canonical duplicate, legacy OTP after reload, existing session remains active');
  } finally { await browser.close(); }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
