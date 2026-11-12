const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const f=JSON.parse(fs.readFileSync(process.env.MATRIX_CREDENTIALS,'utf8')),base=f.origin;
const out=process.env.MATRIX_OUTPUT||'.next-connected-build/matrix-evidence';fs.mkdirSync(out,{recursive:true});
const passed=[],errors=[],check=s=>{passed.push(s);console.log('PASS '+s);};
async function api(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const text=await r.text();return {status:r.status,data:text?JSON.parse(text):null};},{route,method,body});}
async function login(page,user){await page.goto(base+'/app/sign-in');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(user.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');}
async function matrix(page){await page.goto(base+'/app/admin/roles');await page.getByRole('table',{name:'Ma trận quyền vai trò',exact:true}).waitFor();}
const cell=(page,code,name=f.role.roleName)=>page.getByRole('checkbox',{name:code+' — '+name,exact:true});
async function start(page){await page.getByRole('button',{name:'Sửa quyền '+f.role.roleName,exact:true}).click();await page.getByText('Đang sửa quyền: '+f.role.roleName,{exact:true}).waitFor();}
async function save(page){await page.getByRole('button',{name:'Lưu quyền',exact:true}).click();await page.getByText('Đang sửa quyền: '+f.role.roleName,{exact:true}).waitFor({state:'detached'});}
async function focus(page){await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});}
async function eventually(fn){let error;for(let n=0;n<70;n++){try{return await fn();}catch(e){error=e;}await new Promise(r=>setTimeout(r,100));}throw error;}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});try{
 const a=await browser.newContext({viewport:{width:1500,height:1050}}),b=await browser.newContext({viewport:{width:1500,height:1050}}),c=await browser.newContext();
 const page=await a.newPage(),other=await b.newPage(),member=await c.newPage();for(const p of [page,other,member])p.on('pageerror',e=>errors.push(e.message));
 await login(page,f.admin);await login(other,f.admin);await login(member,f.member);await matrix(page);
 assert.equal(await cell(page,'DELETE_USER','SYSTEM_ADMIN').isDisabled(),true);
 await start(page);assert.equal(await cell(page,'VIEW_PROJECT').isChecked(),true);assert.equal(await cell(page,'VIEW_PROJECT').isDisabled(),true);assert.equal(await cell(page,'CREATE_PROJECT').isDisabled(),true);
 let writes=0;const watch=r=>{if(r.method()==='PUT'&&r.url().endsWith('/roles/'+f.role.role+'/permissions'))writes++;};page.on('request',watch);
 await cell(page,'UPDATE_PROJECT').check();await page.getByRole('button',{name:'Lưu quyền',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByText('Đang sửa quyền: '+f.role.roleName,{exact:true}).waitFor({state:'detached'});page.off('request',watch);assert.equal(writes,1);
 const snapshot=(await api(page,'roles/'+f.role.role+'/permissions')).data,update=f.permissions.find(p=>p.permissionName==='UPDATE_PROJECT').permissionId;assert.deepEqual(snapshot.permissionIds,[update]);
 for(const project of f.projects.slice(0,2)){const context=(await api(member,'account/context?projectId='+project.projectId)).data;assert.ok(context.projectPermissions.includes('UPDATE_PROJECT'));assert.equal((await api(member,'projects/'+project.projectId,'PATCH',{projectName:project.projectName,description:project.description})).status,200);}
 assert.equal((await api(member,'projects/'+f.projects[2].projectId)).status,403);
 check('matrix saves one atomic PUT on double click; role grant applies to two membership projects and never third project');
 await page.reload();await start(page);await cell(page,'UPDATE_PROJECT').uncheck();await save(page);
 for(const project of f.projects.slice(0,2)){assert.equal((await api(member,'projects/'+project.projectId,'PATCH',{projectName:'Denied'})).status,403);assert.equal((await api(member,'projects/'+project.projectId)).status,200);}
 assert.deepEqual((await api(page,'roles/'+f.role.role+'/permissions')).data.permissionIds,[]);check('empty set persists through F5; member still VIEW_PROJECT but edit denied; stored VIEW is not invented');
 // Hai editor cùng snapshot; background refetch không làm đổi base/draft.
 await start(page);await matrix(other);await start(other);
 await cell(page,'EDIT_ISSUE').check();await cell(other,'CREATE_ISSUE').check();await save(page);await focus(other);
 assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),true);assert.equal(await cell(other,'EDIT_ISSUE').isChecked(),false);
 await other.getByRole('button',{name:'Lưu quyền',exact:true}).click();await other.getByRole('alert').filter({hasText:'Bản nháp được giữ'}).first().waitFor();
 assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),true);assert.equal(await other.getByRole('button',{name:'Lưu quyền',exact:true}).isDisabled(),true);
 await other.getByRole('button',{name:'Tải cấu hình mới',exact:true}).click();let confirm=other.getByRole('dialog',{name:'Bỏ thay đổi chưa lưu?',exact:true});
 await confirm.getByRole('button',{name:'Tiếp tục sửa',exact:true}).click();assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),true);
 await other.getByRole('button',{name:'Tải cấu hình mới',exact:true}).click();await confirm.getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();
 await eventually(async()=>assert.equal(await cell(other,'EDIT_ISSUE').isChecked(),true));assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),false);check('two admin snapshots conflict409; draft survives refetch and only explicit reload replaces it');
 await cell(other,'CREATE_ISSUE').check();await other.getByRole('button',{name:'Sửa quyền '+f.otherRole.roleName,exact:true}).click();await confirm.getByRole('button',{name:'Tiếp tục sửa',exact:true}).click();
 assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),true);
 await other.getByRole('button',{name:'Hủy sửa quyền',exact:true}).click();await confirm.getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();check('switch/cancel dirty draft asks confirmation; cancel does not send mutation');
 // Lỗi đọc matrix không làm mất draft.
 await start(other);await cell(other,'CREATE_ISSUE').check();
 await other.route('**/api/backend/admin/role-permissions',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Matrix unavailable"}'}));await focus(other);
 await other.getByRole('alert').filter({hasText:'Matrix unavailable'}).waitFor();assert.equal(await cell(other,'CREATE_ISSUE').isChecked(),true);assert.equal(await other.getByRole('button',{name:'Lưu quyền',exact:true}).isDisabled(),true);
 await other.unrouteAll({behavior:'wait'});await other.getByRole('button',{name:'Thử lại ma trận',exact:true}).click();await eventually(async()=>assert.equal(await other.getByRole('button',{name:'Lưu quyền',exact:true}).isEnabled(),true));await save(other);
 check('matrix503 retains draft and blocks writes; retry restores save without closing editor');
 // Response đã commit bị mất, đóng mở editor vẫn không gửi lại.
 await start(other);await cell(other,'CREATE_ISSUE').uncheck();let lostWrites=0;
 await other.route('**/api/backend/roles/'+f.role.role+'/permissions',async route=>{lostWrites++;const r=await route.fetch();assert.equal(r.status(),200);await route.abort('failed');},{times:1});
 await other.getByRole('button',{name:'Lưu quyền',exact:true}).click();await other.getByRole('alert').filter({hasText:'Chưa xác nhận được kết quả'}).first().waitFor();
 assert.equal(await other.getByRole('button',{name:'Lưu quyền',exact:true}).isDisabled(),true);assert.equal(lostWrites,1);
 await other.getByRole('button',{name:'Hủy sửa quyền',exact:true}).click();await confirm.getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();assert.equal(await other.getByRole('button',{name:'Sửa quyền '+f.role.roleName,exact:true}).isDisabled(),true);
 await other.unrouteAll({behavior:'wait'});await other.reload();await start(other);check('lost successful PUT response keeps persistent uncertainty latch; no replay until reload');
 // Request chờ khóa không được dùng cookie thay actor.
 await cell(other,'CREATE_ISSUE').check();await other.evaluate(()=>new Promise(resolve=>{navigator.locks.request('jira-connected-session',()=>new Promise(release=>{window.r2Release=release;resolve();}));}));
 let queued=0;const observe=r=>{if(r.method()==='PUT'&&r.url().includes('/roles/'))queued++;};other.on('request',observe);
 await other.getByRole('button',{name:'Lưu quyền',exact:true}).click();
 assert.equal((await b.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:f.member.email,password:f.member.password}})).status(),200);await other.evaluate(()=>window.r2Release());
 await other.getByRole('alert').first().waitFor();assert.equal(queued,0);other.off('request',observe);await other.reload();await other.getByText('Chỉ quản trị viên hệ thống được cấu hình danh mục',{exact:true}).waitFor();
 check('queued matrix write cannot dispatch with replacement member cookie');
 // Late committed response không được hoàn tất UI dưới actor mới.
 await matrix(page);await start(page);await cell(page,'CREATE_ISSUE').check();let release,saved;const held=new Promise(r=>release=r),committed=new Promise(r=>saved=r);
 await page.route('**/api/backend/roles/'+f.role.role+'/permissions',async route=>{const response=await route.fetch();saved(response.status());await held;await route.fulfill({response});},{times:1});
 await page.getByRole('button',{name:'Lưu quyền',exact:true}).click();assert.equal(await committed,200);
 assert.equal((await a.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:f.member.email,password:f.member.password}})).status(),200);release();await page.getByRole('alert').first().waitFor();await page.unrouteAll({behavior:'wait'});await page.reload();await page.getByText('Chỉ quản trị viên hệ thống được cấu hình danh mục',{exact:true}).waitFor();
 check('late committed matrix response cannot complete or populate replacement actor');
 await login(page,f.admin);await matrix(page);await page.screenshot({path:path.join(out,'matrix-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'matrix-mobile.png'),fullPage:true});
 assert.equal((await api(member,'admin/role-permissions')).status,403);assert.equal((await api(member,'roles/'+f.role.role+'/permissions','PUT',{expectedPermissionIds:[],permissionIds:[]})).status,403);
 // Reload GET A trả muộn sau khi cookie đã đổi B: không thay draft hoặc xóa409 bằng snapshot cũ.
 await start(page);await cell(page,'UPDATE_PROJECT').check();
 let releaseRead,readReady;const waitRead=new Promise(r=>releaseRead=r),readyRead=new Promise(r=>readReady=r);
 await page.route('**/api/backend/admin/role-permissions',async route=>{const response=await route.fetch();readReady();await waitRead;await route.fulfill({response});},{times:1});
 await page.getByRole('button',{name:'Tải cấu hình mới',exact:true}).click();
 await page.getByRole('dialog',{name:'Bỏ thay đổi chưa lưu?',exact:true}).getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();await readyRead;
 assert.equal((await a.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:f.member.email,password:f.member.password}})).status(),200);releaseRead();
 await page.getByRole('alert').filter({hasText:'Không xác nhận được phiên khi tải cấu hình'}).waitFor();assert.equal(await cell(page,'UPDATE_PROJECT').isChecked(),true);assert.equal(await page.getByRole('button',{name:'Lưu quyền',exact:true}).isDisabled(),true);
 await page.unrouteAll({behavior:'wait'});check('reload completion probes cookie actor before replacing draft or clearing stale error');
 assert.deepEqual(errors,[]);check('matrix is responsive; non-admin direct GET/PUT denied; no uncaught runtime errors');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({count:passed.length,passed},null,2));
 await a.close();await b.close();await c.close();
}catch(error){const p=browser.contexts()[0]?.pages()[0];if(p)await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
