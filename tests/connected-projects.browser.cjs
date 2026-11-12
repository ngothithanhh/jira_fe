const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const credentials = JSON.parse(fs.readFileSync(process.env.CONNECTED_CREDENTIALS, 'utf8'));
const base = process.env.CONNECTED_URL || 'http://127.0.0.1:3130';
const output = process.env.CONNECTED_OUTPUT || path.join(process.cwd(), '.next-connected-build', 'project-evidence');
fs.mkdirSync(output, { recursive: true });
const passed = [];
const check = (text) => { passed.push(text); console.log('PASS: ' + text); };

/** Cookie giữ trong browser context; helper chỉ gọi BFF cùng origin, không đọc/ghi token ở JS. */
async function request(page, route, method = 'GET', data) {
  return page.evaluate(async ({ route, method, data }) => {
    const response = await fetch('/api/backend/' + route, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
    const text = await response.text(); return { status: response.status, data: text ? JSON.parse(text) : null };
  }, { route, method, data });
}

async function login(page, user) {
  await page.goto(base + '/app/sign-in');
  await page.getByLabel(/^Email/).fill(user.email);
  await page.getByLabel(/^Mật khẩu/).fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/app/projects');
  await page.getByRole('heading', { name: 'Dự án', exact: true }).waitFor();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
    const admin = credentials.users.find((u) => u.role === 'SYSTEM_ADMIN'); assert.ok(admin, 'prepare demo admin first');
    await login(page, admin);
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dạng thẻ', exact: true }).click();
    await page.getByRole('link', { name: 'Website thương mại điện tử', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dạng bảng', exact: true }).click();
    await page.getByLabel('Tìm dự án', { exact: true }).fill('SHOP');
    await page.getByRole('cell', { name: 'SHOP', exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: 'CARE', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'projects-desktop.png'), fullPage: true });
    check('existing table/card/search UI reads authorized real project data');

    const key = 'T' + Date.now().toString(36).toUpperCase();
    const name = 'Dự án kiểm thử ' + key;
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/^Tên dự án/).fill(name);
    await modal.getByLabel(/^Mã dự án/).fill(key);
    await modal.getByLabel(/^Mô tả/).fill('Dữ liệu tạo từ giao diện, lưu trong PostgreSQL.');
    await modal.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await page.waitForURL(/\/app\/projects\/\d+\/overview$/);
    const projectId = Number(page.url().match(/projects\/(\d+)/)[1]);
    await page.getByRole('heading', { name, exact: true }).waitFor();
    const created = await request(page, `projects/${projectId}`);
    assert.equal(created.status, 200); assert.equal(created.data.leader.id, admin.id);
    assert.equal(created.data.projectKey, key); assert.equal(created.data.issueCount, 0); assert.equal(created.data.memberCount, 1);
    await page.reload(); await page.getByRole('heading', { name, exact: true }).waitFor();
    check('create empty project uses authenticated lead and persists across reload');

    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click();
    await page.getByLabel(/^Tên dự án/).fill('Bản nháp không lưu');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    assert.equal(await page.getByLabel(/^Tên dự án/).inputValue(), name);
    const changed = name + ' đã cập nhật';
    let saves = 0;
    page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().endsWith(`/api/backend/projects/${projectId}`)) saves++; });
    await page.getByLabel(/^Tên dự án/).fill(changed);
    await page.getByLabel(/^Mô tả/).fill('Mô tả mới đã lưu từ API thật.');
    await page.locator('form').evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await page.getByText('Đã lưu thông tin dự án.', { exact: true }).waitFor();
    assert.equal(saves, 1, 'double submit must produce one PATCH');
    await page.reload(); await page.getByLabel(/^Tên dự án/).waitFor();
    assert.equal(await page.getByLabel(/^Tên dự án/).inputValue(), changed);
    assert.equal(await page.getByLabel(/^Mã dự án/).inputValue(), key);
    assert.equal(await page.getByLabel(/^Mã dự án/).isDisabled(), true);
    await page.screenshot({ path: path.join(output, 'project-settings.png'), fullPage: true });
    check('settings cancel restores draft; save persists name/description and keeps key/lead');

    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await modal.getByLabel(/^Tên dự án/).fill('Trùng mã kiểm thử');
    await modal.getByLabel(/^Mã dự án/).fill(key);
    await modal.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await modal.getByText('Mã dự án đã tồn tại. Vui lòng dùng mã khác.', { exact: true }).waitFor();
    assert.equal(await modal.getByLabel(/^Tên dự án/).inputValue(), 'Trùng mã kiểm thử');
    await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
    assert.equal((await request(page, 'projects/create', 'POST', { projectName: ' ', projectKey: 'BAD' })).status, 400);
    check('duplicate key returns 409 and preserves form; invalid API data returns 400');

    const shop = credentials.projects.find((p) => p.key === 'SHOP'); assert.ok(shop);
    await page.goto(base + `/app/projects/${shop.id}/overview`);
    await page.getByRole('heading', { name: shop.name, exact: true }).waitFor();
    const shopData = await request(page, `projects/${shop.id}`);
    assert.ok(shopData.data.issueCount > 0); assert.ok(shopData.data.memberCount > 0); assert.ok(shopData.data.sprintCount > 0);
    await page.screenshot({ path: path.join(output, 'project-overview.png'), fullPage: true });
    await page.getByRole('link', { name: 'Cài đặt', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
    await modal.getByLabel(/^Nhập SHOP/).fill('SHOP');
    await modal.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
    await modal.getByText('Dự án còn dữ liệu liên kết nên chưa thể xóa.', { exact: true }).waitFor();
    assert.equal((await request(page, `projects/${shop.id}`)).status, 200);
    await modal.getByRole('button', { name: 'Hủy', exact: true }).click();
    check('real FK conflict blocks delete and keeps existing project/data');

    await page.goto(base + `/app/projects/${projectId}/settings`);
    await page.getByLabel(/^Tên dự án/).waitFor();
    await page.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
    assert.equal(await modal.getByRole('button', { name: 'Xóa dự án', exact: true }).isDisabled(), true);
    await modal.getByLabel(new RegExp('^Nhập ' + key)).fill(key);
    await modal.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
    await page.waitForURL('**/app/projects');
    assert.equal((await request(page, `projects/${projectId}`)).status, 404);
    await page.reload(); await page.getByRole('heading', { name: 'Dự án', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: changed, exact: true }).count(), 0);
    check('typed-key delete succeeds for empty project; F5/list/direct GET confirm deletion');

    await page.goto(base + '/app/projects/not-a-number/overview');
    await page.getByText('Không tìm thấy dự án', { exact: true }).waitFor();
    await page.goto(base + '/app/projects/2147483647/overview');
    await page.getByText('Không tìm thấy dự án', { exact: true }).waitFor();
    check('invalid and missing project routes show 404 state without fallback');

    const devContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const devPage = await devContext.newPage();
    await login(devPage, credentials.users.find((u) => u.role === 'DEVELOPER'));
    assert.equal(await devPage.getByRole('button', { name: 'Tạo dự án', exact: true }).count(), 1);
    await devPage.goto(base + `/app/projects/${shop.id}/settings`);
    await devPage.getByText('Bạn chỉ được xem thông tin dự án.', { exact: true }).waitFor();
    assert.equal(await devPage.getByLabel(/^Tên dự án/).isDisabled(), true);
    assert.equal((await request(devPage, `projects/${shop.id}`, 'PATCH', { projectName: 'Unauthorized' })).status, 403);
    assert.equal((await request(devPage, `projects/${shop.id}`, 'DELETE')).status, 403);
    await devPage.screenshot({ path: path.join(output, 'project-mobile-readonly.png'), fullPage: true });
    const portal = credentials.projects.find((p) => p.key === 'PORTAL');
    await devPage.goto(base + `/app/projects/${portal.id}/overview`);
    await devPage.getByText('Bạn không có quyền xem dự án này', { exact: true }).waitFor();
    check('developer UI is read-only and direct unauthorized APIs/project routes return 403');
    assert.ok(await devPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('mobile layout stays within viewport');

    // Giữ refetch list của phiên admin sau CREATE để tab khác đổi tài khoản trước khi completion điều hướng.
    await page.goto(base + '/app/projects');
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).waitFor();
    let releaseList; let listReached;
    const listGate = new Promise((resolve) => { releaseList = resolve; });
    const reached = new Promise((resolve) => { listReached = resolve; });
    await page.route('**/api/backend/projects/getList', async (route) => {
      listReached(); await listGate;
      try { await route.continue(); } catch { /* query cũ bị hủy khi nhận thông báo đổi phiên */ }
    });
    await page.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    const lateKey = 'L' + Date.now().toString(36).toUpperCase();
    await modal.getByLabel(/^Tên dự án/).fill('Dự án phản hồi chậm');
    await modal.getByLabel(/^Mã dự án/).fill(lateKey);
    await modal.getByRole('button', { name: 'Tạo dự án', exact: true }).click();
    await reached;
    const otherTab = await context.newPage();
    await login(otherTab, credentials.users.find((u) => u.role === 'DEVELOPER'));
    releaseList();
    await page.unroute('**/api/backend/projects/getList');
    try { await page.getByRole('button', { name: 'Dạng thẻ', exact: true }).waitFor(); }
    catch (error) {
      await page.screenshot({ path: path.join(output, 'late-completion-debug.png'), fullPage: true });
      console.log('Late completion URL:', page.url()); console.log((await page.locator('body').innerText()).slice(0, 1600));
      throw error;
    }
    assert.equal(new URL(page.url()).pathname, '/app/projects');
    assert.equal(await page.getByRole('button', { name: 'Tạo dự án', exact: true }).count(), 1);
    assert.equal(await page.getByText(`Đã tạo dự án ${lateKey}`, { exact: true }).count(), 0);
    check('late create completion cannot redirect or show previous-account data after another tab logs in');
    await otherTab.close();

    assert.deepEqual(errors, []); check('no uncaught browser errors');
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ count: passed.length, passed, base }, null, 2));
    await devContext.close(); await context.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
