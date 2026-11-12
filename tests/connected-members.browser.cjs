const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(fs.readFileSync(process.env.C1_CREDENTIALS, 'utf8'));
const { origin, projectId, pm, developer, outsider, browser: candidate, roles } = fixture;
const projectUrl = origin + '/app/projects/' + projectId;
const membersUrl = projectUrl + '/members';
async function eventually(check){let last;for(let n=0;n<100;n++){try{return await check();}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}throw last;}

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
async function bff(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};},{route,method,body});}

async function count(page, expected) {
  // Browser gửi Secure cookie trên loopback HTTP như app; APIRequestContext không luôn dùng cùng quy tắc cookie này.
  const response = await page.evaluate(async (id) => {
    const result = await fetch('/api/backend/projects/' + id);
    return {status:result.status,data:await result.json()};
  },projectId);
  assert.equal(response.status, 200);
  assert.equal(response.data.memberCount, expected);
}

async function overviewCount(page, expected) {
  await page.getByRole('link', { name: 'Tổng quan', exact: true }).click();
  const card = page.locator('p').filter({ hasText: /^Thành viên$/ }).locator('..');
  await card.getByText(String(expected), { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Thành viên', exact: true }).click();
  await page.waitForURL(membersUrl);
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
    assert.equal((await bff(page,'projects/'+projectId+'/members','POST',{userId:candidate.id,roleId:roles.manager})).status,409);
    assert.equal((await bff(page,'projects/'+projectId+'/members','POST',{userId:candidate.id,roleId:roles.admin})).status,409);
    assert.equal((await bff(page,'projects/'+projectId+'/members','POST',{userId:developer.id,roleId:roles.developer})).status,409);
    const detail=await bff(page,'projects/'+projectId);
    assert.equal((await bff(page,'projects/'+projectId+'/members/'+detail.data.leader.id,'DELETE')).status,409);
    assert.deepEqual((await bff(page,'projects/'+projectId+'/members/candidates/search','POST',{email:developer.email})).data,[]);
    const exact = await bff(page, 'projects/' + projectId + '/members/candidates/search', 'POST', { email: candidate.email });
    assert.equal(exact.status, 200);
    assert.deepEqual(exact.data.map((user) => user.userId), [candidate.id]);
    console.log('PASS: direct API rejects duplicate membership, second PM, SYSTEM_ADMIN project role and removing lead');

    // E2 kiểm việc mời/accept, bấm đôi và mất response trong connected-project-invitations.browser.cjs.
    const row = membersTable(page).getByRole('row').filter({ hasText: developer.email });
    const assignedAt = await row.locator('time').getAttribute('datetime');
    const role = row.getByLabel(/^Vai trò của /);
    await role.selectOption(String(roles.scrum));
    await eventually(async () => assert.ok(await role.isEnabled()));
    await page.reload();
    assert.equal(await role.inputValue(), String(roles.scrum));
    assert.equal(await row.locator('time').getAttribute('datetime'), assignedAt);
    await role.selectOption(String(roles.developer));
    await eventually(async () => assert.ok(await role.isEnabled()));
    await overviewCount(page, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.C1_SCREENSHOT) await page.screenshot({ path: process.env.C1_SCREENSHOT, fullPage: true });
    await login(page, developer);
    await page.getByText('Bạn chỉ có quyền xem danh sách thành viên.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Mời thành viên', exact: true }).count(), 0);
    await count(page, 2);

    const second = await context.newPage();
    second.setDefaultTimeout(45000);
    await login(second, outsider);
    await second.getByText('Bạn không có quyền xem dự án này', { exact: true }).waitFor();
    await page.getByText('Bạn không có quyền xem dự án này', { exact: true }).waitFor();
    assert.equal(await membersTable(page).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Chromium OK: project nav, filter, exact lookup, role, F5/overview count/assignedAt, mobile, readonly and outsider.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
