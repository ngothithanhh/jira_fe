import { NextResponse } from 'next/server.js';
import { ACCOUNT_INVITES, invitationId, inviteStates, validInviteEmail, validInviteToken } from './contract.ts';

type Action = { kind: 'project-list' | 'inbox' | 'create' | 'legacy' | 'preview' | 'accept' | 'decline' | 'resend' | 'revoke' | 'proof'; id?: string };

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export function invitationRoute(path: string[], method: string): Action | undefined {
  const [area, scope, feature, id, action] = path;
  if (area === 'projects' && /^[1-9]\d{0,9}$/.test(scope ?? '') && positive(Number(scope))) {
    if (path.length === 3 && feature === 'members' && method === 'POST') return { kind: 'legacy' };
    if (feature !== 'invitations') return;
    if (path.length === 3 && method === 'POST') return { kind: 'create' };
    if (path.length === 3 && method === 'GET') return { kind: 'project-list' };
    if (path.length === 5 && method === 'POST' && invitationId(id) && (action === 'resend' || action === 'revoke')) return { kind: action, id };
  }
  if (area === 'account' && scope === 'project-invitations') {
    if (path.length === 2 && method === 'GET') return { kind: 'inbox' };
    if (!invitationId(feature)) return;
    if (path.length === 3 && method === 'GET') return { kind: 'preview', id: feature };
    if (path.length === 4 && method === 'POST' && (id === 'accept' || id === 'decline' || id === 'proof')) return { kind: id, id: feature };
  }
}

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const messages: Record<string, string> = {
  ALREADY_PENDING: 'Email này đã có lời mời đang chờ. Hãy gửi lại hoặc thu hồi lời mời đó.',
  RECIPIENT_UNAVAILABLE: 'Tài khoản đã là thành viên hoặc đang bị vô hiệu hóa.',
  ALREADY_MEMBER: 'Bạn đã là thành viên của dự án.',
  MANAGER_EXISTS: 'Dự án đã có Project Manager.',
  ROLE_NOT_ALLOWED: 'Vai trò này không thể gán trong dự án.',
  WRONG_ACCOUNT: 'Lời mời thuộc tài khoản khác.',
  EMAIL_VERIFICATION_REQUIRED: 'Bạn cần xác minh email trong Tài khoản.',
  LINK_INVALID: 'Link không còn hiệu lực. Hãy mở link mới nhất trong email.',
  EXPIRED: 'Lời mời đã hết hạn.',
  DECLINED: 'Lời mời đã được từ chối.',
  REVOKED: 'Lời mời đã được thu hồi.',
  INVITER_NO_LONGER_AUTHORIZED: 'Người mời không còn quyền mời thành viên.',
  STATE_CONFLICT: 'Lời mời đã đổi trạng thái. Hãy tải lại.',
  COOLDOWN: 'Chưa đến thời điểm gửi lại.',
  RATE_LIMIT: 'Đã đạt giới hạn gửi lời mời.',
  RESEND_LIMIT: 'Đã đạt số lượt gửi lại của lời mời này.',
  SESSION_CHANGED: 'Bạn cần đăng nhập đúng tài khoản nhận lời mời.',
  MAIL_UNAVAILABLE: 'Dịch vụ gửi thư hiện không khả dụng.',
  INVALID_INPUT: 'Dữ liệu lời mời không hợp lệ.',
  INVITATION_UNCERTAIN: 'Chưa xác nhận được kết quả. Hãy tải lại lời mời.',
};

function failure(status: number, code: string, retry?: string | null) {
  const headers = new Headers(noStore);
  if (retry && /^[0-9]{1,6}$/.test(retry)) headers.set('Retry-After', retry);
  return NextResponse.json({ code, message: messages[code] ?? (status === 404 ? 'Không tìm thấy lời mời.' : 'Không thể thực hiện thao tác với lời mời.') },
    { status, headers });
}

