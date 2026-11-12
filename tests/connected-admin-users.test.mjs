import test from 'node:test';
import assert from 'node:assert/strict';
import {adminUserRoute,adminUserBody,userFrom,userPageFrom} from '../src/features/connected/admin-users/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';
import {adminUserMutation} from '../src/features/connected/client.ts';
const origin='http://localhost:3131',q=v=>new URLSearchParams(v);
const request=(path,method='GET',body,headers={})=>new Request(origin+'/api/backend/'+path,{method,body,headers:{origin,cookie:'jira_access=test-access;jira_refresh=test-refresh',...headers}});
const route=req=>backendRoute(req,new URL(req.url).pathname.split('/api/backend/')[1].split('/'));
const row={userId:2,userName:'alice',fullName:null,email:'alice@test.invalid',enabled:true,createdAt:null,roles:[{role:7,roleName:'SYSTEM_ADMIN'}],projectMembershipCount:2};

test('admin users route scopes list/detail/pair actions and validates filters without accepting actor or extra paths',()=>{
  for(const [path,method,kind] of [['admin/users','GET','list'],['admin/users/2','GET','detail'],['admin/users/2/roles','GET','roles'],['admin/users/2/roles/7','PUT','grant'],['admin/users/2/roles/7','DELETE','revoke'],['admin/users/2/enabled','PATCH','enabled']])assert.equal(adminUserRoute(path,method,q('')).kind,kind);
  for(const query of ['actorId=9','page=-1','size=0','size=101','page=2147483647&size=20','enabled=yes','enabled=true&enabled=false','keyword='+'a'.repeat(101)])assert.throws(()=>adminUserRoute('admin/users','GET',q(query)));
  for(const path of ['admin/users/0','admin/users/2147483648','admin/users/2/roles/-1'])assert.throws(()=>adminUserRoute(path,'GET',q('')));
  assert.equal(adminUserRoute('admin/users/2','DELETE',q('')),null);
  assert.equal(adminUserRoute('admin/users/2/roles/7/extra','PUT',q('')),null);
  assert.throws(()=>adminUserRoute('admin/users/2/enabled','PATCH',q('isSelf=true')));
});
test('enabled has exactly one real boolean; global role pair has no body and DTO strips unexpected sensitive fields',()=>{
  assert.deepEqual(JSON.parse(adminUserBody('enabled','{"enabled":false}')),{enabled:false});
  for(const raw of ['{}','{"enabled":null}','{"enabled":"false"}','{"enabled":false,"actorId":9}','[]'])assert.throws(()=>adminUserBody('enabled',raw));
  assert.throws(()=>adminUserBody('grant','{"roleId":7}'));assert.equal(adminUserBody('grant',''),undefined);
  assert.deepEqual(userFrom({...row,passwordHash:'never-keep'}),row);
  assert.throws(()=>userFrom({...row,projectMembershipCount:null}));assert.throws(()=>userFrom({...row,roles:[{roleId:7}]}));
  assert.equal(userPageFrom({items:[row],page:0,size:20,totalItems:1,totalPages:1}).items.length,1);
  assert.throws(()=>userPageFrom({items:[],page:0,size:0,totalItems:0,totalPages:0}));
});
test('BFF rejects CSRF/missing cookie/body and ID injection before probe or mutation',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>assert.fail('no upstream'));
  for(const [path,method,body,status,headers] of [['admin/users','GET',undefined,401,{cookie:''}],['admin/users/2/enabled','PATCH','{"enabled":false}',403,{origin:'https://evil.invalid'}],['admin/users/2/enabled','PATCH','{"enabled":false,"isSelf":true}',400],['admin/users/2/roles/7','PUT','{"roleIds":[7]}',400],['admin/users?keyword=x&roleId=7','GET',undefined,400]])assert.equal((await route(request(path,method,body,headers))).status,status);
  assert.equal(mock.mock.callCount(),0);
});
test('BFF list forwards bounded query/Bearer and enabled=true/role actions preserve204 without clearing actor cookies',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push(url);assert.equal(init.headers.Authorization,'Bearer test-access');return init.method==='GET'?Response.json({items:[row],page:0,size:20,totalItems:1,totalPages:1}):new Response(null,{status:204});});
  assert.equal((await route(request('admin/users?keyword=alice&enabled=true','GET'))).status,200);
  for(const [path,method,body] of [['admin/users/2/enabled','PATCH','{"enabled":true}'],['admin/users/2/roles/7','PUT'],['admin/users/2/roles/7','DELETE']]){
    const r=await route(request(path,method,body));assert.equal(r.status,204);assert.equal(r.headers.getSetCookie().length,0);
  }assert.equal(calls.length,4);assert.ok(calls[0].endsWith('/admin/users?keyword=alice&enabled=true'));
});
test('BFF determines self from authenticated probe, clears cookies on self204, retains cookies for another target',async t=>{
  let writes=0;t.mock.method(globalThis,'fetch',async(url,init)=>{if(url.endsWith('/auth/me'))return Response.json({user:{id:2}});writes++;assert.equal(init.method,'PATCH');return new Response(null,{status:204});});
  let r=await route(request('admin/users/2/enabled','PATCH','{"enabled":false}'));assert.equal(r.status,204);assert.equal(r.headers.get('X-Jira-Session-Cleared'),'1');assert.equal(r.headers.getSetCookie().length,2);
  r=await route(request('admin/users/3/enabled','PATCH','{"enabled":false}'));assert.equal(r.status,204);assert.equal(r.headers.getSetCookie().length,0);assert.equal(writes,2);
});
test('BFF last-admin409 keeps session, uncertain self outcome clears it, failed probe never sends write',async t=>{
  let status=409,probe=200,writes=0;t.mock.method(globalThis,'fetch',async url=>{if(url.endsWith('/auth/me'))return Response.json(probe===200?{user:{id:2}}:{message:'bad'},{status:probe});writes++;return Response.json({message:'do not leak SQL'},{status});});
  let r=await route(request('admin/users/2/enabled','PATCH','{"enabled":false}'));assert.equal(r.status,409);assert.equal(r.headers.getSetCookie().length,0);
  status=503;r=await route(request('admin/users/2/enabled','PATCH','{"enabled":false}'));assert.equal(r.status,502);assert.equal(r.headers.get('X-Jira-Session-Cleared'),'1');
  probe=403;r=await route(request('admin/users/2/enabled','PATCH','{"enabled":false}'));assert.equal(r.status,403);assert.equal(writes,2);
});

