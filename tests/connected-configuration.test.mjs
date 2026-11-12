import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationRoute,configurationBody,projectTypeFrom} from '../src/features/connected/configuration/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';
const q=s=>new URLSearchParams(s),origin='http://localhost:3131';
const request=(path,method='GET',body,headers={})=>new Request(origin+'/api/backend/'+path,{method,body,headers:{origin,cookie:'jira_access=test-access',...headers}});
const route=req=>backendRoute(req,new URL(req.url).pathname.split('/api/backend/')[1].split('/'));
test('configuration routes distinguish global names and project-scoped assignment/default without arbitrary queries',()=>{
  for(const [path,method,kind] of [['issue-types','POST','type'],['issue-statuses/3','PUT','status'],['workflows/rules','POST','rule'],['projects/2/issue-types/4','POST','assign'],['projects/2/issue-types/4/default','PUT','default'],['projects/2/issue-types/4','DELETE','delete']])assert.equal(configurationRoute(path,method,q('')).kind,kind);
  assert.equal(configurationRoute('projects/2/issue-types/4','POST',q('isDefault=true')).projectId,2);
  for(const query of ['actorId=1','isDefault=x','isDefault=true&isDefault=false'])assert.throws(()=>configurationRoute('projects/2/issue-types/4','POST',q(query)));
  assert.throws(()=>configurationRoute('issue-types','GET',q('projectId=3')));
  assert.throws(()=>configurationRoute('issue-types/2147483648','PUT',q('')));
  assert.equal(configurationRoute('workflows/rules/3','PUT',q('')),null);
});
test('names are trimmed and bounded, statuses require real categories, workflow IDs are distinct positive integers',()=>{
  assert.deepEqual(JSON.parse(configurationBody('type',{typeName:' Task '})),{typeName:'Task'});
  assert.deepEqual(JSON.parse(configurationBody('status',{statusName:' Review ',statusCategory:'IN_PROGRESS'})),{statusName:'Review',statusCategory:'IN_PROGRESS'});
  for(const [kind,body] of [['type',{typeName:' '}],['type',{typeName:'a'.repeat(51)}],['type',{typeName:'x',color:'red'}],['status',{statusName:'x',statusCategory:'OTHER'}],['rule',{fromStatusId:1,toStatusId:1}],['rule',{fromStatusId:0,toStatusId:2}],['rule',{fromStatusId:1,toStatusId:'2'}],['rule',{fromStatusId:1,toStatusId:2,actorId:4}]])assert.throws(()=>configurationBody(kind,body));
});
test('project default from Lombok response is normalized for settings and issue creation',()=>{
  assert.deepEqual(projectTypeFrom({projectId:2,issueTypeId:4,issueTypeName:'Bug',default:true}),{projectId:2,issueTypeId:4,issueTypeName:'Bug',isDefault:true});
  assert.equal(projectTypeFrom({projectId:2,issueTypeId:4,issueTypeName:'Bug',isDefault:false}).isDefault,false);
  assert.throws(()=>projectTypeFrom({projectId:2,issueTypeId:4,issueTypeName:'Bug',default:'true'}));
});
test('BFF rejects CSRF, injected bodies and unknown fields before any upstream request',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>assert.fail('Unexpected upstream'));
  for(const [path,method,body,status,headers] of [['issue-types','POST','{"typeName":"x"}',403,{origin:'https://evil.invalid'}],['workflows/rules','POST','{"fromStatusId":1,"toStatusId":1}',400],['issue-statuses','POST','{"statusName":"x","statusCategory":"DONE","actorId":7}',400],['projects/2/issue-types/4','POST','{"isDefault":true}',400],['issue-types','GET',undefined,401,{cookie:''}]]){
    assert.equal((await route(request(path,method,body,headers))).status,status);
  }assert.equal(mock.mock.callCount(),0);
});
test('BFF preserves workflow201, deletion204 and project query and never retries writes',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async(url,init)=>{
    assert.equal(init.headers.Authorization,'Bearer test-access');
    if(url.endsWith('/workflows/rules')){assert.deepEqual(JSON.parse(init.body),{fromStatusId:1,toStatusId:2});return Response.json({ruleId:3},{status:201});}
    if(init.method==='POST')assert.ok(url.endsWith('/projects/2/issue-types/4?isDefault=true'));
    return new Response(null,{status:204});
  });
  assert.equal((await route(request('workflows/rules','POST','{"fromStatusId":1,"toStatusId":2}'))).status,201);
  assert.equal((await route(request('projects/2/issue-types/4?isDefault=true','POST'))).status,204);
  assert.equal((await route(request('issue-types/4','DELETE'))).status,204);
  assert.equal(mock.mock.callCount(),3);
});
test('configuration conflict is409, server failure remains503, neither clears cookies',async t=>{
  let status=409;const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({message:'private SQL'},{status}));
  let r=await route(request('issue-statuses/2','PUT','{"statusName":"Done","statusCategory":"TO_DO"}'));
  assert.equal(r.status,409);assert.ok(!(await r.text()).includes('private SQL'));assert.equal(r.headers.getSetCookie().length,0);
  status=503;r=await route(request('issue-types','POST','{"typeName":"x"}'));assert.equal(r.status,503);assert.equal(mock.mock.callCount(),2);
});


