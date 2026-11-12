const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(fs.readFileSync(process.env.CONFIGURATION_CREDENTIALS, 'utf8'));
const { origin, admin, pm, developer, outsider, projectId, otherProject, statuses, browserIssue } = fixture;
const project = origin + '/app/projects/' + projectId;
const typesUrl = project + '/settings/issue-types';
const administration = origin + '/app/admin/issue-types';
const itemName = 'UI Loại ' + Date.now().toString(36);
const statusName = 'UI Trạng thái ' + Date.now().toString(36);

async function login(page, account, target) {
  await Promise.all([
    page.waitForResponse('**/api/backend/account/context'),
    page.goto(origin + '/app/sign-in?returnTo=' + encodeURIComponent(new URL(target).pathname)),
  ]);
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Mật khẩu/).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(target);
}

const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const text = (scope, label) => scope.getByText(label, { exact: true });
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });

async function openCatalogDialog(page, action, title, name, category) {
  await button(page, action).click();
  const box = dialog(page, title);
  await box.getByLabel(/^Tên/).fill(name);
  if (category) await box.getByLabel('Nhóm trạng thái').selectOption(category);
  return box;
}

async function save(box, name = 'Lưu') {
  await button(box, name).click();
  await box.waitFor({ state: 'hidden' });
}