/** Chỉ transport giả cho các nhánh session xác định; browser/DB tests kiểm thêm ứng dụng thật. */
async function sessionEnvironment(run){
  const names=['fetch','navigator','localStorage','window'],old=names.map(n=>Object.getOwnPropertyDescriptor(globalThis,n)),data=new Map();let queue=Promise.resolve();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(_key,action){const pending=queue.then(action);queue=pending.catch(()=>{});return pending;}}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
  let events=0;Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>{events++;}}});
  try{await run({data,events:()=>events});}finally{names.forEach((n,i)=>old[i]?Object.defineProperty(globalThis,n,old[i]):delete globalThis[n]);}
}
test('client self-disable204 ends session without probing revoked JWT afterward',async()=>{
  await sessionEnvironment(async h=>{
    let probes=0,writes=0,ended='';globalThis.fetch=async url=>{if(url.endsWith('/auth/me')){probes++;return Response.json({user:{id:2}});}writes++;return new Response(null,{status:204,headers:{'X-Jira-Session-Cleared':'1'}});};
    const result=await adminUserMutation('admin/users/2/enabled',2,{method:'PATCH',body:'{"enabled":false}'},()=>true,v=>ended=v);
    assert.equal(result.ended,true);assert.equal(ended,'disabled');assert.equal(probes,1);assert.equal(writes,1);assert.equal(h.events(),1);assert.equal(h.data.has('jira_password_session_revision'),true);
  });
});
test('client self-disable lost response sends once, marks pending logout and never reports confirmed disabled',async()=>{
  await sessionEnvironment(async h=>{
    let writes=0,ended='';globalThis.fetch=async url=>{if(url.endsWith('/auth/me'))return Response.json({user:{id:2}});writes++;throw new Error('lost response');};
    await adminUserMutation('admin/users/2/enabled',2,{method:'PATCH',body:'{"enabled":false}'},()=>true,v=>ended=v);
    assert.equal(writes,1);assert.equal(ended,'uncertain');assert.equal(h.data.get('jira_logout_pending'),'1');
  });
});
test('client self-disable409 preserves active session and other-user disable204 never ends admin session',async()=>{
  await sessionEnvironment(async h=>{
    let status=409;globalThis.fetch=async url=>url.endsWith('/auth/me')?Response.json({user:{id:2}}):new Response(null,{status});
    await assert.rejects(adminUserMutation('admin/users/2/enabled',2,{method:'PATCH',body:'{"enabled":false}'},()=>true,()=>assert.fail('must retain session')),e=>e.status===409);
    status=204;assert.equal((await adminUserMutation('admin/users/3/enabled',2,{method:'PATCH',body:'{"enabled":false}'},()=>true,()=>assert.fail('not self'))).ended,false);
    assert.equal(h.events(),0);assert.equal(h.data.has('jira_logout_pending'),false);
  });
});
test('client never sends admin mutation with replacement actor after waiting for session lock',async()=>{
  await sessionEnvironment(async()=>{
    let writes=0;globalThis.fetch=async url=>{if(url.endsWith('/auth/me'))return Response.json({user:{id:9}});writes++;return new Response(null,{status:204});};
    await assert.rejects(adminUserMutation('admin/users/3/roles/7',2,{method:'PUT'},()=>true,()=>assert.fail()),e=>e.status===409);assert.equal(writes,0);
  });
});


import fs from 'node:fs';
import {createRequire} from 'node:module';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import * as transport from '../src/features/connected/client.ts';
const require=createRequire(import.meta.url),ts=require('typescript');

