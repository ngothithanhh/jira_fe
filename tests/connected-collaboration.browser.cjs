const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=JSON.parse(fs.readFileSync(process.env.COLLAB_CREDENTIALS,'utf8')),base=fixture.origin;
const output=process.env.COLLAB_OUTPUT||path.join(process.cwd(),'.next-connected-build','collaboration-evidence');fs.mkdirSync(output,{recursive:true});
const tag='E2ECOLLAB '+Date.now().toString(36),passed=[],errors=[];
const check=name=>{passed.push(name);console.log('PASS: '+name);};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const ok=r=>{assert.ok(r.status>=200&&r.status<300,'HTTP '+r.status);return r.data;};
const tokens=new Map();
async function token(user){
 // JWT test có hạn ngắn: lấy phiên mới trước request khi token sắp hết, không replay thao tác ghi đã gửi.
 const old=tokens.get(user.email),exp=old?JSON.parse(Buffer.from(old.split('.')[1],'base64url').toString()).exp:0;
 if(!old||exp*1000<Date.now()+5000){const r=await fetch(fixture.api+'auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password})});assert.equal(r.status,200);tokens.set(user.email,(await r.json()).token);}return tokens.get(user.email);
}
async function direct(user,route,method='GET',body){const r=await fetch(fixture.api+route,{method,headers:{Authorization:'Bearer '+await token(user),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};}
async function upload(user,name,bytes,mime='text/plain'){const form=new FormData();form.set('file',new File([bytes],name,{type:mime}));const r=await fetch(fixture.api+'issues/'+fixture.issueId+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+await token(user)},body:form});return {status:r.status,data:await r.json()};}
async function api(page,route,method='GET',body){return page.evaluate(async({route,method,body})=>{const r=await fetch('/api/backend/'+route,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const t=await r.text();return {status:r.status,data:t?JSON.parse(t):null};},{route,method,body});}
async function login(page,user){await page.goto(base+'/app/sign-in');await page.getByLabel(/^Email/).fill(user.email);await page.getByLabel(/^Mật khẩu/).fill(user.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/app/projects');await page.getByRole('heading',{name:'Dự án',exact:true}).waitFor();}
async function openIssue(page,files=false){await page.goto(base+'/app/projects/'+fixture.projectId+'/issues');await page.getByRole('button',{name:fixture.issueKey,exact:true}).click();await page.getByRole('dialog',{name:fixture.issueKey,exact:true}).waitFor();await page.getByRole('tab',{name:files?'Tệp đính kèm':'Bình luận',exact:true}).click();}
async function eventually(fn){let last;for(let n=0;n<100;n++){try{return await fn();}catch(e){last=e;}await new Promise(r=>setTimeout(r,100));}throw last;}
const commentRow=(page,id)=>page.locator('[data-comment-id="'+id+'"]');
const fileRow=(page,id)=>page.locator('[data-attachment-id="'+id+'"]');
async function post(page,text){await page.getByLabel('Thêm bình luận',{exact:true}).fill(text);await page.getByRole('button',{name:'Gửi bình luận',exact:true}).click();await page.getByRole('list',{name:'Danh sách bình luận'}).getByText(text,{exact:true}).waitFor();return ok(await api(page,'issues/'+fixture.issueId+'/comments')).find(c=>c.commentText===text);}
async function uploadUI(page,name,bytes,mime){await page.getByLabel('Chọn tệp đính kèm',{exact:true}).setInputFiles({name,mimeType:mime,buffer:bytes});await page.getByRole('button',{name:'Tải tệp lên',exact:true}).click();await page.getByText(name,{exact:true}).waitFor();const file=ok(await api(page,'issues/'+fixture.issueId+'/attachments')).find(f=>f.fileName===name);assert.ok(file);return file;}
async function removeFile(page,file){await fileRow(page,file.attachmentId).getByRole('button',{name:'Xóa tệp',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Xóa tệp đính kèm?',exact:true});await dialog.getByRole('button',{name:'Xác nhận xóa tệp',exact:true}).click();await fileRow(page,file.attachmentId).waitFor({state:'detached'});}
async function refocus(page){await page.waitForLoadState('networkidle');await page.evaluate(async()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,30));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});}
(async()=>{
 assert.equal(ok(await direct(fixture.admin,'projects/'+fixture.projectId)).projectKey,'COLLAB','Dedicated fixture required');
 // Mỗi lượt chỉ dọn fixture browser cũ trên đúng project/issue riêng, không chạm bình luận hoặc tệp demo của người dùng.
 const memberships=ok(await direct(fixture.admin,'projects/'+fixture.projectId+'/members'));
 if(!memberships.some(m=>m.userId===fixture.uploader.id))ok(await direct(fixture.admin,'projects/'+fixture.projectId+'/members','POST',{userId:fixture.uploader.id,roleId:fixture.developerRoleId}));
 for(const c of ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments')))if(c.commentText.startsWith('E2ECOLLAB '))ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments/'+c.commentId+'?expectedVersion='+c.version,'DELETE'));
 for(const f of ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/attachments')))if(f.fileName?.startsWith('E2ECOLLAB '))ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/attachments/'+f.attachmentId,'DELETE'));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});let page;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const external=[];context.on('request',r=>{if(!r.url().startsWith(base)&&/^https?:/.test(r.url()))external.push(new URL(r.url()).hostname);});
  await login(page,fixture.pm);await openIssue(page);
  let creates=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/comments'))creates++;});
  const text=tag+' Nội dung <script>window.collabInjected=true</script>';
  await page.getByLabel('Thêm bình luận',{exact:true}).fill(text);await page.getByRole('button',{name:'Gửi bình luận',exact:true}).evaluate(b=>{b.click();b.click();});await page.getByRole('list',{name:'Danh sách bình luận'}).getByText(text,{exact:true}).waitFor();
  let comment=ok(await api(page,'issues/'+fixture.issueId+'/comments')).find(c=>c.commentText===text);assert.ok(comment);assert.equal(creates,1);assert.equal(await page.evaluate(()=>window.collabInjected||false),false);
  await commentRow(page,comment.commentId).getByRole('button',{name:'Sửa bình luận',exact:true}).click();await page.getByLabel('Sửa bình luận',{exact:true}).fill(tag+' Nháp hủy');await page.getByRole('button',{name:'Hủy sửa',exact:true}).click();await page.getByText(text,{exact:true}).waitFor();
  await commentRow(page,comment.commentId).getByRole('button',{name:'Sửa bình luận',exact:true}).click();await page.getByLabel('Sửa bình luận',{exact:true}).fill(tag+' Đã sửa');await page.getByRole('button',{name:'Lưu bình luận',exact:true}).click();await page.getByRole('list',{name:'Danh sách bình luận'}).getByText(tag+' Đã sửa',{exact:true}).waitFor();
  await page.reload();await openIssue(page);comment=ok(await api(page,'issues/'+fixture.issueId+'/comments')).find(c=>c.commentId===comment.commentId);assert.equal(comment.commentText,tag+' Đã sửa');assert.ok(comment.version>0);
  await commentRow(page,comment.commentId).getByRole('button',{name:'Xóa bình luận',exact:true}).click();await page.getByRole('dialog',{name:'Xóa bình luận?',exact:true}).getByRole('button',{name:'Xác nhận xóa bình luận',exact:true}).click();await commentRow(page,comment.commentId).waitFor({state:'detached'});
  check('comment CRUD/cancel/F5 uses real data; double submit sends once and text cannot execute script');

  comment=await post(page,tag+' Version gốc');await commentRow(page,comment.commentId).getByRole('button',{name:'Sửa bình luận',exact:true}).click();await page.getByLabel('Sửa bình luận',{exact:true}).fill(tag+' Draft còn giữ');
  ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments/'+comment.commentId,'PUT',{commentText:tag+' Người khác sửa',expectedVersion:comment.version}));
  const stale=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/comments/'+comment.commentId));
  await page.getByRole('button',{name:'Lưu bình luận',exact:true}).click();assert.equal((await stale).status(),409);await page.getByRole('list',{name:'Danh sách bình luận'}).getByText(tag+' Người khác sửa',{exact:true}).waitFor();assert.equal(await page.getByLabel('Sửa bình luận',{exact:true}).inputValue(),tag+' Draft còn giữ');
  await page.getByRole('button',{name:'Hủy sửa',exact:true}).click();await commentRow(page,comment.commentId).getByRole('button',{name:'Sửa bình luận',exact:true}).click();await page.getByLabel('Sửa bình luận',{exact:true}).fill(tag+' Mở lại bản mới');await page.getByRole('button',{name:'Lưu bình luận',exact:true}).click();await page.getByRole('list',{name:'Danh sách bình luận'}).getByText(tag+' Mở lại bản mới',{exact:true}).waitFor();
  comment=ok(await api(page,'issues/'+fixture.issueId+'/comments')).find(c=>c.commentId===comment.commentId);await commentRow(page,comment.commentId).getByRole('button',{name:'Xóa bình luận',exact:true}).click();
  ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments/'+comment.commentId,'PUT',{commentText:tag+' Chưa được xóa',expectedVersion:comment.version}));
  const deleteResponse=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/comments/'+comment.commentId+'?'));
  await page.getByRole('dialog',{name:'Xóa bình luận?',exact:true}).getByRole('button',{name:'Xác nhận xóa bình luận',exact:true}).click();assert.equal((await deleteResponse).status(),409);
  await page.getByRole('dialog',{name:'Xóa bình luận?',exact:true}).getByRole('button',{name:'Hủy',exact:true}).click();assert.ok(ok(await api(page,'issues/'+fixture.issueId+'/comments')).some(c=>c.commentId===comment.commentId));
  check('stale edit/delete return409 without overwriting or silently changing version; draft survives until user reopens');

  await openIssue(page,true);
  const image=await uploadUI(page,tag+'-minh-hoa.png',png,'image/png');assert.equal(image.fileSize,png.length);assert.equal(image.downloadAvailable,true);
  await page.reload();await openIssue(page,true);await fileRow(page,image.attachmentId).getByText(image.fileName,{exact:true}).waitFor();
  await fileRow(page,image.attachmentId).getByRole('button',{name:'Xem ảnh',exact:true}).click();const preview=page.getByRole('dialog',{name:image.fileName,exact:true});await preview.getByRole('img').waitFor();await eventually(async()=>assert.ok(await preview.getByRole('img').evaluate(i=>i.naturalWidth>0)));await preview.getByRole('button',{name:'Đóng',exact:true}).click();
  const downloadEvent=page.waitForEvent('download');await fileRow(page,image.attachmentId).getByRole('button',{name:'Tải xuống',exact:true}).click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),image.fileName);const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),png);
  await page.route('**/api/backend/issues/'+fixture.issueId+'/attachments/'+image.attachmentId+'/content',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await page.route('**/api/backend/auth/me',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"download probe failed"}'}));await route.fulfill({response});},{times:1});
  await fileRow(page,image.attachmentId).getByRole('button',{name:'Xem ảnh',exact:true}).click();await page.getByText('Chưa xác nhận được phiên để mở tệp. Tải lại dữ liệu rồi thử lại.',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog',{name:image.fileName,exact:true}).count(),0);
  await page.unrouteAll({behavior:'wait'});await fileRow(page,image.attachmentId).getByRole('button',{name:'Xem ảnh',exact:true}).click();await page.getByRole('dialog',{name:image.fileName,exact:true}).getByRole('img').waitFor();await page.getByRole('dialog',{name:image.fileName,exact:true}).getByRole('button',{name:'Đóng',exact:true}).click();
  check('download completion probe failure shows an error without releasing file; retry after recovery works');
  const document=await uploadUI(page,tag+'-yeu-cau.txt',Buffer.from('Yêu cầu thanh toán\nDữ liệu local thật.','utf8'),'text/plain');assert.equal(await fileRow(page,document.attachmentId).getByRole('button',{name:'Xem ảnh',exact:true}).count(),0);
  await page.screenshot({path:path.join(output,'attachments.png'),fullPage:true});
  const wrongParent=await api(page,'issues/'+fixture.otherIssueId+'/attachments/'+image.attachmentId+'/content');assert.equal(wrongParent.status,404);
  await removeFile(page,document);assert.equal((await api(page,'issues/'+fixture.issueId+'/attachments/'+document.attachmentId+'/content')).status,404);
  check('PNG/text upload to PostgreSQL, metadata/F5, raster preview and exact downloaded bytes; scoped delete removes content');

  const unsafe=await uploadUI(page,tag+'-spoof.png',Buffer.from('<script>window.collabInjected=true</script>'),'image/png');await fileRow(page,unsafe.attachmentId).getByRole('button',{name:'Xem ảnh',exact:true}).click();await page.getByText('Định dạng này chỉ hỗ trợ tải xuống.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.collabInjected||false),false);assert.equal(await page.getByRole('dialog',{name:unsafe.fileName,exact:true}).count(),0);await removeFile(page,unsafe);
  for(const [name,buffer]of [['empty.txt',Buffer.alloc(0)],['large.txt',Buffer.alloc(10*1024*1024+1)]]){await page.getByLabel('Chọn tệp đính kèm',{exact:true}).setInputFiles({name,mimeType:'text/plain',buffer});await page.getByText('Chọn tệp không rỗng, tối đa 10 MiB.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Tải tệp lên',exact:true}).isDisabled(),true);}
  check('empty/oversize files stop before upload; MIME-spoofed HTML cannot be previewed or executed');

  const viewerContext=await browser.newContext(),vp=await viewerContext.newPage();vp.on('pageerror',e=>errors.push(e.message));await login(vp,fixture.viewer);await openIssue(vp);
  assert.equal(await commentRow(vp,comment.commentId).getByRole('button',{name:'Sửa bình luận',exact:true}).count(),0);
  assert.equal(await commentRow(vp,fixture.seedCommentId).getByRole('button',{name:'Sửa bình luận',exact:true}).count(),1);
  const own=await post(vp,tag+' Người xem bình luận');assert.equal(own.userId,fixture.viewer.id);
  await vp.getByRole('tab',{name:'Tệp đính kèm',exact:true}).click();assert.equal(await vp.getByLabel('Chọn tệp đính kèm',{exact:true}).isDisabled(),true);
  assert.equal((await api(vp,'issues/'+fixture.issueId+'/attachments/'+image.attachmentId,'DELETE')).status,403);
  assert.equal((await direct(fixture.outsider,'issues/'+fixture.issueId+'/comments')).status,403);
  assert.equal((await direct(fixture.outsider,'issues/'+fixture.issueId+'/attachments')).status,403);
  assert.equal((await fetch(fixture.api+'issues/'+fixture.issueId+'/attachments/'+image.attachmentId+'/content',{headers:{Authorization:'Bearer '+await token(fixture.outsider)}})).status,403);
  await viewerContext.close();
  const owned=ok(await upload(fixture.uploader,tag+'-owner.txt',Buffer.from('Owner file')));
  ok(await direct(fixture.admin,'projects/'+fixture.projectId+'/members/'+fixture.uploader.id,'DELETE'));
  assert.equal((await direct(fixture.uploader,'issues/'+fixture.issueId+'/attachments/'+owned.attachmentId,'DELETE')).status,403);
  ok(await direct(fixture.admin,'issues/'+fixture.issueId+'/attachments/'+owned.attachmentId,'DELETE'));
  check('viewer can comment/manage own text but cannot upload/delete others; outsider and removed uploader denied by real BE');

  await openIssue(page);await page.getByLabel('Thêm bình luận',{exact:true}).fill(tag+' Draft khi GET lỗi');
  await page.route('**/api/backend/issues/'+fixture.issueId+'/comments',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lỗi danh sách thử nghiệm'})}):route.continue());
  await refocus(page);await page.getByRole('alert').filter({hasText:'Lỗi danh sách thử nghiệm'}).waitFor();assert.equal(await page.getByLabel('Thêm bình luận',{exact:true}).inputValue(),tag+' Draft khi GET lỗi');assert.equal(await page.getByRole('button',{name:'Gửi bình luận',exact:true}).isDisabled(),true);
  await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'Tải lại danh sách',exact:true}).click();await eventually(async()=>assert.equal(await page.getByRole('button',{name:'Gửi bình luận',exact:true}).isDisabled(),false));
  await page.route('**/api/backend/issues/'+fixture.issueId+'/comments',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();assert.equal(response.status(),201);await page.route('**/api/backend/auth/me',r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"probe failed"}'}));await route.fulfill({response});},{times:1});
  await page.getByRole('button',{name:'Gửi bình luận',exact:true}).click();await page.getByText('Thao tác đã lưu nhưng chưa xác nhận được phiên. Tải lại trang trước khi thao tác tiếp.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Gửi bình luận',exact:true}).isDisabled(),true);
  await page.unrouteAll({behavior:'wait'});await page.getByRole('button',{name:'Tải lại trang để xác nhận',exact:true}).click();await openIssue(page);assert.equal(ok(await api(page,'issues/'+fixture.issueId+'/comments')).filter(c=>c.commentText===tag+' Draft khi GET lỗi').length,1);
  check('GET failure preserves draft and blocks writes; committed comment with failed completion cannot be resubmitted silently');

  await page.evaluate(()=>new Promise(ready=>{void navigator.locks.request('jira-connected-session',()=>new Promise(release=>{window.collabRelease=release;ready();}));}));
  let queuedWrites=0;const watch=r=>{if(r.method()==='POST'&&r.url().endsWith('/comments'))queuedWrites++;};page.on('request',watch);
  await page.getByLabel('Thêm bình luận',{exact:true}).fill(tag+' Không gửi dưới tài khoản khác');await page.getByRole('button',{name:'Gửi bình luận',exact:true}).click();
  const swapped=await context.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:fixture.viewer.email,password:fixture.viewer.password}});assert.equal(swapped.status(),200);await page.evaluate(()=>window.collabRelease());await page.getByRole('button',{name:'Tải lại trang để xác nhận',exact:true}).waitFor();assert.equal(queuedWrites,0);page.off('request',watch);
  await page.reload();await openIssue(page);assert.equal(await page.getByLabel('Thêm bình luận',{exact:true}).inputValue(),'');
  check('queued comment cannot dispatch with replacement account cookie even before session event');

  await login(page,fixture.pm);await openIssue(page);let release,saved;const gate=new Promise(r=>release=r),committed=new Promise(r=>saved=r);
  await page.route('**/api/backend/issues/'+fixture.issueId+'/comments',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();saved(response.status());await gate;await route.fulfill({response});},{times:1});
  await page.getByLabel('Thêm bình luận',{exact:true}).fill(tag+' Response cũ');await page.getByRole('button',{name:'Gửi bình luận',exact:true}).click();assert.equal(await committed,201);
  assert.equal((await context.request.post(base+'/api/backend/auth/login',{headers:{Origin:base},data:{email:fixture.viewer.email,password:fixture.viewer.password}})).status(),200);release();await page.getByRole('button',{name:'Tải lại trang để xác nhận',exact:true}).waitFor();await page.unrouteAll({behavior:'wait'});await page.reload();await openIssue(page);assert.equal(await page.getByLabel('Thêm bình luận',{exact:true}).inputValue(),'');
  const savedComment=ok(await api(page,'issues/'+fixture.issueId+'/comments')).find(c=>c.commentText===tag+' Response cũ');assert.equal(savedComment.userId,fixture.pm.id);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'comments-mobile.png'),fullPage:true});
  check('late committed response never populates replacement draft; mobile fits viewport and no external file provider is called');
  await page.setViewportSize({width:1440,height:1000});await login(page,fixture.pm);await openIssue(page);
  await page.getByLabel('Thêm bình luận',{exact:true}).fill(tag+' Gate draft giữ lại');await page.getByRole('tab',{name:'Tệp đính kèm',exact:true}).click();await page.getByLabel('Chọn tệp đính kèm',{exact:true}).setInputFiles({name:tag+'-draft.txt',mimeType:'text/plain',buffer:Buffer.from('draft')});
  await page.route('**/api/backend/projects/'+fixture.projectId,r=>r.fulfill({status:503,contentType:'application/json',body:'{"message":"Lỗi quyền thử nghiệm"}'}));await refocus(page);
  const sheet=page.getByRole('dialog',{name:fixture.issueKey,exact:true});await sheet.getByRole('alert').filter({hasText:'Lỗi quyền thử nghiệm'}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Tải tệp lên',exact:true}).isDisabled(),true);
  await page.getByRole('tab',{name:'Bình luận',exact:true}).click();assert.equal(await page.getByLabel('Thêm bình luận',{exact:true}).inputValue(),tag+' Gate draft giữ lại');assert.equal(await page.getByRole('button',{name:'Gửi bình luận',exact:true}).isDisabled(),true);
  await page.unrouteAll({behavior:'wait'});await sheet.getByRole('button',{name:'Tải lại dữ liệu',exact:true}).click();await eventually(async()=>assert.equal(await page.getByRole('button',{name:'Gửi bình luận',exact:true}).isDisabled(),false));assert.equal(await page.getByLabel('Thêm bình luận',{exact:true}).inputValue(),tag+' Gate draft giữ lại');
  await page.getByRole('tab',{name:'Tệp đính kèm',exact:true}).click();assert.ok((await page.getByLabel('Chọn tệp đính kèm',{exact:true}).evaluate(i=>i.files[0].name)).endsWith('-draft.txt'));
  check('project gate503 preserves comment and selected file; retry inside IssuePanel restores writes without closing draft');
  await closedBoardDownload(page);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed,errors,external},null,2));
  // Chỉ dọn dữ liệu do test này tạo; giữ seed comment và issue/project để kiểm bằng tay.
  for(const c of ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments')))if(c.commentText.startsWith(tag))ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/comments/'+c.commentId+'?expectedVersion='+c.version,'DELETE'));
  for(const f of ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/attachments')))if(f.fileName?.startsWith(tag))ok(await direct(fixture.pm,'issues/'+fixture.issueId+'/attachments/'+f.attachmentId,'DELETE'));
  await context.close();
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

/** Board CLOSED giữ lịch sử: khóa ghi nhưng vẫn phải cho VIEW_PROJECT tải/preview file local đúng byte. */
async function closedBoardDownload(page){
  const pm=fixture.pm,main=ok(await direct(pm,'issues/'+fixture.issueId));
  const issue=ok(await direct(pm,'issues','POST',{projectId:fixture.projectId,issueTypeId:main.issueTypeId,summary:tag+' Closed file',priority:'MEDIUM'}));
  const sprint=ok(await direct(pm,'sprints','POST',{projectId:fixture.projectId,sprintName:tag+' CLOSED'}));
  ok(await direct(pm,'sprints/'+sprint.sprintId+'/issues/'+issue.issueId,'POST'));ok(await direct(pm,'sprints/'+sprint.sprintId+'/start','PUT'));
  const statuses=ok(await direct(pm,'issue-statuses'));let current=issue;
  for(let n=0;n<4&&statuses.find(s=>s.statusId===current.statusId)?.statusCategory!=='DONE';n++){
    const allowed=ok(await direct(pm,'workflows/allowed-transitions?currentStatusId='+current.statusId));const next=allowed.find(s=>s.statusCategory==='DONE')||allowed.find(s=>s.statusCategory==='IN_PROGRESS');assert.ok(next);
    current=ok(await direct(pm,'issues/'+issue.issueId+'/status?statusId='+next.statusId,'PUT'));
  }
  const done=statuses.find(s=>s.statusId===current.statusId);assert.equal(done.statusCategory,'DONE');ok(await direct(pm,'sprints/'+sprint.sprintId+'/complete','PUT'));
  const board=ok(await direct(pm,'boards','POST',{projectId:fixture.projectId,boardName:tag+' Board',boardType:'SCRUM'}));const column=board.columns.find(c=>c.columnName==='Done');assert.ok(column);ok(await direct(pm,'boards/columns/map-status','POST',{columnId:column.columnId,statusId:done.statusId}));
  const form=new FormData();form.set('file',new File([png],tag+'-closed.png',{type:'image/png'}));const response=await fetch(fixture.api+'issues/'+issue.issueId+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+await token(pm)},body:form});assert.equal(response.status,201);const file=await response.json();
  await page.goto(base+'/app/projects/'+fixture.projectId+'/board?boardId='+board.boardId+'&sprintId='+sprint.sprintId);await page.getByText(/Đang xem sprint đã đóng/).waitFor();await page.getByRole('button',{name:issue.issueKey,exact:true}).click();await page.getByRole('tab',{name:'Tệp đính kèm',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Tải tệp lên',exact:true}).isDisabled(),true);const row=fileRow(page,file.attachmentId);assert.equal(await row.getByRole('button',{name:'Tải xuống',exact:true}).isDisabled(),false);
  const event=page.waitForEvent('download');await row.getByRole('button',{name:'Tải xuống',exact:true}).click();const chunks=[];for await(const chunk of await(await event).createReadStream())chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),png);
  await row.getByRole('button',{name:'Xem ảnh',exact:true}).click();await page.getByRole('dialog',{name:file.fileName,exact:true}).getByRole('img').waitFor();await page.getByRole('dialog',{name:file.fileName,exact:true}).getByRole('button',{name:'Đóng',exact:true}).click();
  check('CLOSED board disables attachment writes but permits authorized preview and exact download');
  ok(await direct(pm,'issues/'+issue.issueId+'/attachments/'+file.attachmentId,'DELETE'));ok(await direct(pm,'boards/'+board.boardId,'DELETE'));const fresh=ok(await direct(pm,'issues/'+issue.issueId));ok(await direct(pm,'issues/'+issue.issueId+'?expectedVersion='+fresh.version,'DELETE'));
}
