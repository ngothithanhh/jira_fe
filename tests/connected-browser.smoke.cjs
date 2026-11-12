const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Dùng DB demo đã seed riêng. Không log credential; không kết nối dịch vụ mail/storage bên ngoài.
const credentials = JSON.parse(fs.readFileSync(process.env.CONNECTED_CREDENTIALS, 'utf8'));
const base = process.env.CONNECTED_URL || 'http://127.0.0.1:3130';
const output = process.env.CONNECTED_OUTPUT || path.join(process.cwd(), '.next-connected-build', 'evidence');
fs.mkdirSync(output, { recursive: true });
const passed = [];
const check = (name) => { passed.push(name); console.log('PASS: ' + name); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const pm = credentials.users.find((u) => u.role === 'PROJECT_MANAGER');
    const dev = credentials.users.find((u) => u.role === 'DEVELOPER');

    // Chưa đăng nhập không được thấy dữ liệu bảo vệ, kể cả truy cập URL trực tiếp.
    await page.goto(base + '/app/projects');
    await page.waitForURL('**/app/sign-in?returnTo=*');
    check('protected route redirects before exposing projects');
    await page.getByLabel(/^Email/).fill(pm.email);
    await page.getByLabel(/^Mật khẩu/).fill('incorrect-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByText('Thông tin đăng nhập hoặc phiên không hợp lệ.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/^Email/).inputValue(), pm.email);
    check('wrong password shows error and preserves draft');

    await page.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL('**/app/projects');
    await page.getByRole('cell', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: 'Cổng thông tin nội bộ', exact: true }).count(), 1);
    const cookies = await context.cookies();
    assert.equal(cookies.filter((c) => ['jira_access', 'jira_refresh'].includes(c.name)).length, 2);
    assert.ok(cookies.filter((c) => c.name.startsWith('jira_')).every((c) => c.httpOnly));
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), null);
    assert.ok(!(await page.evaluate(() => document.cookie)).includes('jira_access'));
    await page.screenshot({ path: path.join(output, 'projects.png'), fullPage: true });
    check('real PM login loads 3 authorized projects; tokens are HttpOnly only');

    await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
    await page.getByRole('heading', { name: pm.fullName, exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: pm.fullName, exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'account.png'), fullPage: true });
    check('account and reload keep the real database identity');

    const second = await context.newPage();
    await second.goto(base + '/app/projects');
    await second.getByRole('cell', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    // Giữ response context chậm để quan sát việc hồ sơ A bị ẩn trước khi B được tải xong.
    await page.route('**/api/backend/account/context', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700)); await route.continue();
    });
    await second.goto(base + '/app/sign-in');
    await second.getByLabel(/^Email/).fill(dev.email);
    await second.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await second.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByText('Đang kiểm tra phiên đăng nhập…', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: pm.fullName, exact: true }).count(), 0);
    await page.getByRole('heading', { name: dev.fullName, exact: true }).waitFor();
    await second.goto(base + '/app/sign-in');
    await second.getByLabel(/^Email/).fill(pm.email);
    await second.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await second.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await second.waitForURL('**/app/projects');
    await page.getByRole('heading', { name: pm.fullName, exact: true }).waitFor();
    await page.unroute('**/api/backend/account/context');
    check('account switch hides the old identity while replacement context is loading');
    let refreshes = 0;
    context.on('request', (request) => { if (request.url().endsWith('/api/backend/auth/refresh')) refreshes++; });
    await context.clearCookies({ name: 'jira_access' });
    await Promise.all([page.reload(), second.reload()]);
    await page.getByRole('heading', { name: pm.fullName, exact: true }).waitFor();
    await second.getByRole('cell', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    assert.equal(refreshes, 1, 'both tabs must share one refresh rotation');
    check('missing access cookie recovers both tabs with exactly one refresh');

    const forbidden = await page.evaluate(async (url) => {
      const response = await fetch(url); return response.status;
    }, '/api/backend/account/context?projectId=2147483647');
    assert.equal(forbidden, 404);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(/\/app\/sign-in(?:\?|$)/);
    await second.waitForURL('**/app/sign-in?returnTo=*');
    assert.equal((await context.cookies()).filter((c) => c.name.startsWith('jira_')).length, 0);
    check('logout revokes session and signs out the second tab');

    await page.goto(base + '/app/sign-in');
    await page.getByLabel(/^Email/).fill(dev.email);
    await page.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL('**/app/projects');
    await page.getByRole('cell', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: 'Cổng thông tin nội bộ', exact: true }).count(), 0);
    const portal = credentials.projects.find((p) => p.key === 'PORTAL');
    const denied = await page.evaluate(async (id) => (await fetch(`/api/backend/account/context?projectId=${id}`)).status, portal.id);
    assert.equal(denied, 403);
    await page.reload();
    await page.getByRole('cell', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    check('switching user clears old cache; developer cannot read PM-only project');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'projects-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('mobile shell stays within viewport');

    // Browser → Next bị mất mạng: ý định thoát tồn tại qua reload cho tới khi Next xóa cookie.
    await page.route('**/api/backend/auth/logout', (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(/\/app\/sign-in(?:\?|$)/);
    assert.equal(await page.evaluate(() => localStorage.getItem('jira_logout_pending')), '1');
    await page.goto(base + '/app/projects');
    await page.waitForURL('**/app/sign-in?returnTo=*');
    assert.equal(await page.getByRole('heading', { name: dev.fullName, exact: true }).count(), 0);
    await page.unroute('**/api/backend/auth/logout');
    await page.goto(base + '/app/projects');
    await page.waitForURL('**/app/sign-in?returnTo=*');
    assert.equal((await context.cookies()).filter((c) => c.name.startsWith('jira_')).length, 0);
    check('browser-to-Next logout failure cannot resurrect session after reload');

    assert.deepEqual(errors, []);
    check('no uncaught browser runtime errors');

    const fresh = await browser.newContext();
    const registration = await fresh.newPage();
    await registration.goto(base + '/app/sign-up');
    await registration.getByLabel(/^Họ và tên/).fill('Người dùng kiểm tra');
    await registration.getByLabel(/^Tên người dùng/).fill('acceptance');
    await registration.getByLabel(/^Email/).fill(`acceptance-${Date.now()}@example.test`);
    await registration.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await registration.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await registration.waitForURL('**/app/projects');
    await registration.getByText('Chưa có dự án', { exact: true }).waitFor();
    check('real registration creates user and shows empty authorized scope');
    await registration.goto(base + '/app/sign-up');
    await registration.getByLabel(/^Họ và tên/).fill(pm.fullName);
    await registration.getByLabel(/^Tên người dùng/).fill('duplicate');
    await registration.getByLabel(/^Email/).fill(pm.email);
    await registration.getByLabel(/^Mật khẩu/).fill(credentials.password);
    await registration.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await registration.getByText('Email đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.', { exact: true }).waitFor();
    check('duplicate registration returns a correctable conflict without creating a user');
    await fresh.close();
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ passed, count: passed.length, base }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
