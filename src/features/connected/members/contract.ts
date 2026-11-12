type MemberAction = 'roles' | 'search' | 'add' | 'role' | 'remove';

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;

export const isCandidateEmail = (value: string) => value.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** GET members đã có trong allowlist issue. Các route mới chỉ mở theo method và ID cụ thể. */
export function memberRoute(route: string, method: string): MemberAction | null {
  if (method === 'GET' && route === 'user-role') return 'roles';
  const [resource, projectId, section, user, action, extra] = route.split('/');
  if (resource !== 'projects' || section !== 'members' || !/^[1-9]\d*$/.test(projectId) || !isId(Number(projectId))) return null;
  if (method === 'POST' && user === undefined) return 'add';
  if (method === 'POST' && user === 'candidates' && action === 'search' && extra === undefined) return 'search';
  if (!/^[1-9]\d*$/.test(user) || !isId(Number(user))) return null;
  if (method === 'DELETE' && action === undefined) return 'remove';
  if (method === 'PUT' && action === 'role' && extra === undefined) return 'role';
  return null;
}

export function memberBody(action: MemberAction, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu thành viên không hợp lệ.');
  const body = input as Record<string, unknown>;
  if (action === 'search') {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!isCandidateEmail(email) || Object.keys(body).length !== 1) throw new Error('Nhập email đầy đủ và hợp lệ.');
    return JSON.stringify({ email });
  }
  const add = action === 'add';
  if (!isId(body.roleId) || (add && !isId(body.userId)) || Object.keys(body).length !== (add ? 2 : 1)) {
    throw new Error('ID thành viên hoặc vai trò không hợp lệ.');
  }
  return JSON.stringify(add ? { userId: body.userId, roleId: body.roleId } : { roleId: body.roleId });
}
