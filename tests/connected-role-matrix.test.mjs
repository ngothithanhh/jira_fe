import test from 'node:test';
import assert from 'node:assert/strict';
import {beginDraft,togglePermission,legacyIds,replacePayload,sameIds} from '../src/features/connected/admin-roles/matrix-model.ts';
import {adminRoleRoute,roleBody,matrixFrom} from '../src/features/connected/admin-roles/contract.ts';
import {backendRoute} from '../src/features/connected/server.ts';
const role={role:7,roleName:'REVIEWER',permissionIds:[1,9]};
const view={permissionId:1,permissionName:'VIEW_PROJECT',assignableToProjectRole:true,memberAlwaysAllowed:true};
const edit={permissionId:2,permissionName:'EDIT_ISSUE',assignableToProjectRole:true,memberAlwaysAllowed:false};
const legacy={permissionId:9,permissionName:'DELETE_USER',assignableToProjectRole:false,memberAlwaysAllowed:false};
test('matrix draft snapshots do not change with background data and toggle only supported project grants',()=>{
 const draft=beginDraft(role);role.permissionIds.push(2);
 assert.deepEqual(draft.expectedPermissionIds,[1,9]);assert.deepEqual(draft.permissionIds,[1,9]);
 assert.equal(togglePermission(draft,view),draft);assert.equal(togglePermission(draft,legacy),draft);
 const changed=togglePermission(draft,edit);assert.deepEqual(changed.permissionIds,[1,2,9]);assert.deepEqual(draft.permissionIds,[1,9]);
 assert.ok(sameIds(togglePermission(changed,edit).permissionIds,draft.permissionIds));
 role.permissionIds.pop();
});
test('legacy cleanup is explicit and payload preserves stored view while dropping only confirmed invalid grants',()=>{
 const draft=beginDraft(role),catalog=[view,edit,legacy];
 assert.deepEqual(legacyIds(draft,catalog),[9]);assert.throws(()=>replacePayload(draft,catalog,false));
 assert.deepEqual(replacePayload(draft,catalog,true),{expectedPermissionIds:[1,9],permissionIds:[1]});
 assert.deepEqual(replacePayload(beginDraft({...role,permissionIds:[]}),catalog,false).permissionIds,[]);
});
test('matrix parses real stored grants without inventing effective/default grants',()=>{
 const r={role:4,roleName:'DEVELOPER',scope:'PROJECT',reservedName:true,editablePermissions:true,globalAssignmentCount:3,projectAssignmentCount:2,permissionIds:[8]};
 const p={permissionId:8,permissionName:'EDIT_ISSUE',supported:true,assignableToProjectRole:true,memberAlwaysAllowed:false};
 assert.deepEqual(matrixFrom({roles:[r],permissions:[p]}),{roles:[r],permissions:[p]});
 assert.throws(()=>matrixFrom({roles:[{...r,permissionIds:[999]}],permissions:[p]}));
 assert.throws(()=>matrixFrom({roles:[r],permissions:[{...p,memberAlwaysAllowed:true}]}));
 assert.throws(()=>matrixFrom({roles:[{...r,scope:'GLOBAL'}],permissions:[p]}));
});
test('matrix PUT accepts empty sets and rejects injections, coerced/duplicate IDs and oversized arrays',()=>{
 assert.deepEqual(JSON.parse(roleBody('replace','{"expectedPermissionIds":[8,1],"permissionIds":[]}')),{expectedPermissionIds:[1,8],permissionIds:[]});
 for(const body of [
 {expectedPermissionIds:[],permissionIds:[1,1]},{expectedPermissionIds:[],permissionIds:['1']},
 {expectedPermissionIds:[],permissionIds:[1.2]},{expectedPermissionIds:[],permissionIds:[0]},
 {expectedPermissionIds:[],permissionIds:[1],roleId:4},{expectedPermissionIds:[],permissionIds:Array.from({length:1001},(_,i)=>i+1)}
 ])assert.throws(()=>roleBody('replace',JSON.stringify(body)));
 assert.throws(()=>adminRoleRoute('roles/0/permissions','PUT',new URLSearchParams()));
 assert.throws(()=>adminRoleRoute('roles/4/permissions','PUT',new URLSearchParams('permissionId=8')));
});
test('matrix BFF preserves snapshot200/stale409 without replay and rejects CSRF/invalid arrays before dispatch',async t=>{
 let writes=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{writes++;assert.equal(init.method,'PUT');return writes===1?Response.json({role:4,roleName:'DEVELOPER',permissionIds:[]}):Response.json({message:'stale'},{status:409});});
 const origin='http://localhost:3131';
 const send=(body,from=origin)=>backendRoute(new Request(origin+'/api/backend/roles/4/permissions',{method:'PUT',body,headers:{origin:from,cookie:'jira_access=access'}}),['roles','4','permissions']);
 const payload='{"expectedPermissionIds":[8],"permissionIds":[]}';
 assert.equal((await send(payload)).status,200);
 const conflict=await send(payload);assert.equal(conflict.status,409);assert.match((await conflict.json()).message,/Bản nháp/);
 assert.equal((await send(payload,'https://evil.invalid')).status,403);
 assert.equal((await send('{"expectedPermissionIds":[],"permissionIds":["1"]}')).status,400);
 assert.equal(writes,2);
});
