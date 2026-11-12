const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(readFileSync(process.env.COLUMN_ORDER_CREDENTIALS, 'utf8'));
const { origin, projectId, test } = fixture;
const { boardId } = test.board;
const project = `${origin}/app/projects/${projectId}`;
const url = `${project}/board?boardId=${boardId}&sprintId=${test.sprint.sprintId}`;
const api = `${origin}/api/backend/boards/${boardId}`;
const orderUrl = `${api}/columns/order`;
const header = 'X-Expected-Column-Order';
const button = (root, name) => root.getByRole('button', { name, exact: true });
const config = (page) => page.getByRole('dialog', { name: 'Cấu hình board', exact: true });
const editor = (page) => config(page).getByRole('region', { name: 'Thứ tự cột', exact: true });
const items = (page) => editor(page).getByRole('listitem');

async function login(page, credentials) {
  await page.goto(`${origin}/app/sign-in?returnTo=${encodeURIComponent(new URL(url).pathname)}`);
  await page.getByLabel(/^Email/).fill(credentials.email);
  await page.getByLabel(/^Mật khẩu/).fill(credentials.password);
  await button(page, 'Đăng nhập').click();
  await page.waitForURL(new URL(url).origin + new URL(url).pathname);
  await page.goto(url);
}

async function board(page) {
  const response = await page.request.get(api);
  assert.equal(response.status(), 200);
  return response.json();
}

async function cards(page) {
  const response = await page.request.get(`${api}/issues`);
  assert.equal(response.status(), 200);
  return (await response.json()).sort((a, b) => a.issue.issueId - b.issue.issueId);
}

async function openOrder(page) {
  await button(page, 'Cấu hình board').click();
  await button(editor(page), 'Đổi thứ tự cột').click();
  await items(page).first().waitFor();
}

async function moveFirstRight(page, name) {
  const firstLeft = button(editor(page), `Sang trái ${name}`);
  assert.ok(await firstLeft.isDisabled());
  await button(editor(page), `Sang phải ${name}`).press('Enter');
}

async function savedOrder(page, expected) {
  const headings = page.getByRole('region', { name: /^Cột / }).getByRole('heading', { level: 2 });
  await headings.last().waitFor();
  assert.deepEqual(await headings.allTextContents(), expected.map((column) => column.columnName));
}