function queryFor(request: Request, action: Action) {
  const input = new URL(request.url).searchParams;
  const list = action.kind === 'project-list' || action.kind === 'inbox';
  const allowLink = action.kind === 'preview' || action.kind === 'accept' || action.kind === 'decline';
  for (const [key, value] of input) {
    if (input.getAll(key).length !== 1) return null;
    if (list && key === 'size' && /^[1-9]\d?$/.test(value) && Number(value) <= 50) continue;
    if (list && key === 'offset' && /^\d{1,5}$/.test(value) && Number(value) <= 10000) continue;
    if (action.kind === 'project-list' && key === 'state' && inviteStates.some((state) => state === value)) continue;
    if (allowLink && key === 'link' && value === 'true') continue;
    return null;
  }
  return input;
}

/** Proof chỉ đi từ fragment vào cookie của đúng ID và từ BFF sang BE bằng header. */
export async function invitationBackend(request: Request, path: string[], action: Action, access: string | undefined,
                                        originAllowed: boolean, cookie: (name: string) => string | undefined) {
  const query = queryFor(request, action);
  if (!query) return failure(400, 'INVALID_INPUT');
  if (request.method === 'POST' && !originAllowed) return failure(403, 'FORBIDDEN');
  if (action.kind !== 'proof' && !access) return failure(401, 'SESSION_CHANGED');
  const cookieName = 'jira_invitation_proof_' + action.id;
  let body: string | undefined;
  try {
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 4096) return failure(413, 'INVALID_INPUT');
      let input: Record<string, unknown>;
      try { input = raw ? JSON.parse(raw) : {}; } catch { return failure(400, 'INVALID_INPUT'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(400, 'INVALID_INPUT');
      const keys = Object.keys(input).length;
      if (action.kind === 'proof') {
        if (keys !== 1 || !validInviteToken(input.token)) return failure(400, 'INVALID_INPUT');
        const response = new NextResponse(null, { status: 204, headers: noStore });
        response.cookies.set(cookieName, input.token, { path: '/api/backend/' + ACCOUNT_INVITES + '/' + action.id,
          httpOnly: true, sameSite: 'lax', maxAge: 1800,
          secure: new URL(process.env.APP_ORIGIN || request.url).protocol === 'https:' });
        return response;
      }
      if (action.kind === 'create' && keys === 2 && typeof input.email === 'string'
        && validInviteEmail(input.email) && positive(input.roleId)) {
        body = JSON.stringify({ email: input.email.trim(), roleId: input.roleId });
      } else if (action.kind === 'legacy' && keys === 2 && positive(input.userId) && positive(input.roleId)) {
        body = JSON.stringify({ userId: input.userId, roleId: input.roleId });
      } else if (keys || action.kind === 'create' || action.kind === 'legacy') return failure(400, 'INVALID_INPUT');
    }
    const headers = new Headers({ Authorization: 'Bearer ' + access });
    if (body) headers.set('Content-Type', 'application/json');
    if (query.has('link')) {
      const proof = cookie(cookieName);
      if (!validInviteToken(proof)) return failure(410, 'LINK_INVALID');
      headers.set('X-Jira-Invitation-Proof', proof);
    }
    const base = (process.env.BACKEND_API_URL || 'http://127.0.0.1:8080/api').replace(/\/$/, '');
    const suffix = query.size ? '?' + query : '';
    const upstream = await fetch(base + '/' + path.join('/') + suffix, {
      method: request.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: noStore });
    const data = await upstream.json().catch(() => undefined);
    if (!upstream.ok) return failure(upstream.status, typeof data?.code === 'string' ? data.code : '', upstream.headers.get('Retry-After'));
    if (!data) return failure(502, 'INVITATION_UNCERTAIN');
    return NextResponse.json(data, { status: upstream.status, headers: noStore });
  } catch {
    return failure(502, 'INVITATION_UNCERTAIN');
  }
}
