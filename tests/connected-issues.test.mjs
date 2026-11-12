import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRoute, issueBody } from '../src/features/connected/issues/contract.ts';
import { searchQuery, initialFilters, planningIssue, assertProject } from '../src/features/connected/issues/model.ts';
import { backendRoute } from '../src/features/connected/server.ts';

const query = (s = '') => new URLSearchParams(s);
const origin = 'http://localhost:3130';
const req = (path,method='GET',body) => new Request(`${origin}/api/backend/${path}`,{method,headers:{origin,cookie:'jira_access=local-test'},...(body ? {body:JSON.stringify(body)}:{})});

test('search giữ trang 0, escape keyword và không gửi assigneeId khi unassigned', () => {
  const q = query(searchQuery({...initialFilters,keyword:'%_ & tiếng Việt',assignee:'unassigned',statusId:'12',typeId:'8'}));
  assert.equal(q.get('keyword'),'%_ & tiếng Việt'); assert.equal(q.get('page'),'0');
  assert.equal(q.get('unassigned'),'true'); assert.equal(q.has('assigneeId'),false);
  assert.equal(q.get('statusId'),'12'); assert.equal(q.get('typeId'),'8');
});

test('mapper dùng category DB dù tên DONE tùy chỉnh; null user/version không thành ID0', () => {
  const issue = {issueId:14,issueKey:'SHOP-25',projectId:6,summary:'Test',statusId:9,statusName:'Đã nghiệm thu',assigneeId:null,assigneeName:null,version:null,storyPoints:0};
  const mapped = planningIssue(issue,[{statusId:9,statusName:'Đã nghiệm thu',statusCategory:'DONE'}]);
  assert.equal(mapped.statusCategory,'DONE'); assert.equal(mapped.assigneeId,null); assert.equal(mapped.version,null);
  assert.throws(() => planningIssue(issue,[]),/cấu hình/);
  assert.throws(() => assertProject(issue,7),/không thuộc/);
});

for (const [path,method,suffix,kind] of [
  ['projects/2/issues/search','GET','page=0&size=20&keyword=abc','read'],
  ['projects/2/backlog','GET','','read'],['projects/2/backlog/order','PUT','','order'],
  ['projects/2/members','GET','','read'],['projects/2/issue-types','GET','','read'],
  ['sprints/project/2','GET','','read'],['sprints/4/issues','GET','','read'],
  ['sprints/4/issues/order','PUT','','order'],['sprints/4/issues/7','POST','','link'],
  ['sprints/4/issues/7','DELETE','','link'],['sprints/4/start','PUT','','start'],
  ['sprints/4/complete','PUT','moveToSprintId=5','complete'],
  ['issues/7','DELETE','expectedVersion=0','delete'],['issues/7/assign','PUT','','assign'],
  ['issues/7/status','PUT','statusId=10','status'],['workflows/allowed-transitions','GET','currentStatusId=3','read'],
]) test(`whitelist ${method} ${path}`, () => {
  const r = issueRoute(path,method,query(suffix)); assert.equal(r.kind,kind); assert.equal(r.write,method !== 'GET');
});

for (const [path,method,suffix] of [
  ['issues/2147483648','GET',''],['issues/1','DELETE',''],['issues/1','DELETE','expectedVersion=-1'],
  ['issues/1','DELETE','expectedVersion=9007199254740992'],['issues/1/status','PUT',''],
  ['projects/2/issues/search','GET','size=0'],['projects/2/issues/search','GET','size=101'],
  ['projects/2/issues/search','GET','page=2147483647&size=100'],
  ['projects/2/issues/search','GET','unassigned=true&assigneeId=1'],
  ['projects/2/issues/search','GET','sort=project.password'],['projects/2/issues/search','GET','page=0&page=1'],
  ['projects/2/backlog','GET','actorId=1'],['issues/1/assign','PUT','assigneeId=0'],
]) test(`reject query ${method} ${path}?${suffix}`, () => assert.throws(() => issueRoute(path,method,query(suffix))));

test('body không chuyển reporter/actor/version từ browser, kiểm integer và scope order', () => {
  assert.deepEqual(JSON.parse(issueBody('create',{projectId:2,issueTypeId:5,summary:' A ',priority:'HIGH',reporterId:999,statusId:5,version:100})),{summary:'A',priority:'HIGH',projectId:2,issueTypeId:5});
  assert.throws(() => issueBody('create',{projectId:2,issueTypeId:5,summary:' ',priority:'HIGH'}));
  assert.throws(() => issueBody('edit',{summary:'A',priority:'MEDIUM',storyPoints:-1}));
  assert.throws(() => issueBody('edit',{summary:'A',priority:'MEDIUM',storyPoints:1.5}));
  assert.throws(() => issueBody('order',{issueIds:[1,1]}));
  assert.throws(() => issueBody('order',{issueIds:[0]}));
  assert.equal(issueBody('order',{issueIds:[]}),'{"issueIds":[]}');
  assert.throws(() => issueBody('sprint',{projectId:2,sprintName:'Sprint',startDate:'2026-11-12T00:00:00',endDate:'2026-11-11T00:00:00'}));
});

test('BFF bảo vệ Origin/Bearer và chuyển đúng hợp đồng issue, không tự retry', async () => {
  const previous = globalThis.fetch; const calls=[];
  globalThis.fetch = async (url,init) => { calls.push({url,init}); return Response.json({issueId:42},{status:201}); };
  try {
    const bad = new Request(`${origin}/api/backend/issues`,{method:'POST',headers:{origin:'https://other.test',cookie:'jira_access=test'},body:'{}'});
    assert.equal((await backendRoute(bad,['issues'])).status,403); assert.equal(calls.length,0);
    assert.equal((await backendRoute(new Request(`${origin}/api/backend/projects/2/backlog`),['projects','2','backlog'])).status,401);
    const result = await backendRoute(req('issues','POST',{projectId:2,issueTypeId:1,summary:'Tạo thật',priority:'MEDIUM',reporterId:999}),['issues']);
    assert.equal(result.status,200); assert.equal(calls.length,1); assert.equal(calls[0].init.headers.Authorization,'Bearer local-test');
    assert.equal(JSON.parse(calls[0].init.body).reporterId,undefined); assert.equal(calls[0].init.redirect,'error');
    assert.match(result.headers.get('cache-control'),/no-store/);
    globalThis.fetch = async () => new Response(null,{status:200});
    assert.equal((await backendRoute(req('sprints/4/issues/42','POST'),['sprints','4','issues','42'])).status,200);
    globalThis.fetch = async () => Response.json({sql:'private'},{status:409});
    const stale = await backendRoute(req('issues/42?expectedVersion=0','DELETE'),['issues','42']);
    assert.equal(stale.status,409); assert.match((await stale.json()).message,/Tải lại/); assert.equal(stale.headers.has('set-cookie'),false);
  } finally { globalThis.fetch=previous; }
});