/** Gọi hook production với QueryClient và transport thật; chỉ giả hooks React, context và fetch để điều khiển thứ tự. */
async function adminWriteHarness(run,{identity=8,status=204,afterWriteIdentity,contextAdmin=true,activeError=false}={}){
  await sessionEnvironment(async()=>{
    const qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:20}}}),state=[],toasts=[],key=['connected','admin-users',8,'list',''];
    const account=()=>({user:{userId:identity},systemAdmin:contextAdmin,globalPermissions:[],projectId:null,projectPermissions:[]});
    let writes=0,reads=0;
    qc.setQueryData(['connected','session'],{...account(),systemAdmin:true});qc.setQueryData(['connected','config-gate',8],{...account(),systemAdmin:true});qc.setQueryData(key,{actor:8});
    globalThis.fetch=async(url,init)=>{
      if(url.endsWith('/auth/me'))return Response.json({user:{id:identity}});
      writes++;if(afterWriteIdentity!==undefined)identity=afterWriteIdentity;
      return status>=400?Response.json({message:'Rejected'},{status}):new Response(null,{status});
    };
    const observer=new QueryObserver(qc,{queryKey:key,staleTime:Infinity,queryFn:async()=>{reads++;if(activeError)throw new Error('Active read failed');return {actor:identity};}}),unsubscribe=observer.subscribe(()=>{});
    const read=async(actor)=>transport.withSessionLock(async()=>{
      const probe=await transport.connectedRequest('auth/me',undefined,false);
      if(probe.user.id!==actor)throw new transport.ConnectedError(409,'Actor changed');
      return account();
    });
    const source=ts.transpileModule(fs.readFileSync(new URL('../src/features/connected/admin-users/queries.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const dependencies={
      react:{useRef:value=>({current:value}),useState:value=>{const index=state.length;state.push(typeof value==='function'?value():value);return [state[index],next=>state[index]=next];}},
      '@tanstack/react-query':{useQueryClient:()=>qc},'next/navigation':{useRouter:()=>({replace:()=>{}})},sonner:{toast:{success:message=>toasts.push(message),warning:message=>toasts.push(message)}},
      '../client':transport,'../session':{useSession:()=>({data:{user:{userId:8}}})},'../projects/queries':{useProjectMutationScope:()=>()=>()=>true},
      '../configuration/queries':{configurationRead:read,configGateKey:actor=>['connected','config-gate',actor]},'./contract':{userFrom,userPageFrom}
    };
    const module={exports:{}};new Function('require','module','exports',source)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},module,module.exports);
    try{await run({hook:module.exports.useAdminUserWrite(),qc,key,state,toasts,writes:()=>writes,reads:()=>reads});}
    finally{unsubscribe();qc.clear();}
  });
}
test('admin write refreshes active data but ignores inactive historical errors on successful completion',async()=>{
  await adminWriteHarness(async h=>{
    await h.qc.fetchQuery({queryKey:['connected','issue',8,2,404],queryFn:async()=>{throw new Error('Old404');}}).catch(()=>{});
    let done=0;await h.hook.run('admin/users/2/roles/7',{method:'PUT'},()=>true,()=>done++);
    assert.equal(done,1);assert.equal(h.writes(),1);assert.equal(h.reads(),1);
    assert.equal(h.qc.getQueryData(['connected','admin-users',8,'uncertain']),false);
  });
});
test('admin write403/409 after cookie replacement never refetches old actor data or completes',async()=>{
  for(const status of [403,409])await adminWriteHarness(async h=>{
    await h.hook.run('admin/users/2/roles/7',{method:'PUT'},()=>true,()=>assert.fail('Wrong actor'));
    assert.equal(h.writes(),1);assert.equal(h.reads(),0);assert.equal(h.qc.getQueryData(h.key).actor,8);assert.equal(h.state[2],true);
  },{status,afterWriteIdentity:9});
});
test('admin context loss after self-revoke drops admin-user cache without ending authentication',async()=>{
  await adminWriteHarness(async h=>{
    let done=0;await h.hook.run('admin/users/8/roles/7',{method:'DELETE'},()=>true,()=>done++);
    assert.equal(h.writes(),1);assert.equal(h.reads(),0);assert.equal(done,0);
    assert.equal(h.qc.getQueryData(['connected','session']).user.userId,8);
    assert.equal(h.qc.getQueryData(['connected','session']).systemAdmin,false);assert.equal(h.qc.getQueryData(h.key),undefined);
  },{contextAdmin:false});
});
test('admin post-commit active refetch failure leaves persistent uncertainty latch and no completion',async()=>{
  await adminWriteHarness(async h=>{
    await h.hook.run('admin/users/2/roles/7',{method:'PUT'},()=>true,()=>assert.fail('Active read failed'));
    assert.equal(h.writes(),1);assert.equal(h.reads(),1);assert.equal(h.state[2],true);
    assert.equal(h.qc.getQueryData(['connected','admin-users',8,'uncertain']),true);
    assert.equal(h.qc.getQueryCache().find({queryKey:['connected','admin-users',8,'uncertain'],exact:true}).options.gcTime,Infinity);
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(h.qc.getQueryData(['connected','admin-users',8,'uncertain']),true,'latch survives inactive query garbage collection');
  },{activeError:true});
});
