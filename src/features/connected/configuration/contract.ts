export const categories = ['TO_DO', 'IN_PROGRESS', 'DONE'] as const;
export type Category = typeof categories[number];
type ConfigurationBody = 'type' | 'status' | 'rule';

const positiveId = (id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647;

/** Danh mục và cấu hình chỉ forward các method/path đã nối. GET status và project types dùng allowlist issue hiện có. */
export function configurationRoute(route: string, method: string, query: URLSearchParams) {
  let write = method !== 'GET';
  let body: ConfigurationBody | undefined;
  let suffix = '';
  if (route === 'issue-types' && method === 'GET' || route === 'workflows/rules' && method === 'GET') {
    write = false;
  } else if ((route === 'issue-types' && method === 'POST') || /^issue-types\/[1-9]\d*$/.test(route) && ['PUT', 'DELETE'].includes(method)) {
    if (method !== 'DELETE') body = 'type';
  } else if ((route === 'issue-statuses' && method === 'POST') || /^issue-statuses\/[1-9]\d*$/.test(route) && ['PUT', 'DELETE'].includes(method)) {
    if (method !== 'DELETE') body = 'status';
  } else if (route === 'workflows/rules' && method === 'POST') {
    body = 'rule';
  } else if (/^workflows\/rules\/[1-9]\d*$/.test(route) && method === 'DELETE') {
    // Xóa theo workflow_rules.rule_id, không gửi body.
  } else if (/^projects\/[1-9]\d*\/issue-types\/[1-9]\d*$/.test(route) && ['POST', 'DELETE'].includes(method)) {
    if (method === 'POST' && query.size === 1) {
      const value = query.get('isDefault');
      if (value === 'true' || value === 'false') suffix = '?isDefault=' + value;
    }
  } else if (!(/^projects\/[1-9]\d*\/issue-types\/[1-9]\d*\/default$/.test(route) && method === 'PUT')) {
    return null;
  }
  if (query.size && !suffix || route.split('/').some((part) => /^\d+$/.test(part) && !positiveId(Number(part)))) {
    throw new Error('ID hoặc tham số cấu hình không hợp lệ.');
  }
  return { write, body, suffix };
}

export function configurationBody(kind: ConfigurationBody, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu cấu hình không hợp lệ.');
  const fields = input as Record<string, unknown>;
  if (kind === 'rule') {
    const { fromStatusId, toStatusId } = fields;
    if (Object.keys(fields).length !== 2 || !positiveId(fromStatusId) || !positiveId(toStatusId) || fromStatusId === toStatusId) {
      throw new Error('Chọn hai trạng thái nguồn và đích khác nhau.');
    }
    return JSON.stringify({ fromStatusId, toStatusId });
  }
  const key = kind === 'type' ? 'typeName' : 'statusName';
  const rawName = fields[key];
  if (typeof rawName !== 'string' || !rawName.trim() || rawName.length > 50) throw new Error('Tên cần từ 1 đến 50 ký tự.');
  if (kind === 'type' && Object.keys(fields).length === 1) return JSON.stringify({ typeName: rawName.trim() });
  if (kind === 'status' && Object.keys(fields).length === 2 && categories.includes(fields.statusCategory as Category)) {
    return JSON.stringify({ statusName: rawName.trim(), statusCategory: fields.statusCategory });
  }
  throw new Error('Dữ liệu cấu hình không hợp lệ.');
}
