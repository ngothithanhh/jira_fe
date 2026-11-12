import test from 'node:test';import assert from 'node:assert/strict';
import {boardBody,boardRoute} from '../src/features/connected/board/contract.ts';
import {buildBoardView,toGlobalBoardPosition,allowedBoardTargets,emptyFilter} from '../src/features/connected/board/model.ts';
import {backendRoute} from '../src/features/connected/server.ts';
const col={columnId:10,columnName:'Todo',position:1,wipLimit:4,mappedStatusIds:[1,2]};
const card=(id,position,columnId=10)=>({issue:{issueId:id,projectId:1,issueKey:'P-'+id,summary:'Task '+id,statusId:1,assigneeId:null,issueTypeId:3},columnId,position,version:0});
const data={board:{boardId:7,projectId:1,columns:[col]},sprint:{sprintId:8,state:'ACTIVE'},sprintIssueIds:[2,4,9],cards:[card(1,0),card(2,1),card(3,2),card(4,3),card(5,4),card(9,0,null)]};

test('view uses sprint membership and full-project WIP; unmapped survives filters',()=>{
  const v=buildBoardView(data,emptyFilter);assert.deepEqual(v.columns[0].cards.map(c=>c.issue.issueId),[2,4]);assert.equal(v.columns[0].load,5);assert.equal(v.columns[0].full,true);assert.equal(v.unmapped[0].issue.issueId,9);
  const filtered=buildBoardView(data,{...emptyFilter,keyword:'P-4',assignee:'none',typeId:'3'});assert.equal(filtered.filtered,true);assert.equal(filtered.columns[0].shown.length,1);assert.equal(filtered.columns[0].load,5);
});
test('translate sprint index around hidden project cards after excluding dragged card',()=>{
  assert.equal(toGlobalBoardPosition(data,9,10,0),1);assert.equal(toGlobalBoardPosition(data,9,10,1),3);assert.equal(toGlobalBoardPosition(data,9,10,2),4);
  assert.equal(toGlobalBoardPosition(data,2,10,1),3);assert.equal(toGlobalBoardPosition(data,4,10,0),1);
  assert.equal(toGlobalBoardPosition({...data,sprintIssueIds:[9]},9,10,0),5);
  assert.throws(()=>toGlobalBoardPosition(data,9,10,3));assert.throws(()=>toGlobalBoardPosition(data,9,10,-1));
});
test('target statuses intersect workflow and mapping; same-status reorder needs no transition',()=>{
  assert.deepEqual(allowedBoardTargets(card(2,1),col,[{statusId:2},{statusId:99}]),[1,2]);
  assert.deepEqual(allowedBoardTargets(card(2,1),{...col,mappedStatusIds:[3]},[{statusId:2}]),[]);
});
for(const [path,method,qs] of [
  ['boards/project/1','GET',''],['boards/7','GET',''],['boards/7/issues','GET',''],['sprints/8','GET',''],
  ['boards','POST',''],['boards/7','PATCH',''],['boards/7','DELETE',''],['boards/columns','POST',''],
  ['boards/columns/10','PATCH',''],['boards/columns/10','DELETE',''],['boards/columns/map-status','POST',''],
  ['boards/columns/map-status','DELETE','columnId=10&statusId=2'],['boards/7/issues/2/move','PUT',''],
])test('board whitelist '+method+' '+path,()=>assert.ok(boardRoute(path,method,new URLSearchParams(qs))));
test('invalid query/id/method are rejected before upstream',()=>{
  assert.equal(boardRoute('boards/7/unknown','POST',new URLSearchParams()),null);
  for(const [path,q] of [['boards/2147483648',''],['boards/7','actorId=1'],['boards/columns/map-status','columnId=10&statusId=2&statusId=3']])assert.throws(()=>boardRoute(path,path.includes('map-status')?'DELETE':'GET',new URLSearchParams(q)));
});
test('board payload strips actor/project changes and requires sprint scope for connected moves',()=>{
  assert.deepEqual(JSON.parse(boardBody('create',{projectId:1,boardName:' Board ',boardType:'KANBAN',actorId:99})),{projectId:1,boardName:'Board',boardType:'SCRUM'});
  const move={columnId:10,statusId:2,position:0,expectedVersion:0,sprintId:8};
  assert.deepEqual(JSON.parse(boardBody('move',{...move,actorId:99})),move);
  assert.throws(()=>boardBody('move',{...move,sprintId:undefined}));assert.throws(()=>boardBody('move',{...move,expectedVersion:-1}));
  assert.throws(()=>boardBody('edit-column',{columnName:'A',wipLimit:-1}));assert.throws(()=>boardBody('column',{boardId:7,columnName:' ',position:1}));
});
test('BFF sends Bearer/whitelisted move only after Origin; conflict retains cookies',async()=>{
  const original=globalThis.fetch;let calls=0;const origin='http://127.0.0.1:3130';
  globalThis.fetch=async(url,init)=>{calls++;assert.match(url,/boards\/7\/issues\/2\/move$/);assert.equal(init.headers.Authorization,'Bearer test');assert.deepEqual(JSON.parse(init.body),{columnId:10,statusId:2,position:0,sprintId:8,expectedVersion:0});return Response.json({sql:'private'},{status:409});};
  try{
    const init={method:'PUT',headers:{origin,cookie:'jira_access=test'},body:JSON.stringify({columnId:10,statusId:2,position:0,sprintId:8,expectedVersion:0,actorId:9})};
    const denied=await backendRoute(new Request(origin+'/api/backend/boards/7/issues/2/move',{...init,headers:{...init.headers,origin:'https://other.test'}}),['boards','7','issues','2','move']);assert.equal(denied.status,403);assert.equal(calls,0);
    const r=await backendRoute(new Request(origin+'/api/backend/boards/7/issues/2/move',init),['boards','7','issues','2','move']);assert.equal(r.status,409);assert.match((await r.json()).message,/WIP/);assert.equal(r.headers.has('set-cookie'),false);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
