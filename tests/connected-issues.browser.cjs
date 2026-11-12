const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const credentials = JSON.parse(fs.readFileSync(process.env.CONNECTED_CREDENTIALS,'utf8'));
const base = process.env.CONNECTED_URL || 'http://127.0.0.1:3130';
const output = process.env.CONNECTED_OUTPUT || path.join(process.cwd(),'.next-connected-build','issue-evidence');
const backend = process.env.CONNECTED_BACKEND || 'http://127.0.0.1:8080/api';
fs.mkdirSync(output,{recursive:true});
const passed=[]; const check=(text)=>{ passed.push(text); console.log('PASS: '+text); };
const shop=credentials.projects.find((p)=>p.key==='SHOP');
const admin=credentials.users.find((u)=>u.role==='SYSTEM_ADMIN');
const dev=credentials.users.find((u)=>u.role==='DEVELOPER');
const tag='E2E'+Date.now().toString(36).toUpperCase();
async function assertEventually(check) {
  let last;
  for(let n=0;n<100;n++){try {await check();return;} catch(e){last=e;} await new Promise((r)=>setTimeout(r,100));}
  throw last;
}

/** Chỉ chạy với DB demo đã cấu hình. Setup workflow qua API admin thật; token chỉ nằm trong tiến trình, không ghi log/file. */
async function prepare() {
  const pair=await fetch(backend+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password:credentials.password})}).then((r)=>r.json());
  assert.ok(pair.token);
  const api=async(route,method='GET',body)=>{
    const r=await fetch(backend+'/'+route,{method,headers:{Authorization:'Bearer '+pair.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    assert.ok(r.ok,'setup '+route+' '+r.status); const s=await r.text();return s?JSON.parse(s):null;
  };
  async function cleanup(keyword='E2E') {
    const found=await api(`projects/${shop.id}/issues/search?keyword=${encodeURIComponent(keyword)}&size=100`);
    for(const i of found.items.filter((i)=>/^E2E[A-Z0-9]+ /.test(i.summary))) await api(`issues/${i.issueId}?expectedVersion=${i.version}`,'DELETE');
  }
  await cleanup();
  const statuses=await api('issue-statuses');
  const todo=statuses.find((s)=>s.statusCategory==='TO_DO'); assert.ok(todo);
  const progress=statuses.find((s)=>s.statusCategory==='IN_PROGRESS') || await api('issue-statuses','POST',{statusName:'Đang thực hiện',statusCategory:'IN_PROGRESS'});
  const done=statuses.find((s)=>s.statusCategory==='DONE') || await api('issue-statuses','POST',{statusName:'Đã nghiệm thu',statusCategory:'DONE'});
  const rules=await api('workflows/rules');
  for(const [from,to] of [[todo,progress],[progress,done],[done,todo]]) {
    // DTO rule có thể đổi tên trường; API conflict409 cũng xác nhận quy tắc đã tồn tại.
    if(!rules.some((r)=>r.fromStatusId===from.statusId && r.toStatusId===to.statusId)) {
      const r=await fetch(backend+'/workflows/rules',{method:'POST',headers:{Authorization:'Bearer '+pair.token,'Content-Type':'application/json'},body:JSON.stringify({fromStatusId:from.statusId,toStatusId:to.statusId})});
      assert.ok(r.ok || r.status===409,'setup workflow '+r.status);
    }
  }
  return {todo,progress,done,cleanup};
}

async function request(page,route,method='GET',data) {
  return page.evaluate(async({route,method,data})=>{
    const r=await fetch('/api/backend/'+route,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
    const text=await r.text();return {status:r.status,data:text?JSON.parse(text):null};
  },{route,method,data});
}
async function login(page,user) {
  await page.goto(base+'/app/sign-in'); await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(credentials.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');
  await page.getByRole('heading',{name:'Dự án',exact:true}).waitFor();
}
const ok=(r)=>{assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.data;};

(async()=>{
  const workflow=await prepare();
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  const errors=[];
  let page;
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',(e)=>errors.push(e.message));
    await login(page,admin);await page.goto(base+`/app/projects/${shop.id}/issues`);
    await page.getByRole('heading',{name:'Công việc',exact:true}).waitFor();
    await page.getByRole('button',{name:'Tạo công việc',exact:true}).click();
    const modal=page.getByRole('dialog');await modal.getByLabel(/^Tên công việc/).fill(tag+' Thanh toán giỏ hàng');
    await modal.getByLabel(/^Mô tả/).fill('Kiểm tra lưu dữ liệu thật từ giao diện.');
    await modal.getByLabel(/^Ưu tiên/).selectOption('HIGH');
    let creates=0;page.on('request',(r)=>{if(r.method()==='POST' && r.url().endsWith('/api/backend/issues')) creates++;});
    await modal.locator('form').evaluate((f)=>{f.requestSubmit();f.requestSubmit();});
    await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(creates,1);
    let list=ok(await request(page,`projects/${shop.id}/issues/search?keyword=${tag}`));assert.equal(list.totalItems,1);
    let issue=list.items[0];assert.equal(issue.reporterId,admin.id);
    await page.reload();await page.getByRole('button',{name:issue.issueKey,exact:true}).click();
    const panel=page.getByRole('dialog');
    await panel.getByLabel(/^Tên công việc/).fill(tag+' Thanh toán đã sửa');
    await panel.getByLabel(/^Story points/).fill('8');
    await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await page.getByText('Đã lưu công việc',{exact:true}).waitFor();
    issue=ok(await request(page,`issues/${issue.issueId}`));assert.equal(issue.storyPoints,8);assert.equal(issue.summary,tag+' Thanh toán đã sửa');
    check('create double submit sends one request; detail metadata persists through API and reload');
    await panel.getByLabel('Người phụ trách',{exact:true}).selectOption(String(dev.id));
    await panel.getByRole('button',{name:'Lưu phân công',exact:true}).click();await page.getByText('Đã cập nhật người phụ trách',{exact:true}).waitFor();
    assert.equal(ok(await request(page,`issues/${issue.issueId}`)).assigneeId,dev.id);
    await panel.getByLabel('Chuyển trạng thái',{exact:true}).selectOption(String(workflow.progress.statusId));
    await panel.getByRole('button',{name:'Đổi trạng thái',exact:true}).click();await page.getByText('Đã đổi trạng thái',{exact:true}).waitFor();
    assert.equal(ok(await request(page,`issues/${issue.issueId}`)).statusId,workflow.progress.statusId);
    // Form sạch nhận refetch mới, dirty giữ draft khi mạng lỗi và không bị mất vì nhánh error.
    const fresh=ok(await request(page,`issues/${issue.issueId}`));
    ok(await request(page,`issues/${issue.issueId}`,'PUT',{summary:fresh.summary,description:'Mô tả do lượt khác cập nhật',priority:'HIGH',storyPoints:9}));
    await panel.getByRole('button',{name:'Tải lại công việc',exact:true}).click();
    await assertEventually(async()=>assert.equal(await panel.getByLabel(/^Story points/).inputValue(),'9'));
    assert.ok(await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).isDisabled());
    await panel.getByLabel(/^Mô tả/).fill('Bản nháp phải được giữ khi refetch lỗi');
    await page.route(`**/api/backend/issues/${issue.issueId}`,async(route)=>{
      if(route.request().method()==='GET') await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Mạng thử nghiệm tạm ngắt'})}); else await route.continue();
    });
    await panel.getByRole('button',{name:'Tải lại công việc',exact:true}).click();await panel.getByText(/Bản nháp được giữ lại/).waitFor();
    assert.equal(await panel.getByLabel(/^Mô tả/).inputValue(),'Bản nháp phải được giữ khi refetch lỗi');
    await page.unroute(`**/api/backend/issues/${issue.issueId}`);
    await panel.getByRole('button',{name:'Tải lại dữ liệu',exact:true}).click();await panel.getByRole('button',{name:'Hủy thay đổi',exact:true}).click();
    assert.equal(await panel.getByLabel(/^Mô tả/).inputValue(),'Mô tả do lượt khác cập nhật');
    // Giữ request PUT để kiểm Escape/X không đóng panel giữa lúc ghi và làm bỏ refresh cache.
    let releaseSave,reachedSave;const saveGate=new Promise((r)=>releaseSave=r);const reached=new Promise((r)=>reachedSave=r);
    await page.route(`**/api/backend/issues/${issue.issueId}`,async(route)=>{if(route.request().method()==='PUT'){reachedSave();await saveGate;}await route.continue();});
    await panel.getByLabel(/^Story points/).fill('8');await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await reached;
    await page.keyboard.press('Escape');await panel.getByRole('button',{name:'Đóng',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),1);
    releaseSave();await assertEventually(async()=>assert.ok(await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).isDisabled()));
    await page.unroute(`**/api/backend/issues/${issue.issueId}`);
    check('background refetch updates clean form; dirty draft survives network failure; Escape/X cannot interrupt pending save');
    // Một client khác ghi C sau PUT B nhưng trước GET refresh; completion phải dùng C thay vì chép B trở lại.
    let raceOnce=true;
    await page.route(`**/api/backend/issues/${issue.issueId}`,async(route)=>{
      if(route.request().method()==='PUT' && raceOnce){
        raceOnce=false;const response=await route.fetch();const b=await response.json();
        const c=await request(page,`issues/${issue.issueId}`,'PUT',{summary:b.summary,description:b.description,priority:b.priority,storyPoints:21});
        assert.equal(c.status,200,'second browser client mutation');await route.fulfill({response});
      }else await route.continue();
    });
    await panel.getByLabel(/^Story points/).fill('13');await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await assertEventually(async()=>{assert.equal(await panel.getByLabel(/^Story points/).inputValue(),'21');assert.ok(await panel.getByRole('button',{name:'Lưu thay đổi',exact:true}).isDisabled());});
    await page.unroute(`**/api/backend/issues/${issue.issueId}`);
    check('completion keeps the newer snapshot written by a second client before refetch');
    await page.screenshot({path:path.join(output,'issue-detail-desktop.png'),fullPage:true});
    await panel.getByRole('button',{name:'Đóng',exact:true}).click();
    check('assignment uses project member ID; workflow transition updates real status');

    // Tạo đủ 2 trang qua cùng BFF thật; cleanup chỉ xóa issue mang tag của lượt test này.
    const types=ok(await request(page,`projects/${shop.id}/issue-types`));assert.ok(types.length);
    for(let n=0;n<11;n++) ok(await request(page,'issues','POST',{projectId:shop.id,issueTypeId:types[0].issueTypeId,summary:tag+' Kiểm thử '+String(n).padStart(2,'0'),priority:'MEDIUM'}));
    await page.reload();await page.getByLabel('Tìm công việc',{exact:true}).fill(tag);await page.getByLabel('Số dòng mỗi trang').selectOption('10');
    await page.getByText('1–10 / 12 kết quả',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Trang sau',exact:true}).click();await page.getByText('11–12 / 12 kết quả',{exact:true}).waitFor();
    await page.getByLabel('Lọc người phụ trách').selectOption(String(dev.id));await page.getByText('1–1 / 1 kết quả',{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,'issues-filtered.png'),fullPage:true});
    assert.equal((await request(page,`projects/${shop.id}/issues/search?size=0`)).status,400);
    check('server search/filter/pagination counts match real rows; filter resets page and invalid size is rejected');

    const snapshot=ok(await request(page,`projects/${shop.id}/backlog`));
    const extra=ok(await request(page,'issues','POST',{projectId:shop.id,issueTypeId:types[0].issueTypeId,summary:tag+' Kiểm tra scope thay đổi',priority:'MEDIUM'}));
    assert.equal((await request(page,`projects/${shop.id}/backlog/order`,'PUT',{issueIds:snapshot.map((i)=>i.issueId)})).status,409);
    assert.ok(ok(await request(page,`projects/${shop.id}/backlog`)).some((i)=>i.issueId===extra.issueId));
    ok(await request(page,`issues/${extra.issueId}?expectedVersion=${extra.version}`,'DELETE'));
    check('incomplete rank snapshot returns409 after another create and does not discard new issue');

    await page.goto(base+`/app/projects/${shop.id}/backlog`);await page.getByRole('heading',{name:'Backlog',exact:true}).waitFor();
    const backlog=page.getByRole('region',{name:'Backlog',exact:true});
    const before=ok(await request(page,`projects/${shop.id}/backlog`));assert.ok(before.length>1);
    const handle=backlog.getByRole('button',{name:`Sắp xếp ${before[0].issueKey}`,exact:true});
    await handle.focus();await handle.press('Space');await handle.press('ArrowDown');
    const reordered=page.waitForResponse((r)=>r.request().method()==='PUT'&&r.url().endsWith(`/projects/${shop.id}/backlog/order`));
    await handle.press('Space');assert.equal((await reordered).status(),200);
    let after=ok(await request(page,`projects/${shop.id}/backlog`));assert.equal(after[1].issueId,before[0].issueId);
    await page.reload();await page.getByRole('heading',{name:'Backlog',exact:true}).waitFor();
    after=ok(await request(page,`projects/${shop.id}/backlog`));assert.equal(after[1].issueId,before[0].issueId);
    await page.getByLabel('Tìm công việc',{exact:true}).fill(tag);
    assert.equal(await backlog.locator(`[aria-label="Sắp xếp ${issue.issueKey}"]`).getAttribute('data-rfd-drag-handle-draggable-id'),null);
    await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();
    check('keyboard drag writes full-scope rank; F5 preserves order and filtering disables reorder');

    await backlog.getByRole('button',{name:new RegExp(issue.issueKey+' ')}).click();
    const backlogPanel=page.getByRole('dialog');await backlogPanel.getByLabel(/^Mô tả/).fill('Draft backlog còn nguyên khi reference đổi');
    await page.route(`**/api/backend/projects/${shop.id}/members`,async(route)=>{const response=await route.fetch();const members=await response.json();await route.fulfill({response,json:members.map((m)=>({...m,fullName:(m.fullName||m.userName)+' tham chiếu mới'}))});});
    const refsChanged=page.waitForResponse((r)=>r.url().endsWith(`/projects/${shop.id}/members`));
    await backlogPanel.getByRole('button',{name:'Tải lại công việc',exact:true}).click();await refsChanged;
    await assertEventually(async()=>assert.equal(await page.getByRole('dialog').getByLabel(/^Mô tả/).inputValue(),'Draft backlog còn nguyên khi reference đổi'));
    await page.unroute(`**/api/backend/projects/${shop.id}/members`);await backlogPanel.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('button',{name:'Tạo sprint',exact:true}).click();
    await page.route(`**/api/backend/projects/${shop.id}/backlog`,(route)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi đọc thử nghiệm'})}));
    // Kích refetch nền khi modal đang mở; thao tác đóng vẫn phải dùng được trong trạng thái chỉ khóa ghi.
    await page.locator('button').filter({hasText:/^Tải lại$/}).evaluate((button)=>button.click());
    await page.getByRole('dialog').getByText('Dữ liệu chưa tải được. Đóng hộp thoại và thử tải lại.',{exact:true}).waitFor();
    assert.ok(await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).isEnabled());
    await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).click();
    await page.unroute(`**/api/backend/projects/${shop.id}/backlog`);await page.getByRole('button',{name:'Tải lại',exact:true}).click();
    await assertEventually(async()=>assert.ok(await page.getByRole('button',{name:'Tạo sprint',exact:true}).isEnabled()));
    check('reference changes retain backlog draft; failed background reads disable submit while Cancel remains usable');

    await page.getByRole('button',{name:'Tạo sprint',exact:true}).click();
    await page.getByRole('dialog').getByLabel(/^Tên sprint/).fill(tag+' Sprint');
    await page.getByRole('dialog').getByRole('button',{name:'Tạo sprint',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const sprint=ok(await request(page,`sprints/project/${shop.id}`)).find((s)=>s.sprintName===tag+' Sprint');assert.ok(sprint);
    await backlog.getByRole('button',{name:`Thao tác ${issue.issueKey}`,exact:true}).click();
    await page.getByRole('menuitem',{name:'Chuyển tới '+sprint.sprintName,exact:true}).click();
    await page.getByRole('region',{name:sprint.sprintName,exact:true}).getByRole('button',{name:new RegExp(issue.issueKey+' ')}).waitFor();
    assert.ok(ok(await request(page,`sprints/${sprint.sprintId}/issues`)).some((i)=>i.issueId===issue.issueId));
    assert.ok(!ok(await request(page,`projects/${shop.id}/backlog`)).some((i)=>i.issueId===issue.issueId));
    await page.screenshot({path:path.join(output,'backlog-desktop.png'),fullPage:true});
    const sprintRegion=page.getByRole('region',{name:sprint.sprintName,exact:true});
    await sprintRegion.getByRole('button',{name:'Bắt đầu sprint',exact:true}).click();
    await sprintRegion.getByRole('button',{name:'Hoàn tất sprint',exact:true}).waitFor();
    await sprintRegion.getByRole('button',{name:'Hoàn tất sprint',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Hoàn tất sprint',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(ok(await request(page,`sprints/project/${shop.id}`)).find((s)=>s.sprintId===sprint.sprintId).state,'CLOSED');
    assert.ok(ok(await request(page,`projects/${shop.id}/backlog`)).some((i)=>i.issueId===issue.issueId));
    check('create sprint → move issue → start → complete returns unfinished issue to product backlog');

    const old=ok(await request(page,`issues/${issue.issueId}`));
    ok(await request(page,`issues/${issue.issueId}`,'PUT',{summary:old.summary,priority:'HIGH',storyPoints:13}));
    assert.equal((await request(page,`issues/${issue.issueId}?expectedVersion=${old.version}`,'DELETE')).status,409);
    assert.equal((await request(page,`issues/${issue.issueId}`)).status,200);
    check('stale expectedVersion delete returns409 and retains issue');

    await page.goto(base+`/app/projects/${shop.id}/issues`);await page.getByRole('button',{name:issue.issueKey,exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Xóa công việc',exact:true}).click();
    const confirm=page.getByRole('dialog',{name:`Xóa ${issue.issueKey}?`,exact:true});
    assert.ok(await confirm.getByRole('button',{name:'Xác nhận xóa',exact:true}).isDisabled());
    await confirm.getByLabel(new RegExp('^Nhập '+issue.issueKey)).fill(issue.issueKey);
    await confirm.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal((await request(page,`issues/${issue.issueId}`)).status,404);
    check('typed-key/version delete succeeds only after explicit confirmation');

    const devContext=await browser.newContext({viewport:{width:390,height:844}});const dp=await devContext.newPage();
    await login(dp,dev);await dp.goto(base+`/app/projects/${shop.id}/backlog`);await dp.getByRole('heading',{name:'Backlog',exact:true}).waitFor();
    const permissions=ok(await request(dp,`account/context?projectId=${shop.id}`)).projectPermissions;
    assert.equal(await dp.getByRole('button',{name:'Tạo sprint',exact:true}).isDisabled(),!permissions.includes('MANAGE_SPRINT'));
    if(!permissions.includes('MANAGE_SPRINT')) assert.equal((await request(dp,'sprints','POST',{projectId:shop.id,sprintName:'Forbidden'})).status,403);
    assert.ok(await dp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await dp.screenshot({path:path.join(output,'backlog-mobile.png'),fullPage:true});
    const portal=credentials.projects.find((p)=>p.key==='PORTAL');await dp.goto(base+`/app/projects/${portal.id}/issues`);
    await dp.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();
    assert.equal((await request(dp,`projects/${portal.id}/backlog`)).status,403);
    const outsiderContext=await browser.newContext();const op=await outsiderContext.newPage();
    await login(op,credentials.users.find((u)=>!u.role));
    assert.equal((await request(op,`projects/${shop.id}/issues/search`)).status,403);
    assert.equal((await request(op,'issues','POST',{projectId:shop.id,issueTypeId:types[0].issueTypeId,summary:'Forbidden',priority:'MEDIUM'})).status,403);
    check('developer sprint capability matches context; outsider and cross-project calls stay403; mobile has no overflow');

    // Sau đổi phiên ở tab khác, query và form của actor trước phải biến mất; không được tạo bằng draft cũ.
    await page.getByRole('button',{name:'Tạo công việc',exact:true}).click();await page.getByRole('dialog').getByLabel(/^Tên công việc/).fill(tag+' Draft cũ');
    const other=await context.newPage();await login(other,credentials.users.find((u)=>!u.role));
    await page.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
    check('another-tab account change clears issue draft and authorized project data');
    assert.deepEqual(errors,[]);check('no uncaught browser errors');
    await workflow.cleanup(tag);check('cleanup removes only issues created by this test');
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({count:passed.length,passed,base,tag},null,2));
    await outsiderContext.close();await devContext.close();await context.close();
  } catch(e) {
    if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error('Failure URL:',page.url());console.error((await page.locator('body').innerText()).slice(0,2600));}
    throw e;
  } finally {await browser.close();}
})().catch((e)=>{console.error(e);process.exitCode=1;});
