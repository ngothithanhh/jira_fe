import test from 'node:test';
import assert from 'node:assert/strict';
import {adminRoleRoute,roleBody,rolesFrom,permissionsFrom} from '../src/features/connected/admin-roles/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';
const origin='http://localhost:3131';
const request=(path,method='GET',body,headers={})=>new Request(origin+'/api/backend/'+path,{method,body,headers:{origin,cookie:'jira_access=access',...headers}});
const route=req=>backendRoute(req,new URL(req.url).pathname.split('/api/backend/')[1].split('/'));
test('R1 role contract only opens bounded catalog and CRUD, no matrix or grant route',()=>{
 for(const [p,m]of [['admin/roles','GET'],['permissions','GET'],['user-role','POST'],['user-role/4','PUT'],['user-role/4','DELETE']])assert.ok(adminRoleRoute(p,m,new URLSearchParams()));
 assert.equal(adminRoleRoute('roles/4/permissions','PUT',new URLSearchParams()),null);
 for(const id of ['0','-1','2147483648'])assert.throws(()=>adminRoleRoute('user-role/'+id,'DELETE',new URLSearchParams()));
 assert.throws(()=>adminRoleRoute('admin/roles','GET',new URLSearchParams('actor=4')));
});
test('role payload normalizes but cannot inject scope/permissions or invalid codes',()=>{
 assert.equal(roleBody('create','{"roleName":" reviewer "}'),'{"roleName":"REVIEWER"}');
 for(const body of ['{"roleName":"a","scope":"GLOBAL"}','{"roleName":"1X"}','{"roleName":"x x"}','null','[]'])assert.throws(()=>roleBody('create',body));
 assert.throws(()=>roleBody('delete','{}'));assert.equal(roleBody('delete',''),undefined);
});
test('catalog rejects bad counts and duplicate canonical permission codes without fabricating fields',()=>{
 const role={role:1,roleName:'REVIEWER',scope:'PROJECT',reservedName:false,editablePermissions:true,globalAssignmentCount:0,projectAssignmentCount:2};
 assert.deepEqual(rolesFrom([{...role,passwordHash:'never'}]),[role]);
 assert.throws(()=>rolesFrom([{...role,projectAssignmentCount:null}]));
 assert.throws(()=>rolesFrom([role,role]));
 assert.throws(()=>permissionsFrom([{permissionId:1,permissionName:'EDIT_ISSUE'},{permissionId:2,permissionName:' edit_issue '}]));
});
test('role BFF rejects forged origin, extra query/body before contacting backend',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>assert.fail('unexpected upstream'));
 for(const [p,m,b,h,status]of [['user-role','POST','{"roleName":"REVIEWER"}',{origin:'https://evil.invalid'},403],['user-role','POST','{"roleName":"R","actorId":3}',{},400],['user-role/3','DELETE','{}',{},400],['admin/roles?actorId=3','GET',undefined,{},400],['permissions','POST','{}',{},404]])
 assert.equal((await route(request(p,m,b,h))).status,status);
 assert.equal(mock.mock.callCount(),0);
});
test('role BFF preserves create201/delete204 and sends only normalized name with cookie Bearer',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return init.method==='DELETE'?new Response(null,{status:204}):Response.json({role:9,roleName:'REVIEWER'},{status:201});});
 assert.equal((await route(request('user-role','POST','{"roleName":" reviewer "}'))).status,201);
 assert.equal(calls[0].init.headers.Authorization,'Bearer access');assert.equal(calls[0].init.body,'{"roleName":"REVIEWER"}');
 assert.equal((await route(request('user-role/9','DELETE'))).status,204);
});
