const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(fs.readFileSync(process.env.C2_CREDENTIALS, 'utf8'));
const { origin, api } = fixture;
const accountUrl = origin + '/app/account';
const passwordUrl = origin + '/api/backend/account/password';
const profileUrl = origin + '/api/backend/account/profile';
const success = 'Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.';
const uncertain = 'Chưa xác nhận được kết quả đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới.';

async function signInForm(page, account, password) {
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

async function login(page, account) {
  await Promise.all([
    page.waitForResponse('**/api/backend/account/context'),
    page.goto(origin + '/app/sign-in?returnTo=%2Fapp%2Faccount'),
  ]);
  await signInForm(page, account, account.oldPassword);
  await page.waitForURL(accountUrl);
  await page.getByRole('heading', { name: 'Hồ sơ cá nhân' }).waitFor();
}

async function change(page, oldPassword, newPassword, confirm = newPassword) {
  await page.getByLabel(/^Mật khẩu hiện tại/).fill(oldPassword);
  await page.getByLabel(/^Mật khẩu mới/).fill(newPassword);
  await page.getByLabel(/^Nhập lại mật khẩu mới/).fill(confirm);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
}

async function relogin(page, account, checkOld) {
  await page.waitForURL('**/app/sign-in?**');
  if (checkOld) {
    await signInForm(page, account, account.oldPassword);
    await page.getByRole('alert').filter({ hasText: 'Thông tin đăng nhập hoặc phiên không hợp lệ.' }).waitFor();
  }
  await signInForm(page, account, account.newPassword);
  await page.waitForURL(accountUrl);
  await page.getByRole('heading', { name: 'Hồ sơ cá nhân' }).waitFor();
}

async function rejectedTokens(cookies) {
  const access = cookies.find((item) => item.name === 'jira_access').value;
  const refreshToken = cookies.find((item) => item.name === 'jira_refresh').value;
  assert.equal((await fetch(api + 'account/context', { headers: { Authorization: 'Bearer ' + access } })).status, 401);
  assert.equal((await fetch(api + 'auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
  })).status, 401);
}

