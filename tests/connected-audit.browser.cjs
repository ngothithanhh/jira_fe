const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const fixture=JSON.parse(fs.readFileSync(process.env.AUDIT_CREDENTIALS,'utf8'));
const {origin,backend,admin,lead,viewer,projectId,otherProjectId,viewerRoleId,updatePermissionId}=fixture;
for(const address of [origin,backend])assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(address).hostname),'Use a disposable loopback demo');
const projectPath='/app/projects/'+projectId;
const auditPath=projectPath+'/audit';
const selector='**/api/backend/projects/'+projectId+'/audit-logs*';
const delay=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};};
const table=page=>page.getByRole('table',{name:'Nhật ký hoạt động'});
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const action=page=>page.getByLabel('Mã thao tác',{exact:true});
async function signIn(page,account){
  await page.goto(origin+'/app/sign-in');
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Mật khẩu/).fill(account.password);
  await button(page,'Đăng nhập').click();
  await page.waitForURL('**/app/projects');
}
async function filter(page,value){
  await action(page).fill(value);
  await button(page,'Áp dụng').click();
}
async function call(page,path){
  return page.evaluate(async path=>{const res=await fetch('/api/backend/'+path);return {status:res.status,data:await res.json()};},path);
}
async function changeGrant(grant){
  const login=await fetch(backend+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(admin)});
  assert.equal(login.status,200);
  const {token}=await login.json();
  const response=await fetch(backend+'/api/roles/'+viewerRoleId+'/permissions',{
    method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({expectedPermissionIds:grant?[]:[updatePermissionId],permissionIds:grant?[updatePermissionId]:[]})
  });
  assert.equal(response.status,200);
}
async function visibility(page){
  await page.evaluate(()=>{
    let hidden=true;
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
    window.dispatchEvent(new Event('visibilitychange'));
    hidden=false;
    window.dispatchEvent(new Event('visibilitychange'));
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  let granted=false;
  try{
    const wide={viewport:{width:1440,height:1000}};
    const adminPage=await browser.newPage(wide),member=await browser.newPage(wide);
    const ownerContext=await browser.newContext(wide);
    const owner=await ownerContext.newPage(),secondTab=await ownerContext.newPage();
    const errors=[];
    for(const page of [adminPage,owner,member,secondTab])page.on('pageerror',error=>errors.push(error.message));
    await signIn(adminPage,admin);
    await adminPage.goto(origin+'/app/admin/audit');
    await table(adminPage).waitFor();
    await adminPage.getByText('Trang 1/2',{exact:true}).waitFor();
    await button(adminPage,'Sau').click();
    await adminPage.getByText('Trang 2/2',{exact:true}).waitFor();
    await button(adminPage,'Trước').click();
    await adminPage.getByText('Trang 1/2',{exact:true}).waitFor();
    await action(adminPage).fill('NO_SUCH_ACTION');
    assert.ok(await table(adminPage).getByRole('row').count()>1,'draft does not reset results');
    await button(adminPage,'Áp dụng').click();
    await table(adminPage).getByText('Không có hoạt động khớp bộ lọc.').waitFor();
    await button(adminPage,'Xóa bộ lọc').click();
    await adminPage.getByText('Trang 1/2',{exact:true}).waitFor();
    await adminPage.getByRole('checkbox',{name:'Chỉ thao tác hệ thống'}).check();
    await filter(adminPage,' legacy_issue ');
    await table(adminPage).getByText('Hệ thống',{exact:true}).waitFor();
    await table(adminPage).getByRole('button',{name:/Chi tiết nhật ký/}).click();
    await adminPage.getByRole('dialog').getByText(/audit audit audit/).waitFor();
    await adminPage.keyboard.press('Escape');
    await adminPage.reload();
    await table(adminPage).waitFor();
    await filter(adminPage,'LEGACY_NO_ID');
    await table(adminPage).getByText(/Không có ID/).waitFor();
    await adminPage.getByLabel('ID dự án',{exact:true}).fill(String(projectId));
    await filter(adminPage,'LEGACY_NO_ID');
    await table(adminPage).getByText('Không có hoạt động khớp bộ lọc.').waitFor();
    console.log('PASS system audit: draft/apply/reset, paging, null actor/entity, detail, scope and reload');
    await signIn(owner,lead);
    await owner.goto(origin+projectPath+'/overview');
    await owner.getByRole('link',{name:'Nhật ký',exact:true}).click();
    await table(owner).waitFor();
    assert.equal(await owner.getByLabel('ID dự án',{exact:true}).count(),0);
    assert.equal((await call(owner,'projects/'+otherProjectId+'/audit-logs')).status,403);
    assert.equal((await call(owner,'projects/'+projectId+'/audit-logs?projectId='+otherProjectId)).status,400);
    await owner.route(selector,route=>route.fulfill({status:503,json:{message:'Audit tạm gián đoạn'}}),{times:1});
    await button(owner,'Tải lại').click();
    await owner.getByRole('alert').getByText(/tạm gián đoạn/).waitFor();
    await owner.getByText(/Dữ liệu đã tải trước đó/).waitFor();
    assert.equal(await table(owner).count(),1);
    await button(owner,'Thử lại').click();
    await owner.getByText(/Dữ liệu đã tải trước đó/).waitFor({state:'hidden'});
    await owner.setViewportSize({width:390,height:844});
    assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page must not scroll horizontally');
    assert.equal(await table(owner).evaluate(el=>getComputedStyle(el.parentElement).overflowX),'auto');
    await owner.setViewportSize(wide.viewport);
    console.log('PASS project audit: lead, isolated scope, transient failure/retry, mobile');
    await signIn(member,viewer);
    await member.goto(origin+projectPath+'/overview');
    await member.getByRole('heading',{name:'Audit demo',exact:true}).waitFor();
    assert.equal(await member.getByRole('link',{name:'Nhật ký',exact:true}).count(),0);
    assert.equal((await call(member,'projects/'+projectId+'/audit-logs')).status,403);
    await changeGrant(true); granted=true;
    await member.goto(origin+auditPath);
    await table(member).waitFor();
    await table(member).getByRole('button',{name:/Chi tiết nhật ký/}).first().click();
    await member.getByRole('dialog').waitFor();
    await changeGrant(false); granted=false;
    await visibility(member);
    await member.getByText('Bạn không có quyền xem nhật ký này',{exact:true}).waitFor();
    assert.equal(await table(member).count(),0);
    assert.equal(await member.getByRole('dialog').count(),0);
    console.log('PASS project authorization: VIEW only, UPDATE_PROJECT and revocation on focus');
    const entered=delay(),resume=delay();
    await owner.route(selector,async route=>{
      const response=await route.fetch();
      entered.release();
      await resume.promise;
      await route.fulfill({response}).catch(()=>{});
    },{times:1});
    await filter(owner,'LEGACY_ISSUE');
    await entered.promise;
    // Sign-in uses the session lock and must wait until the in-flight audit GET is released.
    const changed=signIn(secondTab,viewer);
    await secondTab.getByLabel(/^Email/).waitFor();
    resume.release();
    await changed;
    await owner.getByText('Bạn không có quyền xem nhật ký này',{exact:true}).waitFor();
    assert.equal(await table(owner).count(),0);
    await button(secondTab,'Đăng xuất').click();
    await owner.waitForURL('**/app/sign-in*');
    assert.equal(await table(owner).count(),0);
    console.log('PASS in-flight read, account switch and cross-tab logout');
    await signIn(owner,lead);
    await owner.goto(origin+auditPath);
    await table(owner).waitFor();
    // Change cookie via BFF before releasing old GET, with no session event to hide old rows first.
    await secondTab.goto(origin+'/app/sign-in');
    const late=delay(),finish=delay();
    await owner.route(selector,async route=>{
      const response=await route.fetch();
      late.release();
      await finish.promise;
      await route.fulfill({response}).catch(()=>{});
    },{times:1});
    await filter(owner,'LEGACY_ISSUE');
    await late.promise;
    try{
      assert.equal(await secondTab.evaluate(async account=>(await fetch('/api/backend/auth/login',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(account)
      })).status,viewer),200);
    }finally{finish.release();}
    await owner.getByText('Bạn không có quyền xem nhật ký này',{exact:true}).waitFor();
    assert.equal(await table(owner).count(),0);
    console.log('PASS post-GET actor probe discards a late response after cookie changes');
    const unsupported=await browser.newPage(wide);
    await signIn(unsupported,admin);
    await unsupported.addInitScript(()=>Object.defineProperty(Navigator.prototype,'locks',{configurable:true,get:()=>undefined}));
    let attempts=0;
    unsupported.on('request',req=>{if(req.url().includes('/audit-logs'))attempts++;});
    await unsupported.goto(origin+'/app/admin/audit');
    await unsupported.getByText(/trình duyệt hỗ trợ Web Locks/).waitFor();
    assert.equal(attempts,0);
    assert.deepEqual(errors,[]);
    console.log('PASS missing Web Locks fails closed');
  }finally{
    if(granted)await changeGrant(false);
    await browser.close();
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
