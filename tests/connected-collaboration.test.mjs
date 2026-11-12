import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationRoute,commentBody,readAttachment,MAX_ATTACHMENT_BYTES,readAttachmentContent} from '../src/features/connected/collaboration/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';
import {connectedMutation} from '../src/features/connected/client.ts';
const origin='http://localhost:3131';
const query=s=>new URLSearchParams(s);
const request=(path,method='GET',body,headers={})=>new Request(origin+'/api/backend/'+path,{method,headers:{origin,cookie:'jira_access=test-access',...headers},body});
const route=req=>backendRoute(req,new URL(req.url).pathname.replace('/api/backend/','').split('/'));
const form=(text='hello')=>{const f=new FormData();f.set('file',new File([text],'test.txt',{type:'text/plain'}));return f;};

test('comment contract validates parent route, immutable version and text without accepting actor fields',()=>{
  assert.equal(collaborationRoute('issues/5/comments/7','DELETE',query('expectedVersion=0')).write,true);
  for(const qs of ['', 'expectedVersion=-1','expectedVersion=9007199254740992','expectedVersion=1&expectedVersion=2','expectedVersion=1&actorId=7'])assert.throws(()=>collaborationRoute('issues/5/comments/7','DELETE',query(qs)));
  assert.equal(collaborationRoute('issues/attachments/8','DELETE',query('')),null);
  assert.equal(collaborationRoute('issues/5/attachments/8','DELETE',query('')).kind,'delete-file');
  assert.deepEqual(JSON.parse(commentBody('edit-comment',{commentText:' a\n b ',expectedVersion:2})),{commentText:' a\n b ',expectedVersion:2});
  for(const body of [{commentText:' '},{commentText:'a'.repeat(10001)},{commentText:'a',userId:7}])assert.throws(()=>commentBody('comment',body));
  assert.throws(()=>commentBody('edit-comment',{commentText:'a',expectedVersion:null}));
});
test('multipart keeps real file content and rejects duplicate, extra and empty parts',async()=>{
  const parsed=await readAttachment(request('issues/5/attachments','POST',form()));assert.equal(await parsed.get('file').text(),'hello');
  for(const mutate of [f=>f.set('userId','7'),f=>f.append('file',new File(['second'],'b.txt')),f=>f.set('file',new File([],'empty.txt'))]){
    const f=form();mutate(f);await assert.rejects(readAttachment(request('issues/5/attachments','POST',f)),e=>e.status===400);
  }
});
test('multipart counts actual bytes even without Content-Length or with a false smaller length',async()=>{
  const data=new Uint8Array(MAX_ATTACHMENT_BYTES+65537);
  const stream=new ReadableStream({start(controller){controller.enqueue(data);controller.close();}});
  const req=new Request(origin,{method:'POST',duplex:'half',headers:{'content-type':'multipart/form-data; boundary=x','content-length':'1'},body:stream});
  await assert.rejects(readAttachment(req),e=>e.status===413);
  const f=new FormData();f.set('file',new File([new Uint8Array(MAX_ATTACHMENT_BYTES+1)],'too-large.txt'));
  await assert.rejects(readAttachment(request('issues/5/attachments','POST',f)),e=>e.status===413);
});
test('BFF requires Origin and access and rejects comment query/identity injection before upstream',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>assert.fail('Unexpected upstream'));
  assert.equal((await route(request('issues/5/comments','POST',JSON.stringify({commentText:'x',userId:7})))).status,400);
  assert.equal((await route(request('issues/5/comments','POST',JSON.stringify({commentText:'x'}),{origin:'https://evil.invalid'}))).status,403);
  assert.equal((await route(request('issues/5/comments','GET',undefined,{cookie:''}))).status,401);
  assert.equal((await route(request('issues/5/attachments/8?issueId=99','DELETE'))).status,400);
  assert.equal((await route(request('issues/0/comments','GET'))).status,400);
  assert.equal((await route(request('issues/attachments/8','DELETE'))).status,404);
  assert.equal(fetch.mock.callCount(),0);
});
test('BFF sends FormData without JSON Content-Type and preserves upload201, comment version and delete204',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{
    calls++;assert.equal(init.headers.Authorization,'Bearer test-access');
    if(url.endsWith('/attachments')){assert.ok(init.body instanceof FormData);assert.equal(init.headers['Content-Type'],undefined);assert.equal(await init.body.get('file').text(),'hello');return Response.json({attachmentId:8,issueId:5,fileName:'test.txt'},{status:201});}
    if(init.method==='PUT'){assert.deepEqual(JSON.parse(init.body),{commentText:'edited',expectedVersion:2});return Response.json({commentId:7,version:3});}
    assert.ok(url.endsWith('/comments/7?expectedVersion=2'));return new Response(null,{status:204});
  });
  assert.equal((await route(request('issues/5/attachments','POST',form()))).status,201);
  assert.equal((await route(request('issues/5/comments/7','PUT',JSON.stringify({commentText:'edited',expectedVersion:2})))).status,200);
  assert.equal((await route(request('issues/5/comments/7?expectedVersion=2','DELETE'))).status,204);assert.equal(calls,3);
});
test('storage errors are preserved without retry or changing session cookies',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({message:'storage failed'},{status:502}));
  const result=await route(request('issues/5/attachments/8','DELETE'));assert.equal(result.status,502);assert.equal(result.headers.getSetCookie().length,0);assert.equal(fetch.mock.callCount(),1);
});
test('local binary content is scoped, bounded and never fetched by arbitrary URL',async t=>{
  assert.equal(collaborationRoute('issues/5/attachments/8/content','GET',query('')).write,false);
  assert.throws(()=>collaborationRoute('issues/5/attachments/8/content','GET',query('url=https://evil.invalid')));
  const fetch=t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'http://127.0.0.1:8080/api/issues/5/attachments/8/content');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="a.png"'}});});
  const result=await route(request('issues/5/attachments/8/content'));assert.equal(result.status,200);assert.equal(result.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(result.headers.get('Content-Type'),'image/png');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),new Uint8Array([1,2,3]));assert.equal(fetch.mock.callCount(),1);
  await assert.rejects(readAttachmentContent(new Response(new Uint8Array(MAX_ATTACHMENT_BYTES+1))),e=>e.status===413);
});
test('client multipart mutation probes actor and dispatches once without forcing JSON or replaying401',async()=>{
  const previous=['navigator','localStorage'].map(k=>Object.getOwnPropertyDescriptor(globalThis,k)),oldFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,work)=>work()}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
  let writes=0;
  try{
    globalThis.fetch=async(url,init)=>{if(url.endsWith('/auth/me'))return Response.json({user:{id:7}});writes++;assert.ok(init.body instanceof FormData);assert.equal(init.headers['Content-Type'],undefined);return new Response(null,{status:401});};
    await assert.rejects(connectedMutation('issues/5/attachments',7,{method:'POST',body:form()}),e=>e.status===401);assert.equal(writes,1);
  }finally{globalThis.fetch=oldFetch;['navigator','localStorage'].forEach((k,i)=>previous[i]?Object.defineProperty(globalThis,k,previous[i]):delete globalThis[k]);}
});
