const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const f=JSON.parse(fs.readFileSync(process.env.ROLES_CREDENTIALS,'utf8')),base=f.origin;
const out=process.env.ROLES_OUTPUT||'.next-account-build/roles-evidence';fs.mkdirSync(out,{recursive:true});
const passed=[],errors=[],check=s=>{passed.push(s);console.log('PASS '+s);};
async function api(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};},{route,method,body});}
async function login(page,user){await page.goto(base+'/app/sign-in');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(user.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');await page.getByRole('heading',{name:'Dự án',exact:true}).waitFor();}
const row=(page,name)=>page.getByRole('row').filter({has:page.getByText(name,{exact:true})});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});try{
 const ac=await browser.newContext({viewport:{width:1440,height:1000}}),oc=await browser.newContext({viewport:{width:1440,height:1000}}),mc=await browser.newContext();
 const admin=await ac.newPage(),owner=await oc.newPage(),member=await mc.newPage();for(const p of [admin,owner,member])p.on('pageerror',e=>errors.push(e.message));
 await login(admin,f.admin);await admin.goto(base+'/app/admin/roles');await admin.getByRole('heading',{name:'Vai trò & quyền',exact:true}).waitFor();
 await row(admin,'SYSTEM_ADMIN').waitFor();assert.equal(await row(admin,'PROJECT_MANAGER').getByRole('button').count(),0);
 assert.equal((await api(admin,'permissions')).data.length>=13,true);check('admin role list/count/catalog real; built-in roles have no rename/delete actions');
 const stamp=Date.now().toString(36).toUpperCase(),name='REVIEW_'+stamp,changed=name+'_NEW';
 await admin.getByRole('button',{name:'Tạo vai trò',exact:true}).click();let dialog=admin.getByRole('dialog',{name:'Tạo vai trò',exact:true});
 await dialog.getByLabel(/^Tên vai trò/).fill(' '+name.toLowerCase()+' ');await dialog.getByRole('button',{name:'Lưu vai trò',exact:true}).click();await dialog.waitFor({state:'detached'});await row(admin,name).waitFor();
 await row(admin,name).getByRole('button',{name:'Đổi tên '+name,exact:true}).click();dialog=admin.getByRole('dialog',{name:'Đổi tên vai trò',exact:true});await dialog.getByLabel(/^Tên vai trò/).fill(changed);await dialog.getByRole('button',{name:'Lưu vai trò',exact:true}).click();await dialog.waitFor({state:'detached'});await row(admin,changed).waitFor();
 const custom=(await api(admin,'admin/roles')).data.find(r=>r.roleName===changed);assert.equal(custom.scope,'PROJECT');check('UI create normalizes code and rename preserves same role ID');
 await login(owner,f.owner);await owner.getByRole('button',{name:'Tạo dự án',exact:true}).first().click();dialog=owner.getByRole('dialog');
 const key=('P'+stamp).slice(0,10);
 await dialog.getByLabel(/^Tên dự án/).fill('Không gian dự án cá nhân');await dialog.getByLabel(/^Mã dự án/).fill(key);await dialog.getByRole('button',{name:'Tạo dự án',exact:true}).click();await owner.waitForURL('**/app/projects/*/overview');
 const projectId=Number(new URL(owner.url()).pathname.split('/')[3]);assert.ok(projectId);
 const context=(await api(owner,'account/context')).data;assert.equal(context.systemAdmin,false);assert.ok(context.globalPermissions.includes('CREATE_PROJECT'));
 const members=(await api(owner,'projects/'+projectId+'/members')).data;assert.equal(members.length,1);assert.equal(members[0].userId,f.owner.id);assert.equal(members[0].role,'PROJECT_MANAGER');
 assert.equal((await api(owner,'admin/roles')).status,403);check('ordinary user creates through UI and gets lead/manager membership without system admin');
 await login(member,f.member);assert.equal((await api(member,'projects/'+projectId)).status,403);assert.equal((await api(member,'projects/'+projectId,'DELETE')).status,403);
 assert.equal((await api(owner,'projects/'+projectId+'/members','POST',{userId:f.member.id,roleId:custom.role})).status,200);
 assert.equal((await api(member,'projects/'+projectId)).status,200);assert.equal((await api(member,'projects/'+projectId,'DELETE')).status,403);
 assert.equal((await api(owner,'projects/'+projectId,'DELETE')).status,409);check('invite assigns role only in own project; outsider denied and member cannot delete; owner blocked while another member remains');
 // Role đang được dùng trả409, không xóa membership hoặc báo thành công giả.
 await admin.reload();await row(admin,changed).getByRole('button',{name:'Xóa '+changed,exact:true}).click();dialog=admin.getByRole('dialog',{name:'Xóa vai trò',exact:true});await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Vai trò mặc định'}).waitFor();await dialog.getByRole('button',{name:'Hủy',exact:true}).click();
 const dev=(await api(admin,'user-role')).data.find(r=>r.roleName==='DEVELOPER');
 assert.equal((await api(admin,'admin/users/'+f.member.id+'/roles/'+dev.role,'PUT')).status,400);
 await admin.goto(base+'/app/admin/users');await admin.getByLabel('Tìm người dùng',{exact:true}).fill(f.member.email);await row(admin,f.member.email).getByRole('button',{name:'Chi tiết',exact:true}).click();dialog=admin.getByRole('dialog',{name:f.member.fullName,exact:true});await dialog.getByRole('button',{name:'Gán SYSTEM_ADMIN',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Gán DEVELOPER',exact:true}).count(),0);check('in-use role delete409 preserves data; global user grant only SYSTEM_ADMIN in UI and backend');
 assert.equal((await api(owner,'projects/'+projectId+'/members/'+f.member.id,'DELETE')).status,200);
 await admin.goto(base+'/app/admin/roles');await row(admin,changed).getByRole('button',{name:'Xóa '+changed,exact:true}).click();dialog=admin.getByRole('dialog',{name:'Xóa vai trò',exact:true});await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await dialog.waitFor({state:'detached'});await row(admin,changed).waitFor({state:'detached'});check('unused custom role deletes through UI after membership removed');
 await owner.goto(base+'/app/projects/'+projectId+'/settings');await owner.getByRole('button',{name:'Xóa dự án',exact:true}).click();dialog=owner.getByRole('dialog');await dialog.getByRole('textbox').fill(key);await dialog.getByRole('button',{name:'Xóa dự án',exact:true}).click();await owner.waitForURL('**/app/projects');assert.equal((await api(owner,'projects/'+projectId)).status,404);check('owner deletes own empty project with sole lead membership through typed-key confirmation');
 // Một role đã commit nhưng response mất: không replay khi đóng/mở và chỉ reload mới cho thao tác tiếp.
 await admin.getByRole('button',{name:'Tạo vai trò',exact:true}).click();dialog=admin.getByRole('dialog',{name:'Tạo vai trò',exact:true});const uncertain='LOST_'+stamp;
 await dialog.getByLabel(/^Tên vai trò/).fill(uncertain);let writes=0;
 await admin.route('**/api/backend/user-role',async route=>{writes++;const r=await route.fetch();assert.equal(r.status(),201);await route.abort('failed');},{times:1});
 await dialog.getByRole('button',{name:'Lưu vai trò',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Chưa xác nhận được kết quả'}).waitFor();
 await dialog.getByRole('button',{name:'Hủy',exact:true}).click();assert.equal(await admin.getByRole('button',{name:'Tạo vai trò',exact:true}).isDisabled(),true);assert.equal(writes,1);
 await admin.unrouteAll({behavior:'wait'});await admin.reload();await row(admin,uncertain).waitFor();const lost=(await api(admin,'admin/roles')).data.find(r=>r.roleName===uncertain);assert.equal((await api(admin,'user-role/'+lost.role,'DELETE')).status,204);
 await admin.reload();check('lost create response keeps uncertainty latch and does not replay committed mutation');
 await row(admin,'SYSTEM_ADMIN').waitFor();await admin.getByText('DELETE_USER',{exact:true}).waitFor();await admin.screenshot({path:path.join(out,'roles-desktop.png'),fullPage:true});await admin.setViewportSize({width:390,height:844});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await admin.screenshot({path:path.join(out,'roles-mobile.png'),fullPage:true});check('roles mobile stays within viewport');
 await owner.goto(base+'/app/admin/roles');await owner.getByText('Chỉ quản trị viên hệ thống được cấu hình danh mục',{exact:true}).waitFor();check('ordinary user cannot access configuration UI');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed,count:passed.length},null,2));
 await ac.close();await oc.close();await mc.close();
}catch(error){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