async function confirmedChange(browser) {
  const context = await browser.newContext();
  try {
    const account = fixture.browser;
    const page = await context.newPage();
    page.setDefaultTimeout(40000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, account);
    const name = page.getByLabel('Họ và tên', { exact: true });
    assert.equal(await name.inputValue(), account.fullName);
    await name.fill('Nháp C2');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    assert.equal(await name.inputValue(), account.fullName);
    await name.fill('C2 Hồ sơ đã lưu');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await page.getByRole('link', { name: 'C2 Hồ sơ đã lưu', exact: true }).waitFor();
    await page.reload();
    assert.equal(await name.inputValue(), 'C2 Hồ sơ đã lưu');
    assert.equal(await page.getByLabel('Email đăng nhập').inputValue(), account.email);
    assert.equal(await page.locator('input[type=file]').count(), 0);

    let passwordRequests = 0;
    context.on('request', (request) => { if (request.url() === passwordUrl) passwordRequests++; });
    await change(page, account.oldPassword, account.newPassword, 'different-confirmation');
    await page.getByText('Xác nhận mật khẩu mới chưa khớp.', { exact: true }).waitFor();
    await change(page, account.oldPassword, 'ắ'.repeat(25));
    await page.getByText('Mật khẩu mới cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.', { exact: true }).waitFor();
    assert.equal(passwordRequests, 0);
    await change(page, 'wrong-password', account.newPassword);
    await page.getByRole('alert').filter({ hasText: 'Mật khẩu hiện tại không đúng.' }).waitFor();
    assert.equal(passwordRequests, 1);
    assert.equal((await context.cookies()).filter((item) => /^jira_(access|refresh)$/.test(item.name)).length, 2);

    const tab = await context.newPage();
    tab.setDefaultTimeout(40000);
    await tab.goto(accountUrl);
    await tab.getByRole('heading', { name: 'Hồ sơ cá nhân' }).waitFor();
    const oldCookies = await context.cookies();
    let afterDispatch = false;
    let unexpectedRefresh = 0;
    context.on('request', (request) => {
      if (request.url() === passwordUrl) afterDispatch = true;
      if (afterDispatch && request.url().endsWith('/api/backend/auth/refresh')) unexpectedRefresh++;
    });
    const [response] = await Promise.all([page.waitForResponse(passwordUrl), change(page, account.oldPassword, account.newPassword)]);
    assert.equal(response.status(), 204);
    assert.equal(response.headers()['x-jira-session-cleared'], '1');
    await page.getByText(success, { exact: true }).waitFor();
    await Promise.all([page.waitForURL('**/app/sign-in?**'), tab.waitForURL('**/app/sign-in?**')]);
    assert.equal((await context.cookies()).filter((item) => /^jira_(access|refresh)$/.test(item.name)).length, 0);
    assert.equal(unexpectedRefresh, 0);
    assert.equal(passwordRequests, 2);
    await rejectedTokens(oldCookies);
    await relogin(page, account, true);
    await tab.goto(accountUrl);
    await tab.getByRole('heading', { name: 'Hồ sơ cá nhân' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.C2_SCREENSHOT) await page.screenshot({ path: process.env.C2_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Chromium OK: profile save/cancel/F5/header, validation, password204, two-tab logout, old tokens and password rejected, new password and mobile.');
  } finally {
    await context.close();
  }
}

async function lostResponse(browser, layer) {
  const account = fixture[layer + '-loss'];
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(40000);
    await login(page, account);
    const oldCookies = await context.cookies();
    let sends = 0;
    page.on('request', (request) => { if (request.url() === passwordUrl) sends++; });
    if (layer === 'browser') {
      await page.route(passwordUrl, async (route) => {
        const request = route.request();
        const response = await fetch(passwordUrl, { method: 'POST', body: request.postData(), headers: await request.allHeaders() });
        assert.equal(response.status, 204);
        // Node giữ response, Chromium mất response trước khi áp dụng Set-Cookie.
        await route.abort('internetdisconnected');
      }, { times: 1 });
    } else {
      fs.writeFileSync(process.env.C2_FAULT_FILE, '', { flag: 'wx' });
    }
    await change(page, account.oldPassword, account.newPassword);
    await page.getByText(uncertain, { exact: true }).waitFor();
    await page.waitForURL('**/app/sign-in?**');
    assert.equal(sends, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('jira_logout_pending')), layer === 'browser' ? '1' : null);
    if (layer === 'upstream') assert.equal((await context.cookies()).filter((item) => /^jira_(access|refresh)$/.test(item.name)).length, 0);
    await rejectedTokens(oldCookies);
    await relogin(page, account, false);
    assert.equal(await page.evaluate(() => localStorage.getItem('jira_logout_pending')), null);
    assert.equal(sends, 1);
    console.log('Chromium OK: lost ' + layer + ' response after BE commit, honest uncertain state, cookie cleanup, no replay and new password works.');
  } finally {
    if (layer === 'upstream' && fs.existsSync(process.env.C2_FAULT_FILE)) fs.unlinkSync(process.env.C2_FAULT_FILE);
    await context.close();
  }
}

async function lateProfile(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(40000);
    await login(page, fixture.late);
    let resolveStatus;
    let release;
    const withheld = new Promise((resolve) => { release = resolve; });
    const saved = new Promise((resolve, reject) => {
      resolveStatus = resolve;
      const timeout = AbortSignal.timeout(30000);
      timeout.addEventListener('abort', () => reject(timeout.reason), { once: true });
    });
    await page.route(profileUrl, async (route) => {
      const response = await route.fetch();
      resolveStatus(response.status());
      await withheld;
      await route.fulfill({ response });
    }, { times: 1 });
    await page.getByLabel('Họ và tên', { exact: true }).fill('C2 Phản hồi cũ');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    const other = fixture['other-tab'];
    try {
      assert.equal(await saved, 200);
      const switched = await context.request.post(origin + '/api/backend/auth/login', {
        data: { email: other.email, password: other.oldPassword }, headers: { Origin: origin },
      });
      assert.equal(switched.status(), 200);
    } finally {
      release();
    }
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).waitFor();
    assert.equal(await page.getByText('Đã lưu hồ sơ.', { exact: true }).count(), 0);
    await page.reload();
    assert.equal(await page.getByLabel('Họ và tên', { exact: true }).inputValue(), other.fullName);
    console.log('Chromium OK: late profile response cannot populate the next actor profile.');
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    await confirmedChange(browser);
    await lostResponse(browser, 'browser');
    if (process.env.C2_FAULT_FILE) await lostResponse(browser, 'upstream');
    await lateProfile(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
