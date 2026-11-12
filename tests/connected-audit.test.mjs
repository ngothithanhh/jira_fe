import test from 'node:test';
import assert from 'node:assert/strict';
import {auditQuery,auditRoute,auditPageFrom,emptyFilter} from '../src/features/connected/audit/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';

test('audit filters keep database dates, normalize action and separate the two scopes',()=>{
  const filter={...emptyFilter,projectId:'4',entityType:'ISSUE',entityId:'7',action:' delete ',from:'2024-02-29',to:'2024-02-29'};
  const query=auditQuery(filter);
  const params=new URLSearchParams(query.split('?')[1]);
  assert.match(query,/^admin\/audit-logs\?/);
  assert.deepEqual(Object.fromEntries(params),{page:'0',size:'20',entityType:'ISSUE',entityId:'7',action:'DELETE',createdFrom:'2024-02-29T00:00:00',createdTo:'2024-02-29T23:59:59.999999',projectId:'4'});
  assert.match(auditQuery(filter,0,20,8),/^projects\/8\/audit-logs\?/);
  assert.doesNotMatch(auditQuery(filter,0,20,8),/projectId=/);
  for(const change of [{from:'2023-02-29'},{to:'2024-02-28'},{systemOnly:true,actorId:'1'},{entityType:''}])
    assert.throws(()=>auditQuery({...filter,...change}));
});

test('audit route validates query shape and date precision, and rejects unsupported methods',()=>{
  for(const value of ['projectId=1','actorId=2&actorId=3','entityId=9','entityType=PASSWORD','entityType=ISSUE&entityId=2147483648',
    'actorId=1&systemOnly=true','page=2147483647&size=2','size=0','size=101','page=-1','token=no','action=%20',
    'createdFrom=2025-01-01T00:00:00Z','createdFrom=2025-01-01T00:00:00.000002&createdTo=2025-01-01T00:00:00.000001'])
    assert.throws(()=>auditRoute('projects/1/audit-logs','GET',new URLSearchParams(value)),value);
  assert.deepEqual(auditRoute('admin/audit-logs','GET',new URLSearchParams('page=2147483647&size=1')),{suffix:'?page=2147483647&size=1'});
  assert.equal(auditRoute('projects/1/audit-logs','DELETE',new URLSearchParams()),null);
  assert.equal(auditRoute('admin/audit-logs/1','GET',new URLSearchParams()),null);
});

const row={auditId:1,actorId:null,actorName:null,action:'DELETE',entityType:'ISSUE',entityId:6,description:'Text',createdAt:'2026-01-01T10:59:59.123456',projectId:3};
const page={items:[row],page:1,size:1,totalItems:5,totalPages:5};
test('audit DTO keeps null actors, dates and pagination; drops fields outside the contract',()=>{
  assert.deepEqual(auditPageFrom({...page,items:[{...row,password:'no'}]},3),page);
  assert.deepEqual(auditPageFrom({...page,items:[{...row,projectId:null,entityId:null}]}).items[0].entityId,null);
  for(const changes of [{projectId:4},{projectId:null},{actorId:'7'},{auditId:'1'},{createdAt:'2026-01-01T24:00:00'},{description:3}])
    assert.throws(()=>auditPageFrom({...page,items:[{...row,...changes}]},3));
  assert.throws(()=>auditPageFrom({...page,size:0},3));
});

const call=(path,method='GET',cookie='jira_access=bound-token')=>backendRoute(
  new Request('http://localhost:3131/api/backend/'+path,{method,headers:{cookie,authorization:'Bearer forged'}}),
  path.split('?')[0].split('/')
);
test('audit BFF rejects bad queries and writes before upstream; no credential uses 401',async t=>{
  const upstream=t.mock.method(globalThis,'fetch',async()=>assert.fail('unexpected upstream'));
  assert.equal((await call('projects/1/audit-logs?projectId=2')).status,400);
  assert.equal((await call('admin/audit-logs?actorId=2&actorId=3')).status,400);
  assert.equal((await call('admin/audit-logs','POST')).status,404);
  assert.equal((await call('admin/audit-logs','GET','')).status,401);
  assert.equal(upstream.mock.callCount(),0);
});

test('audit BFF forwards cookie Bearer, keeps statuses and returns private/no-store',async t=>{
  let status=200;
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    assert.match(url,/\/projects\/3\/audit-logs\?size=1$/);
    assert.deepEqual(init.headers,{Authorization:'Bearer bound-token'});
    assert.equal(init.cache,'no-store');
    assert.equal(init.redirect,'error');
    return Response.json(status===200?page:{message:'Denied'},{status});
  });
  for(status of [200,400,401,403,404,503]){
    const response=await call('projects/3/audit-logs?size=1');
    assert.equal(response.status,status);
    assert.match(response.headers.get('cache-control'),/no-store.*private/);
    assert.equal(response.headers.get('vary'),'Cookie');
    if(status===200)assert.deepEqual(await response.json(),page);
  }
});
