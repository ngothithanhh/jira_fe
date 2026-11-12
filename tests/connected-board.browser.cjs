const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const credentials=JSON.parse(fs.readFileSync(process.env.CONNECTED_CREDENTIALS,'utf8'));
const base=process.env.CONNECTED_URL||'http://127.0.0.1:3130',backend=process.env.CONNECTED_BACKEND||'http://127.0.0.1:8080/api';
const output=process.env.CONNECTED_OUTPUT||path.join(process.cwd(),'.next-connected-build','board-evidence');fs.mkdirSync(output,{recursive:true});
const shop=credentials.projects.find(p=>p.key==='SHOP'),admin=credentials.users.find(u=>u.role==='SYSTEM_ADMIN');
const tag='E2EBOARD'+Date.now().toString(36).toUpperCase(),passed=[];const check=s=>{passed.push(s);console.log('PASS: '+s);};
async function eventually(fn){let err;for(let n=0;n<100;n++){try{return await fn();}catch(e){err=e;}await new Promise(r=>setTimeout(r,100));}throw err;}
async function refocus(page){await page.evaluate(async()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r=>setTimeout(r,30));
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;
});}
async function request(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};},{route,method,body});}
function ok(r){assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.data;}
async function login(page,user){await page.goto(base+'/app/sign-in');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(credentials.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');await page.getByRole('heading',{name:'Dự án',exact:true}).waitFor();}

/** Setup chỉ cấu hình workflow trên DB demo; secret chỉ nằm trong bộ nhớ, không ghi artifact. */
async function setup(){
  const pair=await fetch(backend+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password:credentials.password})}).then(r=>r.json());assert.ok(pair.token);
  const api=async(route,method='GET',body)=>{const r=await fetch(backend+'/'+route,{method,headers:{Authorization:'Bearer '+pair.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};};
  const statuses=ok(await api('issue-statuses'));const todo=statuses.find(s=>s.statusCategory==='TO_DO'),doing=statuses.find(s=>s.statusCategory==='IN_PROGRESS'),done=statuses.find(s=>s.statusCategory==='DONE');assert.ok(todo&&doing&&done);
  const qa=statuses.find(s=>s.statusName==='Đang kiểm thử')||ok(await api('issue-statuses','POST',{statusName:'Đang kiểm thử',statusCategory:'IN_PROGRESS'}));
  for(const [from,to] of [[todo,qa],[doing,qa],[qa,done]]){const r=await api('workflows/rules','POST',{fromStatusId:from.statusId,toStatusId:to.statusId});assert.ok(r.status===201||r.status===409);}
  // Dọn issue/board của các lượt board test dở, không chạm issue demo hoặc board người dùng.
  for(const i of ok(await api(`projects/${shop.id}/issues/search?keyword=E2EBOARD&size=100`)).items.filter(i=>/^E2EBOARD[A-Z0-9]+ /.test(i.summary)))ok(await api(`issues/${i.issueId}?expectedVersion=${i.version}`,'DELETE'));
  for(const b of ok(await api(`boards/project/${shop.id}`)).filter(b=>/^E2EBOARD[A-Z0-9]+ /.test(b.boardName)))ok(await api(`boards/${b.boardId}`,'DELETE'));
  for(const s of ok(await api(`sprints/project/${shop.id}`)).filter(s=>/^E2EBOARD[A-Z0-9]+ /.test(s.sprintName))){
    if(s.state==='ACTIVE')ok(await api(`sprints/${s.sprintId}/complete`,'PUT'));
    if(s.state==='FUTURE')ok(await api(`sprints/${s.sprintId}`,'DELETE'));
  }
  return {api,todo,doing,done,qa};
}
(async()=>{
  const env=await setup(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});let page;const errors=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await login(page,admin);
    const types=ok(await request(page,`projects/${shop.id}/issue-types`)),created=[];
    for(let n=1;n<=3;n++)created.push(ok(await request(page,'issues','POST',{projectId:shop.id,issueTypeId:types[0].issueTypeId,summary:tag+' Công việc '+n,priority:'MEDIUM'})));
    const sprint=ok(await request(page,'sprints','POST',{projectId:shop.id,sprintName:tag+' Sprint'}));
    for(const i of created.slice(0,2))ok(await request(page,`sprints/${sprint.sprintId}/issues/${i.issueId}`,'POST'));
    await page.goto(base+`/app/projects/${shop.id}/board`);await page.getByRole('button',{name:'Tạo board',exact:true}).click();
    await page.getByRole('dialog').getByLabel(/^Tên board/).fill(tag+' Board');await page.getByRole('dialog').getByRole('button',{name:'Tạo board',exact:true}).click();
    await page.getByRole('dialog',{name:'Cấu hình board',exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).last().click();
    await page.getByText('Chưa có sprint đang diễn ra',{exact:true}).waitFor();
    const board=ok(await request(page,`boards/project/${shop.id}`)).find(b=>b.boardName===tag+' Board');assert.ok(board);
    ok(await request(page,`sprints/${sprint.sprintId}/start`,'PUT'));await page.getByRole('button',{name:'Tải lại danh sách',exact:true}).click();
    await page.getByRole('region',{name:'Chưa phân cột',exact:true}).waitFor();assert.equal(await page.locator('article').count(),0);
    check('create real Scrum board; no ACTIVE sprint shows guidance; unmapped sprint cards stay visible');
    await page.getByRole('button',{name:'Cấu hình board',exact:true}).click();
    const config=page.getByRole('dialog',{name:'Cấu hình board',exact:true});
    for(const [column,status] of [['To Do',env.todo],['In Progress',env.doing],['Done',env.done],['In Progress',env.qa]]){
      const section=config.getByRole('region',{name:'Cấu hình cột '+column,exact:true});
      await section.getByLabel('Trạng thái cần ánh xạ',{exact:true}).selectOption(String(status.statusId));await section.getByRole('button',{name:'Ánh xạ',exact:true}).click();await section.getByRole('button',{name:'Gỡ ánh xạ '+status.statusId,exact:true}).waitFor();
    }
    await config.getByLabel(/^Tên cột mới/).fill('Cột tạm');await config.getByRole('button',{name:'Thêm cột',exact:true}).click();
    const temp=config.getByRole('region',{name:'Cấu hình cột Cột tạm',exact:true});await temp.getByRole('button',{name:'Xóa cột',exact:true}).click();await temp.getByRole('button',{name:'Xác nhận xóa cột',exact:true}).click();await temp.waitFor({state:'hidden'});
    const globalCards=ok(await request(page,`boards/${board.boardId}/issues`));const doingColumn=ok(await request(page,`boards/${board.boardId}`)).columns.find(c=>c.columnName==='In Progress');
    const existingLoad=globalCards.filter(c=>c.columnId===doingColumn.columnId).length;
    const doingSection=config.getByRole('region',{name:'Cấu hình cột In Progress',exact:true});await doingSection.getByLabel('Giới hạn WIP',{exact:true}).fill(String(existingLoad+1));await doingSection.getByRole('button',{name:'Lưu cột',exact:true}).click();
    await eventually(async()=>assert.equal(ok(await request(page,`boards/${board.boardId}`)).columns.find(c=>c.columnId===doingColumn.columnId).wipLimit,existingLoad+1));
    await config.getByRole('button',{name:'Đóng',exact:true}).last().click();await page.locator('article').first().waitFor();
    assert.equal(await page.locator('article').count(),2);assert.equal(await page.getByText(created[2].summary,{exact:true}).count(),0);
    check('configure mappings, multiple statuses, WIP, add/delete column; board shows only selected sprint');
    // Workflow còn chờ mà background card refetch lỗi: không được autocommit bằng editable của render cũ.
    let workflowReached,releaseWorkflow;
    const workflowStarted=new Promise(r=>workflowReached=r),workflowGate=new Promise(r=>releaseWorkflow=r);
    await page.route('**/api/backend/workflows/allowed-transitions?*',async(route)=>{workflowReached();await workflowGate;await route.continue();});
    let movesDuringFailure=0;
    const countMove=r=>{if(r.method()==='PUT'&&r.url().endsWith('/move'))movesDuringFailure++;};page.on('request',countMove);
    await page.getByRole('button',{name:'Thao tác '+created[0].issueKey,exact:true}).click();await page.getByRole('menuitem',{name:'Chuyển tới…',exact:true}).click();await workflowStarted;
    await page.route(`**/api/backend/boards/${board.boardId}/issues`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi tải board thử nghiệm'})}));
    await refocus(page);
    await page.getByText(/Lỗi tải board thử nghiệm/).waitFor();releaseWorkflow();
    await page.unroute('**/api/backend/workflows/allowed-transitions?*');await page.unroute(`**/api/backend/boards/${board.boardId}/issues`);
    await eventually(async()=>assert.ok(await page.getByRole('button',{name:'Tải lại board',exact:true}).isEnabled()));assert.equal(movesDuringFailure,0);page.off('request',countMove);
    await page.getByRole('button',{name:'Tải lại board',exact:true}).click();await eventually(async()=>assert.equal(await page.getByText(/Lỗi tải board thử nghiệm/).count(),0));
    check('failed background refetch during delayed workflow cannot dispatch a stale move');
    // Kiểm lại guard ở khoảng chờ auth trước PUT, không chỉ khoảng chờ workflow.
    await page.getByRole('button',{name:'Thao tác '+created[0].issueKey,exact:true}).click();await page.getByRole('menuitem',{name:'Chuyển tới…',exact:true}).click();
    const authMove=page.getByRole('dialog',{name:'Chuyển '+created[0].issueKey,exact:true});await authMove.waitFor();
    let authReached,releaseAuth;const authStarted=new Promise(r=>authReached=r),authGate=new Promise(r=>releaseAuth=r);
    let pauseAuth=true;
    await page.route('**/api/backend/auth/me',async(route)=>{if(pauseAuth){pauseAuth=false;authReached();await authGate;}await route.continue();});
    let authMoves=0;const countAuth=r=>{if(r.method()==='PUT'&&r.url().endsWith('/move'))authMoves++;};page.on('request',countAuth);
    await authMove.getByRole('button',{name:env.doing.statusName,exact:true}).click();await authStarted;
    await page.route(`**/api/backend/boards/${board.boardId}/issues`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi board khi chờ auth'})}));
    await refocus(page);await page.getByText(/Lỗi board khi chờ auth/).waitFor();releaseAuth();
    await eventually(async()=>assert.ok(await authMove.getByRole('button',{name:'Hủy',exact:true}).isEnabled()));assert.equal(authMoves,0);
    page.off('request',countAuth);await page.unroute('**/api/backend/auth/me');await page.unroute(`**/api/backend/boards/${board.boardId}/issues`);
    await authMove.getByRole('button',{name:'Hủy',exact:true}).click();await page.getByRole('button',{name:'Tải lại board',exact:true}).click();
    check('latest write guard is rechecked after delayed auth and before dispatch');

    // CreateBoard đã mở phải khóa submit khi gate project refetch lỗi, nhưng Hủy vẫn dùng được.
    await page.getByRole('button',{name:'Tạo board',exact:true}).click();await page.getByRole('dialog',{name:'Tạo Scrum board',exact:true}).getByLabel(/^Tên board/).fill(tag+' Không gửi khi gate lỗi');
    await page.route(`**/api/backend/projects/${shop.id}`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi gate thử nghiệm'})}));
    await refocus(page);await page.getByText('Lỗi gate thử nghiệm',{exact:true}).waitFor();
    const createModal=page.getByRole('dialog',{name:'Tạo Scrum board',exact:true});assert.ok(await createModal.getByRole('button',{name:'Tạo board',exact:true}).isDisabled());await createModal.getByRole('button',{name:'Hủy',exact:true}).click();
    await page.unroute(`**/api/backend/projects/${shop.id}`);await page.getByRole('button',{name:'Thử lại',exact:true}).click();await eventually(async()=>assert.equal(await page.getByText('Lỗi gate thử nghiệm',{exact:true}).count(),0));
    check('open create-board form respects gate read failure and keeps Cancel usable');

    const a=page.locator(`article[aria-label="Card ${created[0].issueKey}"]`);await a.focus();await a.press('Space');await a.press('ArrowDown');
    const reordered=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/move'));await a.press('Space');assert.equal((await reordered).status(),200);
    await page.reload();await page.locator('article').first().waitFor();assert.equal(await page.locator('article').nth(1).getAttribute('aria-label'),'Card '+created[0].issueKey);
    check('keyboard reorder translates sprint position with hidden project cards and persists after F5');
    // Kéo bằng chuột sang cột có hai status để kiểm dialog chọn đích.
    const target=page.getByRole('region',{name:'Cột In Progress',exact:true});
    const from=await a.boundingBox(),to=await target.boundingBox();await page.mouse.move(from.x+5,from.y+5);await page.mouse.down();await page.mouse.move(from.x+15,from.y+15,{steps:5});await page.mouse.move(to.x+100,to.y+100,{steps:20});await page.mouse.up();
    const move=page.getByRole('dialog',{name:'Chuyển '+created[0].issueKey,exact:true});await move.waitFor();
    await move.getByRole('button',{name:env.doing.statusName,exact:true}).click();await move.waitFor({state:'hidden'});
    assert.equal(ok(await request(page,`issues/${created[0].issueId}`)).statusId,env.doing.statusId);
    await page.getByRole('button',{name:'Thao tác '+created[1].issueKey,exact:true}).click();await page.getByRole('menuitem',{name:'Chuyển tới…',exact:true}).click();
    const second=page.getByRole('dialog',{name:'Chuyển '+created[1].issueKey,exact:true});await second.getByRole('button',{name:env.qa.statusName,exact:true}).click();
    await page.getByText(/Card\/cấu hình đã thay đổi/).first().waitFor();assert.equal(ok(await request(page,`issues/${created[1].issueId}`)).statusId,env.todo.statusId);
    await second.getByRole('button',{name:'Hủy',exact:true}).click();
    check('mouse cross-column drag asks status; WIP includes hidden project cards and rejects overflow409');
    await page.getByLabel('Tìm trên board').fill(created[0].issueKey);assert.equal(await a.getAttribute('data-rfd-drag-handle-draggable-id'),null);
    await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await page.getByRole('button',{name:'Cấu hình board',exact:true}).click();
    await doingSection.getByLabel('Giới hạn WIP',{exact:true}).fill('0');await doingSection.getByRole('button',{name:'Lưu cột',exact:true}).click();
    await eventually(async()=>assert.equal(ok(await request(page,`boards/${board.boardId}`)).columns.find(c=>c.columnId===doingColumn.columnId).wipLimit,0));await config.getByRole('button',{name:'Đóng',exact:true}).last().click();
    await page.getByRole('button',{name:'Thao tác '+created[1].issueKey,exact:true}).click();await page.getByRole('menuitem',{name:'Chuyển tới…',exact:true}).click();await second.getByRole('button',{name:env.qa.statusName,exact:true}).click();await second.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Thao tác '+created[1].issueKey,exact:true}).click();await page.getByRole('menuitem',{name:'Chuyển tới…',exact:true}).click();await second.getByRole('button',{name:env.done.statusName,exact:true}).click();await second.waitFor({state:'hidden'});
    assert.equal(ok(await request(page,`issues/${created[1].issueId}`)).statusId,env.done.statusId);
    const stale=globalCards.find(c=>c.issue.issueId===created[0].issueId);
    assert.equal((await request(page,`boards/${board.boardId}/issues/${created[0].issueId}/move`,'PUT',{columnId:doingColumn.columnId,statusId:env.doing.statusId,position:0,expectedVersion:stale.version,sprintId:sprint.sprintId})).status,409);
    check('filtered board disables drag; menu transitions use workflow; stale version cannot overwrite');
    // Cùng cột nhiều status: reorder giữ status, không mở hộp thoại chọn trạng thái.
    const currentA=ok(await request(page,`issues/${created[0].issueId}`));
    ok(await request(page,`issues/${created[1].issueId}/status?statusId=${env.todo.statusId}`,'PUT'));
    ok(await request(page,`boards/${board.boardId}/issues/${created[1].issueId}/move`,'PUT',{columnId:doingColumn.columnId,statusId:env.qa.statusId,position:0,expectedVersion:ok(await request(page,`issues/${created[1].issueId}`)).version,sprintId:sprint.sprintId}));
    await page.getByRole('button',{name:'Tải lại board',exact:true}).click();
    await eventually(async()=>assert.equal(await target.locator('article').count(),2));
    const firstDoing=target.locator('article').first();await firstDoing.focus();await firstDoing.press('Space');await firstDoing.press('ArrowDown');const sameColumn=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/move'));await firstDoing.press('Space');assert.equal((await sameColumn).status(),200);assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(ok(await request(page,`issues/${created[0].issueId}`)).statusId,currentA.statusId);
    // Trả card thứ hai về DONE cho kịch bản lịch sử phía sau.
    const currentB=ok(await request(page,`issues/${created[1].issueId}`));const doneColumn=ok(await request(page,`boards/${board.boardId}`)).columns.find(c=>c.columnName==='Done');
    ok(await request(page,`boards/${board.boardId}/issues/${created[1].issueId}/move`,'PUT',{columnId:doneColumn.columnId,statusId:env.done.statusId,position:0,expectedVersion:currentB.version,sprintId:sprint.sprintId}));
    await page.getByRole('button',{name:'Tải lại board',exact:true}).click();
    check('same-column reorder with multiple mapped statuses keeps status without asking for a transition');
    await a.getByRole('button',{name:created[0].summary,exact:true}).click();await page.getByRole('dialog').getByLabel(/^Story points/).fill('5');await page.getByRole('dialog').getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await eventually(async()=>assert.equal(ok(await request(page,`issues/${created[0].issueId}`)).storyPoints,5));await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).last().click();
    await page.screenshot({path:path.join(output,'board-desktop.png'),fullPage:true});
    ok(await request(page,`sprints/${sprint.sprintId}/complete`,'PUT'));await page.goto(base+`/app/projects/${shop.id}/board?boardId=${board.boardId}&sprintId=${sprint.sprintId}`);await page.getByText(/Đang xem sprint đã đóng/).waitFor();
    assert.equal(await page.locator('article').count(),1);assert.equal(await page.getByRole('button',{name:'Thao tác '+created[1].issueKey,exact:true}).count(),0);
    const now=ok(await request(page,`issues/${created[1].issueId}`));assert.equal((await request(page,`boards/${board.boardId}/issues/${now.issueId}/move`,'PUT',{columnId:doingColumn.columnId,statusId:env.qa.statusId,position:0,expectedVersion:now.version,sprintId:sprint.sprintId})).status,409);
    check('issue detail shares real data; CLOSED board is read-only and backend rejects fresh-version move');
    const devContext=await browser.newContext({viewport:{width:390,height:844}}),dp=await devContext.newPage();await login(dp,credentials.users.find(u=>u.role==='DEVELOPER'));await dp.goto(base+`/app/projects/${shop.id}/board?boardId=${board.boardId}&sprintId=${sprint.sprintId}`);await dp.getByText(/Đang xem sprint đã đóng/).waitFor();assert.equal(await dp.getByRole('button',{name:'Cấu hình board',exact:true}).count(),0);assert.ok(await dp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dp.screenshot({path:path.join(output,'board-mobile.png'),fullPage:true});
    assert.equal((await request(dp,`boards/${board.boardId}`,'PATCH',{boardName:'Forbidden'})).status,403);
    const portal=credentials.projects.find(p=>p.key==='PORTAL');await dp.goto(base+`/app/projects/${portal.id}/board`);await dp.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();
    check('developer cannot configure board or cross project; mobile board scrolls inside viewport');
    await page.goto(base+`/app/projects/${shop.id}/board?boardId=2147483647`);await page.getByText(/Board\/sprint không tồn tại/).waitFor();assert.equal(await page.locator('article').count(),0);
    await page.goto(base+`/app/projects/${shop.id}/board?boardId=${board.boardId}&sprintId=${sprint.sprintId}`);
    // Cookie đổi qua tab khác trong lúc config form mở: dữ liệu và form của actor cũ phải bị xóa.
    await page.getByRole('button',{name:'Cấu hình board',exact:true}).click();const other=await context.newPage();await login(other,credentials.users.find(u=>!u.role));
    await page.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal((await request(other,`boards/${board.boardId}/issues`)).status,403);
    await other.close();await login(page,admin);await page.goto(base+`/app/projects/${shop.id}/board?boardId=${board.boardId}&sprintId=${sprint.sprintId}`);
    check('unknown board never falls back; another-tab identity change clears configuration and card cache');
    await page.getByRole('button',{name:'Cấu hình board',exact:true}).click();await config.getByLabel(new RegExp('^Nhập '+tag)).fill(board.boardName);await config.getByRole('button',{name:'Xóa board',exact:true}).click();await config.waitFor({state:'hidden'});assert.equal((await request(page,`boards/${board.boardId}`)).status,404);assert.equal((await request(page,`issues/${created[0].issueId}`)).status,200);
    for(const i of created){const fresh=ok(await request(page,`issues/${i.issueId}`));ok(await request(page,`issues/${i.issueId}?expectedVersion=${fresh.version}`,'DELETE'));}
    assert.deepEqual(errors,[]);check('confirmed board delete preserves issues; test issues cleanup; no uncaught browser errors');
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({count:passed.length,passed,tag,base},null,2));await devContext.close();await context.close();
  }catch(e){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error('URL:',page.url());console.error((await page.locator('body').innerText()).slice(0,2400));}throw e;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