async function refocus(page) {
  await page.evaluate(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
}

async function gateFailure(page) {
  const current = await board(page);
  await openOrder(page);
  await moveFirstRight(page, current.columns[0].columnName);
  const draft = await items(page).allTextContents();
  const contextUrl = `${origin}/api/backend/account/context?projectId=${projectId}`;
  await page.route(contextUrl, (route) => route.fulfill({ status: 503, json: { message: 'Gate tạm lỗi.' } }), { times: 1 });
  const failed = page.waitForResponse((response) => response.url() === contextUrl && response.status() === 503);
  await refocus(page);
  await failed;
  const reload = button(editor(page), 'Tải thứ tự mới');
  await reload.waitFor();
  assert.ok(await button(editor(page), 'Lưu thứ tự').isDisabled());
  assert.deepEqual(await items(page).allTextContents(), draft);
  await reload.click();
  await reload.waitFor({ state: 'hidden' });
  assert.deepEqual(await items(page).allTextContents(), current.columns.map((column) => column.columnName));
  await button(config(page), 'Đóng').last().click();
}

async function lostResponse(page) {
  const current = await board(page);
  await openOrder(page);
  await moveFirstRight(page, current.columns[0].columnName);
  let writes = 0;
  await page.route(orderUrl, async (route) => {
    writes++;
    assert.equal((await route.fetch()).status(), 200);
    await route.abort('failed');
  }, { times: 1 });
  await button(editor(page), 'Lưu thứ tự').click();
  await editor(page).getByText(/Chưa xác nhận được kết quả/).waitFor();
  assert.equal(await items(page).count(), 3);
  assert.ok(await button(editor(page), 'Lưu thứ tự').isDisabled());
  await button(config(page), 'Đóng').last().click();
  await button(page, 'Cấu hình board').click();
  assert.ok(await button(editor(page), 'Đổi thứ tự cột').isDisabled());
  assert.equal(writes, 1);
  await page.reload();
  const latest = await board(page);
  assert.deepEqual(latest.columns.map((column) => column.columnId), [current.columns[1], current.columns[0], current.columns[2]].map((column) => column.columnId));
  await savedOrder(page, latest.columns);
}

async function switchActor(page, context, late) {
  await login(page, fixture.pm);
  const current = await board(page);
  await openOrder(page);
  await moveFirstRight(page, current.columns[0].columnName);
  const other = await context.newPage();
  const held = Promise.withResolvers();
  const release = Promise.withResolvers();
  let writes = 0;
  const track = (request) => { if (request.url() === orderUrl && request.method() === 'PUT') writes++; };
  page.on('request', track);
  try {
    await other.goto(`${origin}/app/projects`);
    await button(other, 'Đăng xuất').waitFor();
    if (late) {
      await page.route(orderUrl, async (route) => {
        try {
          const response = await route.fetch();
          held.resolve(response.status());
          await release.promise;
          await route.fulfill({ response }).catch(() => {});
        } catch (error) { held.reject(error); }
      }, { times: 1 });
    } else {
      await page.evaluate(() => new Promise((ready) => {
        void navigator.locks.request('jira-connected-session', () => new Promise((unlock) => {
          window.unlockColumnTest = unlock;
          ready();
        }));
      }));
    }
    await button(editor(page), 'Lưu thứ tự').click();
    await button(editor(page), 'Đang xử lý thứ tự…').waitFor();
    assert.ok(await button(config(page), 'Đóng').last().isDisabled());
    await page.keyboard.press('Escape');
    assert.ok(await config(page).isVisible());
    if (late) assert.equal(await held.promise, 200);
    const switched = await other.request.post(`${origin}/api/backend/auth/login`, { data: fixture.dev, headers: { Origin: origin } });
    assert.equal(switched.status(), 200);
    await other.evaluate(() => {
      const channel = new BroadcastChannel('jira-connected-session');
      channel.postMessage({ type: 'changed', source: 'column-order-test' });
      channel.close();
    });
    await config(page).waitFor({ state: 'hidden' });
    release.resolve();
    await page.evaluate(() => window.unlockColumnTest?.());
    const latest = await board(page);
    await savedOrder(page, latest.columns);
    assert.equal(await button(page, 'Cấu hình board').count(), 0);
    assert.equal(writes, late ? 1 : 0);
    assert.equal(latest.columnOrderToken === current.columnOrderToken, !late);
  } finally {
    release.resolve();
    await page.evaluate(() => window.unlockColumnTest?.()).catch(() => {});
    page.off('request', track);
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
    const initial = await board(page);
    const originalCards = await cards(page);
    await savedOrder(page, initial.columns);
    await openOrder(page);
    assert.ok(await button(editor(page), `Sang phải ${initial.columns.at(-1).columnName}`).isDisabled());
    await moveFirstRight(page, initial.columns[0].columnName);
    await button(editor(page), `Sang trái ${initial.columns[0].columnName}`).press('Enter');
    assert.deepEqual(await items(page).allTextContents(), initial.columns.map((column) => column.columnName));
    await moveFirstRight(page, initial.columns[0].columnName);
    await button(editor(page), 'Hủy đổi thứ tự').click();
    assert.equal((await board(page)).columnOrderToken, initial.columnOrderToken);
    await button(config(page), 'Đóng').last().click();

    await openOrder(page);
    await moveFirstRight(page, initial.columns[0].columnName);
    let saves = 0;
    const track = (request) => { if (request.url() === orderUrl && request.method() === 'PUT') saves++; };
    page.on('request', track);
    const response = page.waitForResponse((value) => value.url() === orderUrl && value.request().method() === 'PUT');
    await button(editor(page), 'Lưu thứ tự').dblclick();
    const saved = await response;
    assert.equal(saved.status(), 200);
    assert.equal(saved.request().headers()[header.toLowerCase()], initial.columnOrderToken);
    const expected = [initial.columns[1], initial.columns[0], initial.columns[2]];
    assert.deepEqual(saved.request().postDataJSON(), expected.map((column, position) => ({ columnId: column.columnId, position })));
    await editor(page).getByText('Đã lưu thứ tự cột.', { exact: true }).waitFor();
    page.off('request', track);
    assert.equal(saves, 1);
    await button(config(page), 'Đóng').last().click();
    assert.equal(page.url(), url);
    await savedOrder(page, expected);
    await page.reload();
    await savedOrder(page, expected);
    assert.deepEqual(await cards(page), originalCards);
    const latest = await board(page);
    const metadata = (columns) => columns.map(({ position, ...column }) => column).sort((a, b) => a.columnId - b.columnId);
    assert.deepEqual(metadata(latest.columns), metadata(initial.columns));

    await openOrder(page);
    await moveFirstRight(page, latest.columns[0].columnName);
    const draft = await items(page).allTextContents();
    const movedByPeer = await page.request.put(orderUrl, { headers: { Origin: origin, [header]: latest.columnOrderToken },
      data: [...latest.columns].reverse().map((column, position) => ({ columnId: column.columnId, position })) });
    assert.equal(movedByPeer.status(), 200);
    const stale = page.waitForResponse((value) => value.url() === orderUrl && value.status() === 409);
    await button(editor(page), 'Lưu thứ tự').click();
    await stale;
    await editor(page).getByText(/Thứ tự hoặc tập cột đã thay đổi/).waitFor();
    assert.deepEqual(await items(page).allTextContents(), draft);
    assert.ok(await button(editor(page), 'Lưu thứ tự').isDisabled());
    await button(editor(page), 'Hủy đổi thứ tự').click();
    await button(editor(page), 'Tải thứ tự mới').click();
    await items(page).first().waitFor();
    assert.deepEqual(await items(page).allTextContents(), [...latest.columns].reverse().map((column) => column.columnName));
    await button(config(page), 'Đóng').last().click();

    await page.setViewportSize({ width: 390, height: 844 });
    await gateFailure(page);
    await lostResponse(page);
    await switchActor(page, context, false);
    await switchActor(page, context, true);
    await page.goto(`${project}/board?boardId=${boardId}&sprintId=${test.closed.sprintId}`);
    await page.getByText(/Đang xem sprint đã đóng/).waitFor();
    await page.goto(`${project}/reports?sprintId=${test.closed.sprintId}`);
    await page.getByRole('heading', { name: 'Báo cáo Scrum' }).waitFor();
    assert.equal(await page.getByLabel('Sprint', { exact: true }).inputValue(), String(test.closed.sprintId));
    assert.deepEqual(errors, []);
    console.log('Chromium production OK: keyboard/mobile, Cancel, one PUT, F5, unchanged cards/WIP/mapping, 409 retains draft and explicit reload, gate503, lost response, queued/late actor switch, CLOSED board/reports.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
