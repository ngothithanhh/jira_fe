export const priorities = ['HIGHEST', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'] as const;
const id = (s: unknown) => typeof s === 'number' && Number.isInteger(s) && s > 0 && s <= 2147483647;
const natural = (s: string) => /^(0|[1-9]\d*)$/.test(s) && Number.isSafeInteger(Number(s));
const positive = (s: string) => /^[1-9]\d*$/.test(s) && id(Number(s));
type Kind = 'read' | 'create' | 'edit' | 'delete' | 'assign' | 'status' | 'order' | 'sprint' | 'link' | 'start' | 'complete';
export type IssueRoute = { kind: Kind; write: boolean; suffix: string };

/** Chỉ mở các API issue/lập kế hoạch đã nối. ID trên path luôn là khóa DB nguyên dương. */
export function issueRoute(route: string, method: string, query: URLSearchParams): IssueRoute | null {
  let kind: Kind | undefined;
  let allowed: string[] = [];
  const paths = route.split('/');
  if (paths.some((p) => /^\d+$/.test(p) && !positive(p))) throw new Error('ID không hợp lệ.');
  if (method === 'GET') {
    if (/^projects\/[1-9]\d*\/issues\/search$/.test(route)) { kind = 'read'; allowed = ['keyword','statusId','typeId','assigneeId','reporterId','sprintId','priority','unassigned','page','size','sort','direction']; }
    else if (/^projects\/[1-9]\d*\/(backlog|issue-types|members)$/.test(route) || /^issues\/[1-9]\d*$/.test(route)
      || /^sprints\/project\/[1-9]\d*$/.test(route) || /^sprints\/[1-9]\d*\/issues$/.test(route) || route === 'issue-statuses') kind = 'read';
    else if (route === 'workflows/allowed-transitions') { kind = 'read'; allowed = ['currentStatusId']; }
  } else if (method === 'POST' && route === 'issues') kind = 'create';
  else if (/^issues\/[1-9]\d*$/.test(route) && method === 'PUT') kind = 'edit';
  else if (/^issues\/[1-9]\d*$/.test(route) && method === 'DELETE') { kind = 'delete'; allowed = ['expectedVersion']; }
  else if (/^issues\/[1-9]\d*\/assign$/.test(route) && method === 'PUT') { kind = 'assign'; allowed = ['assigneeId']; }
  else if (/^issues\/[1-9]\d*\/status$/.test(route) && method === 'PUT') { kind = 'status'; allowed = ['statusId']; }
  else if (/^(projects\/[1-9]\d*\/backlog|sprints\/[1-9]\d*\/issues)\/order$/.test(route) && method === 'PUT') kind = 'order';
  else if (route === 'sprints' && method === 'POST') kind = 'sprint';
  else if (/^sprints\/[1-9]\d*\/issues\/[1-9]\d*$/.test(route) && ['POST','DELETE'].includes(method)) kind = 'link';
  else if (/^sprints\/[1-9]\d*\/start$/.test(route) && method === 'PUT') kind = 'start';
  else if (/^sprints\/[1-9]\d*\/complete$/.test(route) && method === 'PUT') { kind = 'complete'; allowed = ['moveToSprintId']; }
  if (!kind) return null;
  // Không cho query trùng hoặc trường ngoài hợp đồng lọt qua upstream.
  for (const [key, value] of query) {
    if (!allowed.includes(key) || query.getAll(key).length !== 1) throw new Error('Tham số không hợp lệ.');
    if ((key.endsWith('Id') && !positive(value)) || (['page','size','expectedVersion'].includes(key) && !natural(value))) throw new Error('Tham số không hợp lệ.');
    if (key === 'keyword' && value.length > 200 || key === 'priority' && value.length > 50
      || key === 'unassigned' && !['true','false'].includes(value)
      || key === 'sort' && !['issueNumber','summary','priority','createdAt','updatedAt'].includes(value)
      || key === 'direction' && !['ASC','DESC'].includes(value)) throw new Error('Bộ lọc không hợp lệ.');
  }
  if (query.has('size') && (Number(query.get('size')) < 1 || Number(query.get('size')) > 100)
    || Number(query.get('page') || 0) * Number(query.get('size') || 20) > 2147483647
    || query.get('unassigned') === 'true' && query.has('assigneeId')) throw new Error('Phân trang hoặc người phụ trách không hợp lệ.');
  if (kind === 'delete' && !query.has('expectedVersion') || kind === 'status' && !query.has('statusId')
    || route === 'workflows/allowed-transitions' && !query.has('currentStatusId')) throw new Error('Thiếu tham số bắt buộc.');
  return { kind, write: kind !== 'read', suffix: query.size ? `?${query.toString()}` : '' };
}

/** Chỉ chuyển trường API cho phép; reporter, rank, version và quyền không lấy từ body browser. */
export function issueBody(kind: Kind, input: unknown): string | undefined {
  if (!['create','edit','order','sprint'].includes(kind)) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu không hợp lệ.');
  const value = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const text = (key: string, max: number, required = false) => {
    const v = value[key];
    if (v === undefined && !required) return;
    if (typeof v !== 'string' || v.length > max || required && !v.trim()) throw new Error(`Trường ${key} không hợp lệ.`);
    out[key] = key === 'summary' || key === 'sprintName' ? v.trim() : v;
  };
  if (kind === 'create' || kind === 'edit') {
    text('summary',255,true); text('description',255); text('priority',50,true);
    if (!priorities.includes(value.priority as typeof priorities[number])) throw new Error('Mức ưu tiên không hợp lệ.');
    if (kind === 'create') {
      if (!id(value.projectId) || !id(value.issueTypeId) || value.parentIssueId != null && !id(value.parentIssueId)) throw new Error('ID dự án/loại/cha không hợp lệ.');
      out.projectId = value.projectId; out.issueTypeId = value.issueTypeId;
      if (value.parentIssueId != null) out.parentIssueId = value.parentIssueId;
    } else if (value.storyPoints !== undefined) {
      if (typeof value.storyPoints !== 'number' || !Number.isInteger(value.storyPoints) || value.storyPoints < 0 || value.storyPoints > 2147483647) throw new Error('Story points không hợp lệ.');
      out.storyPoints = value.storyPoints;
    }
  } else if (kind === 'order') {
    if (!Array.isArray(value.issueIds) || value.issueIds.some((v) => !id(v)) || new Set(value.issueIds).size !== value.issueIds.length) throw new Error('Danh sách sắp xếp không hợp lệ.');
    out.issueIds = value.issueIds;
  } else {
    if (!id(value.projectId)) throw new Error('ID dự án không hợp lệ.');
    out.projectId = value.projectId; text('sprintName',100,true); text('goal',255);
    for (const k of ['startDate','endDate']) {
      const v = value[k];
      if (v == null || v === '') { out[k] = null; continue; }
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error('Thời gian sprint không hợp lệ.');
      out[k] = v;
    }
    if (out.startDate && out.endDate && String(out.endDate) <= String(out.startDate)) throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
  }
  return JSON.stringify(out);
}
