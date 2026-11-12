const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(readFileSync(process.env.SPRINT_CREDENTIALS, 'utf8'));
const { origin, projectId, browser: future, browserIssue, browserActive: active, fault } = fixture;
const project = `${origin}/app/projects/${projectId}`;
const backlogUrl = `${project}/backlog`;
const endpoint = (id) => `${origin}/api/backend/sprints/${id}`;
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const group = (page, name) => page.getByRole('region', { name, exact: true });
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });
const field = (parent, name) => parent.getByLabel(new RegExp(`^${name}`));

async function login(page, credentials) {
  await page.goto(`${origin}/app/sign-in?returnTo=${encodeURIComponent(new URL(backlogUrl).pathname)}`);
  await field(page, 'Email').fill(credentials.email);
  await field(page, 'Mật khẩu').fill(credentials.password);
  await button(page, 'Đăng nhập').click();
  await page.waitForURL(backlogUrl);
}

async function edit(page, name) {
  await button(group(page, name), 'Sửa sprint').click();
  return dialog(page, 'Sửa sprint');
}

async function verifyPatch(page, form, id, expected, { double = false } = {}) {
  const target = endpoint(id);
  let sent = 0;
  const observe = (request) => { if (request.url() === target && request.method() === 'PATCH') sent++; };
  page.on('request', observe);
  try {
    const response = page.waitForResponse((value) => value.url() === target && value.request().method() === 'PATCH');
    const save = button(form, 'Lưu sprint');
    if (double) await save.dblclick();
    else await save.click();
    const saved = await response;
    assert.equal(saved.status(), 200);
    assert.deepEqual(saved.request().postDataJSON(), expected);
    await form.waitFor({ state: 'hidden' });
    assert.equal(sent, 1);
  } finally {
    page.off('request', observe);
  }
}

async function checkGateFailure(page) {
  const form = await edit(page, fault.sprintName);
  await field(form, 'Mục tiêu sprint').fill('Bản nháp giữ khi gate lỗi');
  const contextUrl = `${origin}/api/backend/account/context?projectId=${projectId}`;
  await page.route(contextUrl, (route) => route.fulfill({ status: 503, json: { message: 'Gate test tạm lỗi.' } }), { times: 1 });
  const failed = page.waitForResponse((value) => value.url() === contextUrl && value.status() === 503);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await failed;
  const reload = button(form, 'Tải lại dữ liệu sprint');
  await reload.waitFor();
  assert.equal(await field(form, 'Mục tiêu sprint').inputValue(), 'Bản nháp giữ khi gate lỗi');
  assert.equal(await button(form, 'Lưu sprint').isDisabled(), true);
  await reload.click();
  await reload.waitFor({ state: 'hidden' });
  assert.equal(await field(form, 'Mục tiêu sprint').inputValue(), 'Bản nháp giữ khi gate lỗi');
  await button(form, 'Hủy').click();
}

async function checkLostResponse(page) {
  const form = await edit(page, fault.sprintName);
  const changed = `Máy chủ đã lưu ${Date.now()}`;
  await field(form, 'Mục tiêu sprint').fill(changed);
  let requests = 0;
  await page.route(endpoint(fault.sprintId), async (route) => {
    requests++;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort('failed');
  }, { times: 1 });
  await button(form, 'Lưu sprint').click();
  await form.getByText(/Chưa xác nhận được kết quả/).waitFor();
  assert.equal(await field(form, 'Mục tiêu sprint').inputValue(), changed);
  assert.equal(await button(form, 'Lưu sprint').isDisabled(), true);
  assert.equal(requests, 1);
  await page.reload();
  await group(page, fault.sprintName).getByText(changed, { exact: false }).waitFor();
}

async function switchToDeveloper(other) {
  const switched = await other.request.post(`${origin}/api/backend/auth/login`, { data: fixture.dev, headers: { Origin: origin } });
  assert.equal(switched.status(), 200);
  await other.evaluate(() => {
    const channel = new BroadcastChannel('jira-connected-session');
    channel.postMessage({ type: 'changed', source: 'sprint-test' });
    channel.close();
  });
}

async function checkActorSwitch(page, context) {
  const form = await edit(page, fault.sprintName);
  await field(form, 'Mục tiêu sprint').fill('Draft trước lúc đổi tài khoản');
  const other = await context.newPage();
  try {
    await other.goto(origin + '/app/projects');
    await button(other, 'Đăng xuất').waitFor();
    await page.evaluate(() => new Promise((ready) => {
      void navigator.locks.request('jira-connected-session', () => new Promise((release) => {
        window.releaseSprintTest = release;
        ready();
      }));
    }));
    let sent = 0;
    page.on('request', (request) => { if (request.url() === endpoint(fault.sprintId) && request.method() === 'PATCH') sent++; });
    await button(form, 'Lưu sprint').click();
    await button(form, 'Đang xử lý…').waitFor();
    await switchToDeveloper(other);
    await form.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.releaseSprintTest());
    await group(page, fault.sprintName).waitFor();
    assert.equal(await button(group(page, fault.sprintName), 'Sửa sprint').count(), 0);
    assert.equal(sent, 0);
  } finally {
    await page.evaluate(() => window.releaseSprintTest?.()).catch(() => {});
    await other.close();
  }
}

