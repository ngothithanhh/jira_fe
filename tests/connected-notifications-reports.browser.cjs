const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(fs.readFileSync(process.env.NR_CREDENTIALS,'utf8')),base=fixture.origin;
const output=process.env.NR_OUTPUT||path.join(process.cwd(),'.next-connected-build','nr-evidence');fs.mkdirSync(output,{recursive:true});
const passed=[];const check=s=>{passed.push(s);console.log('PASS: '+s);};
async function eventually(fn){let last;for(let i=0;i<100;i++){try{return await fn();}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}throw last;}
async function api(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};},{route,method,body});}
const ok=r=>{assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.data;};
async function login(page,user){await page.goto(base+'/app/sign-in');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(user.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');await page.getByRole('heading',{name:'Dự án',exact:true}).waitFor();}
const inbox=page=>page.getByRole('list',{name:'Hộp thư thông báo'});
const label=page=>page.getByRole('link',{name:/^Thông báo/});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});let page;const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await login(page,fixture.recipient);let count=ok(await api(page,'notifications/unread-count')).count;assert.ok(count>=3);
  await label(page).click();await page.getByRole('heading',{name:'Thông báo',exact:true}).waitFor();await inbox(page).waitFor();
  await page.getByRole('tab',{name:/^Chưa đọc/}).click();await eventually(async()=>assert.equal(await inbox(page).locator('li').count(),count));
  let sent=0;page.on('request',r=>{if(r.method()==='PUT'&&/notifications\/\d+\/read$/.test(r.url()))sent++;});
  await inbox(page).getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).first().evaluate(b=>{b.click();b.click();});
  count--;await eventually(async()=>assert.equal(ok(await api(page,'notifications/unread-count')).count,count));assert.equal(sent,1);
  await eventually(async()=>assert.equal(await inbox(page).locator('li').count(),count));await eventually(async()=>assert.equal(await label(page).getAttribute('aria-label'),'Thông báo · '+count+' chưa đọc'));
  let releaseRead,savedRead;const readGate=new Promise(r=>releaseRead=r),readCommitted=new Promise(r=>savedRead=r);
  await page.route('**/api/backend/notifications/*/read',async route=>{const response=await route.fetch();savedRead(response.status());await readGate;await route.fulfill({response});});
  await inbox(page).getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).first().click();assert.equal(await readCommitted,200);
  await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('link',{name:'Dự án',exact:true}).click();await page.waitForURL('**/app/projects');releaseRead();count--;
  await eventually(async()=>assert.equal(await label(page).getAttribute('aria-label'),'Thông báo · '+count+' chưa đọc'));await page.unroute('**/api/backend/notifications/*/read');
  await label(page).click();await page.getByRole('tab',{name:/^Chưa đọc/}).click();await eventually(async()=>assert.equal(await inbox(page).locator('li').count(),count));
  check('leaving Inbox during committed read still refreshes the persistent shell bell');
  const total=ok(await api(page,'notifications')).length;await inbox(page).getByRole('button',{name:'Xóa thông báo',exact:true}).first().click();count--;
  await eventually(async()=>assert.equal(ok(await api(page,'notifications')).length,total-1));await eventually(async()=>assert.equal(await label(page).getAttribute('aria-label'),'Thông báo · '+count+' chưa đọc'));
  await page.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true}).click();await page.getByText('Không có thông báo chưa đọc',{exact:true}).waitFor();assert.equal(ok(await api(page,'notifications/unread-count')).count,0);
  await page.reload();await page.getByRole('tab',{name:/^Chưa đọc/}).click();await page.getByText('Không có thông báo chưa đọc',{exact:true}).waitFor();
  assert.equal((await api(page,'notifications/'+fixture.otherNotificationId+'/read','PUT')).status,403);assert.equal((await api(page,'notifications/'+fixture.otherNotificationId,'DELETE')).status,403);
  check('bell/filter/read/delete/read-all stay consistent after double click and F5; foreign recipient stays403');

  await page.route('**/api/backend/notifications?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi inbox thử nghiệm'})}));
  await page.route('**/api/backend/notifications/unread-count',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi count thử nghiệm'})}));
  await page.reload();await page.getByText(/Không tải được số thông báo chưa đọc/).waitFor();await page.getByText(/Lỗi inbox thử nghiệm/).waitFor();assert.equal(await page.getByText('Hộp thư trống',{exact:true}).count(),0);assert.equal(await label(page).getAttribute('aria-label'),'Thông báo');
  await page.unroute('**/api/backend/notifications?*');await page.unroute('**/api/backend/notifications/unread-count');await page.getByRole('button',{name:'Tải lại số chưa đọc',exact:true}).click();await page.getByRole('button',{name:'Tải lại hộp thư',exact:true}).click();await page.getByRole('tab',{name:'Tất cả',exact:true}).click();await inbox(page).waitFor();
  await page.screenshot({path:path.join(output,'notifications.png'),fullPage:true});
  check('failed count/list do not invent zero or empty inbox; retry recovers');

  // Khóa phiên trước submit; cookie đổi mà chưa có BroadcastChannel thì vẫn chặn write actor cũ trước dispatch.
  await page.evaluate(()=>new Promise(ready=>{void navigator.locks.request('jira-connected-session',()=>new Promise(release=>{window.nrRelease=release;ready();}));}));
  let deletes=0;const countDelete=r=>{if(r.method()==='DELETE'&&r.url().includes('/notifications/'))deletes++;};page.on('request',countDelete);
  await inbox(page).getByRole('button',{name:'Xóa thông báo',exact:true}).first().click();await page.getByText('Đang cập nhật thông báo…',{exact:true}).waitFor();
  const switched=await context.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:fixture.other.email,password:fixture.other.password}});assert.equal(switched.status(),200);await page.evaluate(()=>window.nrRelease());
  await page.getByRole('button',{name:'Tải lại hộp thư',exact:true}).waitFor();assert.equal(deletes,0);page.off('request',countDelete);await page.reload();await inbox(page).waitFor();assert.equal(ok(await api(page,'notifications/unread-count')).count,1);
  check('queued notification write cannot dispatch under another account even before session event');

  await login(page,fixture.recipient);await label(page).click();await inbox(page).waitFor();
  let releaseResponse,committed;const gate=new Promise(r=>releaseResponse=r),saved=new Promise(r=>committed=r);
  await page.route('**/api/backend/notifications/*',async route=>{if(route.request().method()!=='DELETE')return route.continue();const response=await route.fetch();committed(response.status());await gate;await route.fulfill({response});});
  await inbox(page).getByRole('button',{name:'Xóa thông báo',exact:true}).first().click();assert.equal(await saved,204);
  const otherLogin=await context.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:fixture.other.email,password:fixture.other.password}});assert.equal(otherLogin.status(),200);releaseResponse();await page.getByText(/Thao tác đã lưu nhưng chưa xác nhận/).waitFor();
  assert.ok(await page.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true}).isDisabled());await page.unroute('**/api/backend/notifications/*');await page.reload();await inbox(page).waitFor();assert.equal(ok(await api(page,'notifications/unread-count')).count,1);
  check('late committed delete cannot update the replacement account; other inbox remains unchanged');

  const adminContext=await browser.newContext({viewport:{width:1440,height:1000}}),rp=await adminContext.newPage();rp.on('pageerror',e=>errors.push(e.message));await login(rp,fixture.admin);
  const reportUrl=base+'/app/projects/'+fixture.projectId+'/reports?sprintId='+fixture.sprintId;
  await rp.goto(reportUrl);await rp.getByRole('heading',{name:'Báo cáo Scrum',exact:true}).waitFor();
  const summary=ok(await api(rp,'sprints/'+fixture.sprintId+'/reports/summary'));
  const stat=name=>rp.locator('dt').filter({hasText:new RegExp('^'+name)}).locator('..').locator('dd').first();
  await eventually(async()=>assert.equal(await stat('Commitment lúc bắt đầu').innerText(),String(fixture.expected.commitment)));
  assert.equal(await stat('Hoàn thành khi đóng').innerText(),String(fixture.expected.completed));assert.equal(await stat('Tổng điểm').innerText(),String(summary.current.totalPoints));
  await rp.getByRole('tab',{name:'Burndown',exact:true}).click();await rp.getByRole('img',{name:/Biểu đồ bậc thang/}).waitFor();
  const burn=ok(await api(rp,'sprints/'+fixture.sprintId+'/reports/burndown'));assert.equal(await rp.locator('tbody tr').count(),burn.points.length);
  await rp.screenshot({path:path.join(output,'burndown.png'),fullPage:true});
  await rp.getByRole('tab',{name:'Velocity',exact:true}).click();await rp.getByText('Snapshot sprint đã đóng',{exact:true}).waitFor();const sprint=ok(await api(rp,'sprints/'+fixture.sprintId));const row=rp.getByRole('row').filter({hasText:sprint.sprintName});await row.waitFor();assert.equal(await row.locator('td').nth(1).innerText(),String(fixture.expected.commitment));assert.equal(await row.locator('td').nth(2).innerText(),String(fixture.expected.completed));
  const closedIssues=ok(await api(rp,'sprints/'+fixture.sprintId+'/issues'));assert.ok(closedIssues.length);
  ok(await api(rp,'issues/'+closedIssues[0].issueId,'PUT',{summary:closedIssues[0].summary,priority:'MEDIUM',storyPoints:34}));
  await rp.reload();await row.waitFor();assert.equal(await row.locator('td').nth(2).innerText(),String(fixture.expected.completed));
  await rp.screenshot({path:path.join(output,'velocity.png'),fullPage:true});
  check('summary/burndown/velocity match API snapshots/events; completed points do not change after editing CLOSED issue');

  // Legacy/missing-history presentation: inject only the missing snapshot contract, never seed guessed history in DB.
  await rp.route('**/api/backend/sprints/'+fixture.sprintId+'/reports/summary',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...summary,committedPoints:null,committedCount:null,completedPoints:null,completedCount:null,baselineAvailable:false})}));
  await rp.getByRole('tab',{name:'Tổng kết sprint',exact:true}).click();await rp.getByText('Sprint thiếu snapshot lúc bắt đầu.',{exact:true}).waitFor();assert.equal(await stat('Commitment lúc bắt đầu').innerText(),'Chưa có dữ liệu');assert.equal(await stat('Hoàn thành khi đóng').innerText(),'Chưa có dữ liệu');await rp.unroute('**/api/backend/sprints/'+fixture.sprintId+'/reports/summary');
  await rp.route('**/api/backend/sprints/'+fixture.sprintId+'/reports/burndown',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...burn,points:[],baselineAvailable:false})}));
  await rp.getByRole('tab',{name:'Burndown',exact:true}).click();await rp.getByText('Chưa có sự kiện burndown',{exact:true}).waitFor();assert.equal(await rp.getByRole('img',{name:/Biểu đồ bậc thang/}).count(),0);await rp.unroute('**/api/backend/sprints/'+fixture.sprintId+'/reports/burndown');
  await rp.goto(base+'/app/projects/'+fixture.projectId+'/reports?sprintId=1');await rp.getByText(/Sprint trên URL không khả dụng/).waitFor();
  check('missing history stays unavailable without fake zero chart; foreign sprint URL never falls back');

  await rp.goto(reportUrl);await rp.getByText('Số liệu hiện tại',{exact:true}).waitFor();await rp.setViewportSize({width:390,height:844});assert.ok(await rp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await rp.getByRole('tab',{name:'Burndown',exact:true}).click();await rp.getByRole('img',{name:/Biểu đồ bậc thang/}).waitFor();assert.ok(await rp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await rp.screenshot({path:path.join(output,'reports-mobile.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/app/notifications');await inbox(page).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const outsider=await adminContext.newPage();await login(outsider,fixture.other);await outsider.goto(reportUrl);await outsider.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();await rp.getByText('Bạn không có quyền xem dự án này',{exact:true}).waitFor();assert.equal(await rp.locator('svg[role="img"]').count(),0);assert.equal((await api(outsider,'sprints/'+fixture.sprintId+'/reports/summary')).status,403);
  assert.deepEqual(errors,[]);check('mobile inbox/reports fit viewport; outsider and cross-tab switch clear authorized reports');
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({count:passed.length,passed},null,2));await adminContext.close();await context.close();
 }catch(e){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error('URL:',page.url());console.error((await page.locator('body').innerText()).slice(0,1800));}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