import fs from 'node:fs';
import {createRequire} from 'node:module';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import * as client from '../src/features/connected/client.ts';
const require=createRequire(import.meta.url),ts=require('typescript');

/** Chạy hook mutation thật với hook React tối giản; QueryClient, session lock và transport guard giữ code production. */
async function configurationHarness(run,{status=204,switchAfterWrite=false,activeError=false}={}){
  const originalFetch=globalThis.fetch,originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let queue=Promise.resolve(),identity=8,writes=0,reads=0;const state=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(_key,action){const pending=queue.then(action);queue=pending.catch(()=>{});return pending;}}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
  globalThis.fetch=async(url,init)=>{if(url.endsWith('/auth/me'))return Response.json({user:{id:identity}});writes++;if(switchAfterWrite)identity=9;return status>=400?Response.json({message:'rejected'},{status}):new Response(null,{status});};
  const qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}}),key=['connected','project',8,2];
  const context=()=>({user:{userId:identity},systemAdmin:true,projectPermissions:[]});
  qc.setQueryData(['connected','session'],{user:{userId:8}});qc.setQueryData(key,{context:context()});
  const observer=new QueryObserver(qc,{queryKey:key,staleTime:Infinity,queryFn:async()=>{reads++;if(activeError)throw new Error('active refetch failed');return {context:context()};}});
  const unsubscribe=observer.subscribe(()=>{});
  const source=fs.readFileSync(new URL('../src/features/connected/configuration/queries.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const dependencies={
    react:{useRef:value=>({current:value}),useState:value=>{const index=state.length;state.push(value);return [value,next=>{state[index]=next;}];}},
    '@tanstack/react-query':{useQueryClient:()=>qc},
    '../client':client,'../session':{useSession:()=>({data:{user:{userId:8}}})},
    '../projects/queries':{useProjectMutationScope:()=>()=>()=>true,projectKeys:{detail:()=>key}},
    './contract':{projectTypeFrom}
  };
  const module={exports:{}};new Function('require','module','exports',compiled)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},module,module.exports);
  try{await run({qc,key,state,hook:module.exports.useConfigurationWrite(2),switchActor:value=>{identity=value;},reads:()=>reads,writes:()=>writes});}
  finally{unsubscribe();qc.clear();globalThis.fetch=originalFetch;for(const [name,descriptor]of [['navigator',originalNavigator],['localStorage',originalStorage]])descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
}
test('configuration error completion never refetches old actor caches after cookie changes',async()=>{
  await configurationHarness(async h=>{
    let release;const held=client.withSessionLock(()=>new Promise(resolve=>{release=resolve;}));await Promise.resolve();
    const pending=h.hook.run('projects/2/issue-types/4/default',{method:'PUT'},()=>assert.fail('cannot complete under actor9'));
    h.switchActor(9);release();await held;await pending;
    assert.equal(h.writes(),0);assert.equal(h.reads(),0);assert.equal(h.qc.getQueryData(h.key).context.user.userId,8);assert.equal(h.state[2],true);
    assert.equal(h.qc.getQueryState(h.key).isInvalidated,true);
  });
});
test('inactive historical query error cannot lock a configuration save whose active refresh succeeded',async()=>{
  await configurationHarness(async h=>{
    await h.qc.fetchQuery({queryKey:['connected','issue',8,2,404],queryFn:async()=>{throw new Error('old missing issue');}}).catch(()=>{});
    let completed=0;await h.hook.run('projects/2/issue-types/4/default',{method:'PUT'},()=>completed++);
    assert.equal(h.writes(),1);assert.equal(h.reads(),1);assert.equal(completed,1);assert.equal(h.state[2],false);
    assert.equal(h.qc.getQueryState(['connected','issue',8,2,404]).status,'error');
  });
});


test('403/409 response under replacement cookie only marks old actor cache stale',async()=>{
 for(const status of [403,409])await configurationHarness(async h=>{
  await h.hook.run('projects/2/issue-types/4/default',{method:'PUT'},()=>assert.fail('cannot complete under actor9'));
  assert.equal(h.writes(),1);assert.equal(h.reads(),0);assert.equal(h.qc.getQueryData(h.key).context.user.userId,8);assert.equal(h.state[2],true);
 },{status,switchAfterWrite:true});
});

test('active refetch error after commit requires reload and does not complete the form',async()=>{
 await configurationHarness(async h=>{
  await h.hook.run('projects/2/issue-types/4/default',{method:'PUT'},()=>assert.fail('active read failed'));
  assert.equal(h.writes(),1);assert.equal(h.reads(),1);assert.equal(h.state[2],true);
 },{activeError:true});
});