async function remove(page, name) {
  await button(page, 'Xóa ' + name).click();
  const box = dialog(page, 'Xóa ' + name + '?');
  await save(box, 'Xóa');
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(40000);
    const faults = [];
    page.on('pageerror', (error) => faults.push(error.message));

    await login(page, admin, origin + '/app/projects');
    await page.getByRole('link', { name: 'Cấu hình hệ thống', exact: true }).click();
    await page.waitForURL(administration);
    const catalog = page.getByRole('table', { name: 'Loại công việc', exact: true });
    const renamed = itemName + ' sửa';
    await save(await openCatalogDialog(page, 'Thêm loại công việc', 'Thêm loại công việc', itemName));
    await save(await openCatalogDialog(page, 'Sửa ' + itemName, 'Sửa loại công việc', renamed));
    await page.reload();
    await text(catalog, renamed).waitFor();

    await page.getByRole('link', { name: 'Trạng thái', exact: true }).click();
    await save(await openCatalogDialog(page, 'Thêm trạng thái', 'Thêm trạng thái', statusName, 'IN_PROGRESS'));
    const changedStatus = statusName + ' sửa';
    await save(await openCatalogDialog(page, 'Sửa ' + statusName, 'Sửa trạng thái', changedStatus, 'DONE'));
    await remove(page, changedStatus);
    const blocked = await openCatalogDialog(page, 'Sửa ' + statuses.todo.statusName, 'Sửa trạng thái', statuses.todo.statusName, 'DONE');
    const [conflict] = await Promise.all([
      page.waitForResponse(origin + '/api/backend/issue-statuses/' + statuses.todo.statusId), button(blocked, 'Lưu').click(),
    ]);
    assert.equal(conflict.status(), 409);
    await blocked.getByRole('alert').waitFor();
    await button(blocked, 'Hủy').click();

    await page.getByRole('link', { name: 'Workflow', exact: true }).click();
    const rules = page.getByRole('table', { name: 'Quy tắc chuyển trạng thái' });
    await button(page, 'Thêm quy tắc').click();
    const newRule = dialog(page, 'Thêm quy tắc chuyển trạng thái');
    await newRule.getByLabel(/^Trạng thái nguồn/).selectOption(String(statuses.todo.statusId));
    await newRule.getByLabel(/^Trạng thái đích/).selectOption(String(statuses.doing.statusId));
    const [created] = await Promise.all([page.waitForResponse(origin + '/api/backend/workflows/rules'), button(newRule, 'Thêm').click()]);
    assert.equal(created.status(), 201);
    await newRule.waitFor({ state: 'hidden' });
    const deleteRule = 'Xóa quy tắc ' + statuses.todo.statusName + ' đến ' + statuses.doing.statusName;
    await button(rules, deleteRule).waitFor();

    // Trang issue đọc cạnh mới từ allowed-transitions, sau đó board thực hiện lần chuyển thật.
    await page.goto(project + '/issues');
    await button(page, browserIssue.key).click();
    const statusSelect = page.getByLabel('Chuyển trạng thái');
    await statusSelect.locator('option').filter({ hasText: statuses.doing.statusName }).waitFor({ state: 'attached' });
    await page.goto(project + '/board');
    await button(page, 'Thao tác ' + browserIssue.key).click();
    await page.getByRole('menuitem', { name: 'Chuyển tới…', exact: true }).click();
    const move = dialog(page, 'Chuyển ' + browserIssue.key);
    const [moved] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/move')),
      button(move, statuses.doing.statusName).click(),
    ]);
    assert.equal(moved.status(), 200);
    await move.waitFor({ state: 'hidden' });
    await page.goto(origin + '/app/admin/workflows');
    await button(rules, deleteRule).click();
    await save(dialog(page, 'Xóa quy tắc chuyển trạng thái?'), 'Xóa');
    assert.equal(await button(rules, deleteRule).count(), 0);
    const allowed = await page.request.get(origin + '/api/backend/workflows/allowed-transitions?currentStatusId=' + statuses.todo.statusId);
    assert.ok((await allowed.json()).every((item) => item.statusId !== statuses.doing.statusId));

    await login(page, pm, project + '/settings');
    await page.getByRole('link', { name: 'Loại công việc', exact: true }).click();
    await page.waitForURL(typesUrl);
    await button(page, 'Gán loại công việc').click();
    const assign = dialog(page, 'Gán loại công việc');
    await assign.getByLabel(/^Loại công việc/).selectOption({ label: renamed });
    await assign.getByRole('checkbox', { name: 'Đặt làm mặc định' }).check();
    await save(assign, 'Gán');
    const assigned = page.getByRole('table', { name: 'Loại công việc của dự án' });
    const defaultRadio = (name) => assigned.getByRole('radio', { name: 'Đặt ' + name + ' làm mặc định', exact: true });
    assert.ok(await defaultRadio(renamed).isChecked());
    assert.ok(await button(assigned, 'Gỡ ' + renamed).isDisabled());
    await page.reload();
    assert.ok(await defaultRadio(renamed).isChecked());
    await page.goto(project + '/issues');
    await button(page, 'Tạo công việc').click();
    const create = dialog(page, 'Tạo công việc');
    assert.equal(await create.getByLabel(/^Loại công việc/).locator('option:checked').textContent(), renamed);
    await button(create, 'Hủy').click();
    await page.goto(typesUrl);
    const [defaulted] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/default')),
      defaultRadio('Task').click(),
    ]);
    assert.equal(defaulted.status(), 200);
    await button(assigned, 'Gỡ ' + renamed).click();
    await save(dialog(page, 'Gỡ ' + renamed + ' khỏi dự án?'), 'Gỡ');
    await page.reload();
    assert.ok(await defaultRadio('Task').isChecked());

    await login(page, developer, typesUrl);
    await text(page, 'Bạn chỉ có quyền xem cấu hình loại công việc.').waitFor();
    assert.equal(await button(page, 'Gán loại công việc').count(), 0);
    await page.goto(administration);
    await text(page, 'Bạn không có quyền quản trị hệ thống').waitFor();
    await login(page, outsider, origin + '/app/projects/' + otherProject + '/settings/issue-types');
    await text(page, 'Bạn không có quyền xem dự án này').waitFor();

    await login(page, admin, administration);
    await remove(page, renamed);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.CONFIGURATION_SCREENSHOT) await page.screenshot({ path: process.env.CONFIGURATION_SCREENSHOT, fullPage: true });

    const queued = await openCatalogDialog(page, 'Thêm loại công việc', 'Thêm loại công việc', itemName);
    await page.evaluate(() => new Promise((ready) => {
      void navigator.locks.request('jira-connected-session', () => new Promise((release) => {
        window.cfgRelease = release;
        ready();
      }));
    }));
    let writes = 0;
    page.on('request', (request) => {
      if (request.url() === origin + '/api/backend/issue-types' && request.method() === 'POST') writes++;
    });
    await button(queued, 'Lưu').click();
    await button(queued, 'Đang lưu…').waitFor();
    try {
      const switched = await context.request.post(origin + '/api/backend/auth/login', { data: developer, headers: { Origin: origin } });
      assert.equal(switched.status(), 200);
    } finally {
      await page.evaluate(() => window.cfgRelease());
    }
    await queued.getByRole('alert').waitFor();
    assert.equal(writes, 0);
    await page.reload();
    await text(page, 'Bạn không có quyền quản trị hệ thống').waitFor();
    assert.deepEqual(faults, []);
    console.log('Chromium OK: admin type/status CRUD, used category conflict, rule create/delete, issue options and real board move, PM assign/default/remove, new issue default, F5, readonly/outsider, mobile and queued actor switch.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
