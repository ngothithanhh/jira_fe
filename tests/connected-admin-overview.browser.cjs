const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(readFileSync(process.env.ADMIN_OVERVIEW_CREDENTIALS, 'utf8'));
const { origin, expected } = fixture;
const path = '/app/admin/overview';
const url = origin + path;
const endpoint = origin + '/api/backend/admin/overview';
const signIn = origin + '/app/sign-in?returnTo=' + encodeURIComponent(path);
const denied = 'Chỉ quản trị viên hệ thống được cấu hình danh mục';
const fields = ['users', 'enabledUsers', 'enabledAdmins', 'projects', 'issues', 'activeSprints', 'closedSprints'];
const format = new Intl.NumberFormat('vi-VN');

async function login(page, account) {
  await page.goto(signIn);
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Mật khẩu/).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(url);
}

const counts = (page) => page.getByRole('region', { name: 'Tổng quan quản trị', exact: true }).locator('dd');

async function verifyCounts(page) {
  await counts(page).last().waitFor();
  assert.deepEqual(await counts(page).allTextContents(), fields.map((field) => format.format(expected[field])));
}

async function respondOnce(page, status, json) {
  await page.route(endpoint, (route) => route.fulfill({ status, json }), { times: 1 });
}

async function checkFailureStates(page) {
  await page.route(endpoint, async (route) => {
    await page.getByText('Đang tải số liệu tổng quan…', { exact: true }).waitFor();
    await route.fulfill({ status: 503, json: { message: 'Dịch vụ tạm thời không khả dụng.' } });
  }, { times: 1 });
  await page.reload();
  const alert = page.getByRole('alert').filter({ hasText: 'Dịch vụ tạm thời không khả dụng.' });
  await alert.waitFor();
  assert.equal(await counts(page).count(), 0);
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await verifyCounts(page);

  await respondOnce(page, 200, { users: 0 });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Dữ liệu tổng quan thiếu chỉ số' }).waitFor();
  assert.equal(await counts(page).count(), 0);

  await respondOnce(page, 401, { message: 'Phiên hết hạn.' });
  await page.reload();
  await verifyCounts(page);
  await page.route(endpoint, (route) => route.fulfill({ status: 401, json: { message: 'Phiên hết hạn.' } }), { times: 2 });
  await page.reload();
  await page.getByRole('link', { name: 'Đăng nhập lại' }).waitFor();
  assert.equal(await counts(page).count(), 0);

  await respondOnce(page, 403, { message: 'Quyền đã thay đổi.' });
  await page.reload();
  await page.getByText('Bạn không có quyền xem tổng quan quản trị', { exact: true }).waitFor();
  assert.equal(await counts(page).count(), 0);
}

async function checkAccountSwitch(page, context) {
  const other = await context.newPage();
  await other.goto(origin + '/app/projects');
  await other.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();

  let notifyResponse;
  const responseReady = new Promise((resolve) => { notifyResponse = resolve; });
  let releaseResponse;
  const delayed = new Promise((resolve) => { releaseResponse = resolve; });
  let notifyDone;
  const routeDone = new Promise((resolve) => { notifyDone = resolve; });
  await page.route(endpoint, async (route) => {
    try {
      const response = await route.fetch();
      notifyResponse(response.status());
      await delayed;
      // Query bị hủy có thể đã đóng request trước khi response được trả lại.
      await route.fulfill({ response }).catch(() => {});
    } catch (error) {
      notifyResponse(error);
    } finally {
      notifyDone();
    }
  }, { times: 1 });
  try {
    await page.reload();
    await page.getByText('Đang tải số liệu tổng quan…', { exact: true }).waitFor();
    const timeout = AbortSignal.timeout(20000);
    const status = await Promise.race([responseReady, new Promise((_, reject) => {
      timeout.addEventListener('abort', () => reject(timeout.reason), { once: true });
    })]);
    assert.equal(status, 200);
    await page.evaluate(() => {
      window.overviewRendered = false;
      new MutationObserver(() => {
        if (document.querySelector('section[aria-label="Tổng quan quản trị"] dd')) window.overviewRendered = true;
      }).observe(document.body, { childList: true, subtree: true });
    });

    // Đổi cookie bằng API thật trong tab khác, rồi phát sự kiện như form đăng nhập.
    // Chủ động bỏ khóa ở harness để buộc phản hồi cũ đến sau lúc phiên mới đã vào UI.
    const signedIn = await other.request.post(origin + '/api/backend/auth/login', { data: fixture.pm, headers: { Origin: origin } });
    assert.equal(signedIn.status(), 200);
    await other.evaluate(() => {
      const channel = new BroadcastChannel('jira-connected-session');
      channel.postMessage({ type: 'changed', source: 'overview-browser-test' });
      channel.close();
    });
    await page.getByText(denied, { exact: true }).waitFor();
    releaseResponse();
    await routeDone;
    assert.equal(await counts(page).count(), 0);
    assert.equal(await page.evaluate(() => window.overviewRendered), false);
  } finally {
    releaseResponse();
    await other.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 880 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, fixture.admin);
    await verifyCounts(page);
    await page.reload();
    await verifyCounts(page);

    const tabs = page.getByRole('navigation', { name: 'Cấu hình hệ thống', exact: true });
    for (const [label, route] of [['Loại công việc', 'issue-types'], ['Trạng thái', 'statuses'], ['Workflow', 'workflows']]) {
      await tabs.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(origin + '/app/admin/' + route);
      await page.getByRole('heading', { name: label, exact: true }).waitFor();
    }
    await tabs.getByRole('link', { name: 'Tổng quan', exact: true }).click();
    await page.waitForURL(url);
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyCounts(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.ADMIN_OVERVIEW_SCREENSHOT) await page.screenshot({ path: process.env.ADMIN_OVERVIEW_SCREENSHOT, fullPage: true });

    await checkFailureStates(page);
    await checkAccountSwitch(page, context);
    assert.deepEqual(errors, []);

    for (const account of [fixture.pm, fixture.developer, fixture.outsider]) {
      const regular = await browser.newContext();
      try {
        const viewer = await regular.newPage();
        const requests = [];
        viewer.on('request', (request) => { if (request.url() === endpoint) requests.push(request.url()); });
        await login(viewer, account);
        await viewer.getByText(denied, { exact: true }).waitFor();
        assert.equal(await counts(viewer).count(), 0);
        assert.equal(requests.length, 0);
        assert.equal((await viewer.request.get(endpoint)).status(), 403);
      } finally {
        await regular.close();
      }
    }
    console.log('Chromium production OK: seven DB counts and F5; old admin tabs; mobile; loading, 503/retry, invalid DTO, 401 recovery/expiry and 403; late response after account switch; PM/developer/outsider denied.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