async function checkLateCompletion(page, context) {
  await login(page, fixture.pm);
  const form = await edit(page, fault.sprintName);
  const goal = `Lưu trước đổi phiên ${Date.now()}`;
  await field(form, 'Mục tiêu sprint').fill(goal);
  const other = await context.newPage();
  const held = Promise.withResolvers();
  const release = Promise.withResolvers();
  try {
    await other.goto(origin + '/app/projects');
    await button(other, 'Đăng xuất').waitFor();
    await page.route(endpoint(fault.sprintId), async (route) => {
      try {
        const response = await route.fetch();
        held.resolve(response.status());
        await release.promise;
        await route.fulfill({ response }).catch(() => {});
      } catch (error) { held.reject(error); }
    }, { times: 1 });
    await button(form, 'Lưu sprint').click();
    assert.equal(await held.promise, 200);
    await switchToDeveloper(other);
    await form.waitFor({ state: 'hidden' });
    release.resolve();
    await group(page, fault.sprintName).getByText(goal, { exact: false }).waitFor();
    assert.equal(await button(group(page, fault.sprintName), 'Sửa sprint').count(), 0);
  } finally {
    release.resolve();
    await other.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, fixture.pm);
    const nextName = 'UI Future đã sửa';
    let form = await edit(page, future.sprintName);
    assert.equal(await field(form, 'Ngày bắt đầu').inputValue(), future.startDate);
    await field(form, 'Tên sprint').fill(nextName);
    await field(form, 'Mục tiêu sprint').fill('');
    await field(form, 'Ngày kết thúc').fill('2026-11-15T17:31:10');
    await button(form, 'Lưu sprint').click();
    await form.getByText(/Ngày kết thúc phải sau/).waitFor();
    await field(form, 'Ngày kết thúc').fill('2026-11-30T17:31:10');
    await verifyPatch(page, form, future.sprintId, { sprintName: nextName, goal: '', endDate: '2026-11-30T17:31:10' }, { double: true });
    await page.reload();
    form = await edit(page, nextName);
    assert.equal(await field(form, 'Ngày bắt đầu').inputValue(), future.startDate);
    assert.equal(await field(form, 'Ngày kết thúc').inputValue(), '2026-11-30T17:31:10');
    assert.equal(await field(form, 'Mục tiêu sprint').inputValue(), '');
    await button(form, 'Hủy').click();

    form = await edit(page, active.sprintName);
    assert.equal(await field(form, 'Ngày bắt đầu').count(), 0);
    assert.equal(await button(group(page, active.sprintName), 'Xóa sprint').count(), 0);
    await field(form, 'Tên sprint').fill('UI Active đã sửa');
    await verifyPatch(page, form, active.sprintId, { sprintName: 'UI Active đã sửa' });
    await page.goto(`${project}/board?boardId=${fixture.boardId}&sprintId=${active.sprintId}`);
    await page.getByRole('option', { name: /UI Active đã sửa/ }).waitFor({ state: 'attached' });
    await page.goto(backlogUrl);

    await button(group(page, nextName), 'Xóa sprint').click();
    const deleting = dialog(page, 'Xóa sprint');
    await deleting.getByText(/Công việc được giữ lại/).waitFor();
    await button(deleting, 'Hủy').click();
    await button(group(page, nextName), 'Xóa sprint').click();
    const removed = page.waitForResponse((response) => response.url() === endpoint(future.sprintId) && response.request().method() === 'DELETE');
    await button(deleting, 'Xác nhận xóa sprint').click();
    assert.equal((await removed).status(), 204);
    await deleting.waitFor({ state: 'hidden' });
    await group(page, 'Backlog').getByRole('button', { name: new RegExp(browserIssue.issueKey) }).first().waitFor();
    await page.reload();
    await group(page, 'Backlog').getByRole('button', { name: new RegExp(browserIssue.issueKey) }).first().waitFor();
    assert.equal(await group(page, nextName).count(), 0);
    await page.goto(`${project}/board?boardId=${fixture.boardId}&sprintId=${future.sprintId}`);
    await page.getByText(/Board\/sprint không tồn tại/).waitFor();
    await page.goto(`${project}/reports?sprintId=${future.sprintId}`);
    await page.getByText(/Sprint trên URL không khả dụng/).waitFor();
    await page.goto(backlogUrl);

    await button(group(page, 'UI Active đã sửa'), 'Hoàn tất sprint').click();
    const complete = dialog(page, 'Hoàn tất UI Active đã sửa');
    await button(complete, 'Hoàn tất sprint').click();
    await complete.waitFor({ state: 'hidden' });
    assert.equal(await group(page, 'UI Active đã sửa').count(), 0);
    const newName = `UI sprint ${Date.now()}`;
    await button(page, 'Tạo sprint').click();
    const create = dialog(page, 'Tạo sprint mới');
    await field(create, 'Tên sprint').fill(newName);
    await button(create, 'Tạo sprint').click();
    await create.waitFor({ state: 'hidden' });
    await button(group(page, 'Backlog'), `Thao tác ${browserIssue.issueKey}`).click();
    await page.getByRole('menuitem', { name: `Chuyển tới ${newName}`, exact: true }).click();
    await group(page, newName).getByRole('button', { name: new RegExp(browserIssue.issueKey) }).first().waitFor();
    await button(group(page, newName), 'Bắt đầu sprint').click();
    await button(group(page, newName), 'Hoàn tất sprint').waitFor();
    await page.goto(`${project}/board?boardId=${fixture.boardId}`);
    await button(page, `Thao tác ${browserIssue.issueKey}`).waitFor();
    await page.goto(backlogUrl);

    await checkGateFailure(page);
    await checkLostResponse(page);
    await checkActorSwitch(page, context);
    await checkLateCompletion(page, context);
    assert.deepEqual(errors, []);
    console.log('Chromium production OK: FUTURE edit/F5 and delete/issue retained, ACTIVE metadata, deleted sprint URL, create/move/start/complete and board card, double submit, gate503/retry, lost response, queued and late actor change.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
