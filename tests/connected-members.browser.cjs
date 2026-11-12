const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(fs.readFileSync(process.env.C1_CREDENTIALS, 'utf8'));
const { origin, projectId, pm, developer, outsider, browser: candidate, roles } = fixture;
const projectUrl = origin + '/app/projects/' + projectId;
const membersUrl = projectUrl + '/members';
const memberApi = origin + '/api/backend/projects/' + projectId + '/members';

async function login(page, account, target = membersUrl) {
  const pathname = new URL(target).pathname;
  await Promise.all([
    page.waitForResponse('**/api/backend/account/context'),
    page.goto(origin + '/app/sign-in?returnTo=' + encodeURIComponent(pathname)),
  ]);
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Mật khẩu/).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(target);
}

const membersTable = (page) => page.getByRole('table', { name: 'Thành viên dự án' });
const candidateRow = (page) => membersTable(page).getByRole('row', { name: /C1 Browser/ });

async function count(page, expected) {
  const response = await page.request.get(origin + '/api/backend/projects/' + projectId);
  assert.equal(response.status(), 200);
  assert.equal((await response.json()).memberCount, expected);
}

async function overviewCount(page, expected) {
  await page.getByRole('link', { name: 'Tổng quan', exact: true }).click();
  const card = page.locator('p').filter({ hasText: /^Thành viên$/ }).locator('..');
  await card.getByText(String(expected), { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Thành viên', exact: true }).click();
  await page.waitForURL(membersUrl);
}

async function openAdd(page) {
  await page.getByRole('button', { name: 'Thêm thành viên', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm thành viên' });
  const email = dialog.getByLabel(/^Email ứng viên/);
  const search = dialog.getByRole('button', { name: 'Tìm ứng viên' });
  await email.fill('partial');
  assert.ok(await search.isDisabled());
  await email.fill(candidate.email);
  await search.click();
  await dialog.getByText('Ứng viên: C1 Browser', { exact: true }).waitFor();
  const role = dialog.getByLabel(/^Vai trò trong dự án/);
  assert.equal(await role.inputValue(), String(roles.developer));
  assert.equal(await role.locator('option').filter({ hasText: /SYSTEM_ADMIN|PROJECT_MANAGER/ }).count(), 0);
  return dialog;
}

async function removeCandidate(page) {
  await candidateRow(page).getByRole('button', { name: 'Gỡ C1 Browser' }).click();
  const confirm = page.getByRole('dialog', { name: /Gỡ C1 Browser/ });
  await confirm.getByRole('button', { name: 'Gỡ thành viên' }).click();
  await confirm.waitFor({ state: 'hidden' });
  await candidateRow(page).waitFor({ state: 'hidden' });
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await login(page, pm, projectUrl + '/overview');
    await page.getByRole('link', { name: 'Thành viên', exact: true }).click();
    await page.waitForURL(membersUrl);
    await membersTable(page).getByText('C1 PM', { exact: true }).waitFor();
    assert.ok(await page.getByText('Trưởng dự án', { exact: false }).first().isVisible());
    assert.equal(await membersTable(page).locator('tbody tr').count(), 2);
    const listSearch = page.getByLabel('Tìm thành viên');
    await listSearch.fill('developer');
    assert.equal(await membersTable(page).locator('tbody tr').count(), 1);
    await listSearch.fill('');
    await count(page, 2);

    const add = await openAdd(page);
    const confirmAdd = add.getByRole('button', { name: 'Thêm', exact: true });
    const offline = (route) => route.abort('internetdisconnected');
    await page.route(memberApi, offline, { times: 1 });
    await confirmAdd.click();
    await add.getByRole('alert').filter({ hasText: 'Mất kết nối' }).waitFor();
    assert.equal(await add.getByLabel(/^Email ứng viên/).inputValue(), candidate.email);
    await count(page, 2);

    let sends = 0;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const holdWrite = async (route) => {
      if (route.request().method() === 'POST') {
        sends++;
        await held;
      }
      await route.continue();
    };
    await page.route(memberApi, holdWrite);
    await Promise.all([
      page.waitForRequest((request) => request.url() === memberApi && request.method() === 'POST'),
      confirmAdd.evaluate((button) => { button.click(); button.click(); }),
    ]);
    assert.ok(await add.getByRole('button', { name: 'Đang thêm…' }).isDisabled());
    release();
    await add.waitFor({ state: 'hidden' });
    await page.unroute(memberApi, holdWrite);
    assert.equal(sends, 1);
    await candidateRow(page).waitFor();
    await count(page, 3);
    await overviewCount(page, 3);

    await page.reload();
    const assignedAt = await candidateRow(page).locator('time').getAttribute('datetime');
    assert.ok(assignedAt);
    const role = candidateRow(page).getByLabel('Vai trò của C1 Browser');
    await role.selectOption(String(roles.scrum));
    await page.waitForFunction((roleId) => {
      const field = document.querySelector('select[aria-label="Vai trò của C1 Browser"]');
      return field?.value === roleId && !field.disabled;
    }, String(roles.scrum));
    await page.reload();
    assert.equal(await role.inputValue(), String(roles.scrum));
    assert.equal(await candidateRow(page).locator('time').getAttribute('datetime'), assignedAt);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.C1_SCREENSHOT) await page.screenshot({ path: process.env.C1_SCREENSHOT, fullPage: true });
    await removeCandidate(page);
    await page.reload();
    await membersTable(page).getByText('C1 PM', { exact: true }).waitFor();
    assert.equal(await candidateRow(page).count(), 0);
    await count(page, 2);
    await overviewCount(page, 2);

    // Mô phỏng tab đăng nhập khác lấy khóa trước thao tác C1 đang chờ.
    const queued = await openAdd(page);
    await page.evaluate(() => new Promise((ready) => {
      void navigator.locks.request('jira-connected-session', () => new Promise((releaseLock) => {
        window.c1ReleaseSessionLock = releaseLock;
        ready();
      }));
    }));
    let staleWrites = 0;
    page.on('request', (request) => {
      if (request.url() === memberApi && request.method() === 'POST') staleWrites++;
    });
    await queued.getByRole('button', { name: 'Thêm', exact: true }).click();
    await queued.getByRole('button', { name: 'Đang thêm…' }).waitFor();
    const switched = await context.request.post(origin + '/api/backend/auth/login', {
      data: developer, headers: { Origin: origin },
    });
    assert.equal(switched.status(), 200);
    await page.evaluate(() => window.c1ReleaseSessionLock());
    await queued.getByRole('alert').filter({ hasText: 'Không xác nhận được thao tác' }).waitFor();
    assert.equal(staleWrites, 0);
    await page.reload();
    await page.getByText('Bạn chỉ có quyền xem danh sách thành viên.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Thêm thành viên', exact: true }).count(), 0);
    await count(page, 2);

    // BE đã commit bằng PM, nhưng cookie đổi trước lúc response được trả về form cũ.
    await login(page, pm);
    const late = await openAdd(page);
    let completeResponse;
    let releaseResponse;
    const saved = new Promise((resolve, reject) => {
      completeResponse = resolve;
      const timeout = AbortSignal.timeout(30000);
      timeout.addEventListener('abort', () => reject(timeout.reason), { once: true });
    });
    const withheld = new Promise((resolve) => { releaseResponse = resolve; });
    const holdResponse = async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      completeResponse(response.status());
      await withheld;
      await route.fulfill({ response });
    };
    await page.route(memberApi, holdResponse);
    await late.getByRole('button', { name: 'Thêm', exact: true }).click();
    assert.equal(await saved, 200);
    try {
      const replacement = await context.request.post(origin + '/api/backend/auth/login', {
        data: developer, headers: { Origin: origin },
      });
      assert.equal(replacement.status(), 200);
    } finally {
      releaseResponse();
    }
    await late.getByRole('button', { name: 'Thêm', exact: true }).waitFor();
    assert.ok(await late.isVisible());
    await page.unroute(memberApi, holdResponse);
    await login(page, pm);
    await candidateRow(page).waitFor();
    await removeCandidate(page);
    await count(page, 2);

    const second = await context.newPage();
    second.setDefaultTimeout(45000);
    await login(second, outsider);
    await second.getByText('Bạn không có quyền xem dự án này', { exact: true }).waitFor();
    await page.getByText('Bạn không có quyền xem dự án này', { exact: true }).waitFor();
    assert.equal(await membersTable(page).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Chromium OK: project nav, filter, exact lookup, network error, double submit, add/edit/remove, F5/overview count/assignedAt, mobile, queued actor switch, late response, readonly and outsider.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
