import { NextResponse } from 'next/server.js';
import { challengeId, otpCode, proofToken, verificationView, type VerificationRoute } from './contract.ts';

const NO_STORE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const ACTIVE = 'jira_registration_active';
const ACCOUNT_ACTIVE = 'jira_email_verification_active';
const ID_HEADER = 'X-Jira-Challenge-Id';
const PROOF_HEADER = 'X-Jira-Verification-Proof';

const messages: Record<string, string> = {
  INVALID_INPUT: 'Thông tin xác minh không hợp lệ.',
  INVALID_EMAIL: 'Email của tài khoản không hợp lệ.',
  INVALID_CODE: 'Mã xác minh không đúng.',
  INVALID_PROOF: 'Lượt xác minh không còn hợp lệ. Vui lòng bắt đầu lại.',
  PROOF_EXPIRED: 'Lượt xác minh đã hết hạn. Vui lòng bắt đầu lại.',
  OTP_EXPIRED: 'Mã xác minh đã hết hạn.',
  LOCKED: 'Đã nhập sai quá số lần cho phép.',
  COOLDOWN: 'Chưa đến thời điểm gửi lại mã.',
  RATE_LIMIT: 'Đã vượt giới hạn xác minh. Vui lòng thử lại sau.',
  EMAIL_IN_USE: 'Email đã được sử dụng. Vui lòng đăng nhập.',
  SESSION_CHANGED: 'Phiên đăng nhập đã thay đổi.',
  MAIL_UNAVAILABLE: 'Chưa thể gửi mã xác minh. Vui lòng thử lại sau.',
  FLOW_CHANGED: 'Lượt xác minh đã đổi trong tab khác. Vui lòng kiểm tra lại.',
  FORBIDDEN: 'Nguồn yêu cầu không hợp lệ.',
};

function failure(status: number, code: string, retryAfter?: string | null) {
  const headers = new Headers(NO_STORE);
  if (retryAfter && /^[1-9][0-9]{0,5}$/.test(retryAfter)) headers.set('Retry-After', retryAfter);
  const known = Object.hasOwn(messages, code);
  return NextResponse.json({ code: known ? code : 'VERIFICATION_FAILED',
    message: known ? messages[code] : 'Chưa xác nhận được kết quả xác minh. Vui lòng kiểm tra trạng thái.' }, { status, headers });
}

function proofCookie(active: string, id: string) { return active + '_' + id; }

function registerPayload(data: Record<string, unknown>) {
  const { email, userName, fullName, password } = data;
  if (Object.keys(data).length !== 4 || typeof email !== 'string' || email.trim().length > 100
    || !/^[!-~]+$/.test(email.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string'
    || !password.trim() || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72
    || typeof userName !== 'string' || !userName.trim() || userName.length > 50
    || typeof fullName !== 'string' || !fullName.trim() || fullName.length > 100) return;
  return { email: email.trim(), userName: userName.trim(), fullName: fullName.trim(), password };
}

async function readForm(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8192) {
        void reader.cancel().catch(() => undefined);
        throw new RangeError('Body too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data = text.trim() ? JSON.parse(text) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SyntaxError('Invalid object');
    return data;
  } finally { reader.releaseLock(); }
}

/** Browser chỉ gửi ID công khai. Proof được lấy từ cookie đúng ID và chuyển sang BE sau kiểm tra binding. */
export async function verificationBackend(request: Request, route: VerificationRoute, options: {
  access?: string; trustedOrigin: boolean; cookie: (name: string) => string | undefined;
}) {
  const url = new URL(request.url);
  if (url.searchParams.size) return failure(400, 'INVALID_INPUT');
  const status = request.method === 'GET';
  if (!status && !options.trustedOrigin) return failure(403, 'FORBIDDEN');
  const account = route.startsWith('account/');
  if (account && !options.access) return failure(401, 'SESSION_CHANGED');

  const active = account ? ACCOUNT_ACTIVE : ACTIVE;
  const cookieId = options.cookie(active);
  const currentId = challengeId(cookieId) ? cookieId : undefined;
  const path = account ? '/api/backend/account/email-verification' : '/api/backend/auth/registration';
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const,
    secure: new URL(process.env.APP_ORIGIN || request.url).protocol === 'https:', path };
  const start = route === 'auth/register' || route === 'account/email-verification/request';
  const verify = route.endsWith('/verify');
  const headers = new Headers();
  if (account) headers.set('Authorization', 'Bearer ' + options.access);
  let body: string | undefined;
  let id: string | undefined;
  try {
    if (status) {
      const requested = request.headers.get(ID_HEADER);
      if (requested !== null && !challengeId(requested)) return failure(400, 'INVALID_INPUT');
      if (requested !== null && requested !== currentId) return failure(409, 'FLOW_CHANGED');
      id = currentId;
      const proof = id && options.cookie(proofCookie(active, id));
      if (id && proofToken(proof)) {
        headers.set(ID_HEADER, id);
        headers.set(PROOF_HEADER, proof);
      } else if (!account) return failure(400, 'INVALID_PROOF');
    } else {
      let input: Record<string, unknown>;
      try { input = await readForm(request); }
      catch (error) { return failure(error instanceof RangeError ? 413 : 400, 'INVALID_INPUT'); }
      if (route === 'auth/register') {
        const payload = registerPayload(input);
        if (!payload) return failure(400, 'INVALID_INPUT');
        body = JSON.stringify(payload);
      } else if (start) {
        if (Object.keys(input).length) return failure(400, 'INVALID_INPUT');
      } else {
        if (!challengeId(input.challengeId) || Object.keys(input).length !== (verify ? 2 : 1)
          || (verify && !otpCode(input.code))) return failure(400, 'INVALID_INPUT');
        id = input.challengeId;
        if (id !== currentId) return failure(409, 'FLOW_CHANGED');
        const proof = options.cookie(proofCookie(active, id));
        if (!proofToken(proof)) return failure(400, 'INVALID_PROOF');
        body = JSON.stringify({ challengeId: id, proofToken: proof, ...(verify && { code: input.code }) });
      }
    }

    if (body) headers.set('Content-Type', 'application/json');
    const base = (process.env.BACKEND_API_URL || 'http://127.0.0.1:8080/api').replace(/\/$/, '');
    const dispatch = () => fetch(base + '/' + route, {
      method: request.method, headers, body, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    let upstream = await dispatch();
    let data = upstream.status === 204 ? undefined : await upstream.json().catch(() => undefined);
    // Cookie có thể thuộc actor trước. Status đọc lại không proof, BE lấy email của actor hiện tại.
    if (status && account && !request.headers.has(ID_HEADER) && headers.has(PROOF_HEADER)
      && (data?.code === 'INVALID_PROOF' || data?.code === 'PROOF_EXPIRED')) {
      headers.delete(ID_HEADER);
      headers.delete(PROOF_HEADER);
      upstream = await dispatch();
      data = await upstream.json().catch(() => undefined);
    }
    if (!upstream.ok) return failure(upstream.status, typeof data?.code === 'string' ? data.code : '', upstream.headers.get('Retry-After'));

    if (verify && id && upstream.status === 204) {
      const response = new NextResponse(null, { status: 204, headers: NO_STORE });
      // Response muộn của tab cũ chỉ xóa proof theo ID, không đụng marker hoặc phiên của tab mới.
      response.cookies.set(proofCookie(active, id), '', { ...cookieOptions, maxAge: 0 });
      return response;
    }

    const view = verificationView(data);
    if (!view || (upstream.status !== (status ? 200 : 202) && !(account && start && upstream.status === 200 && view.state === 'VERIFIED'))
      || (id && view.challengeId && view.challengeId !== id)) return failure(502, '');
    const response = NextResponse.json(view, { status: upstream.status, headers: NO_STORE });
    if (start && upstream.status === 202) {
      if (!view.challengeId || !view.proofExpiresAt || !proofToken(data?.proofToken)) return failure(502, '');
      const maxAge = Math.min(1800, Math.floor((Date.parse(view.proofExpiresAt) - Date.now()) / 1000));
      if (maxAge <= 0) return failure(502, '');
      response.cookies.set(active, view.challengeId, { ...cookieOptions, maxAge });
      response.cookies.set(proofCookie(active, view.challengeId), data.proofToken, { ...cookieOptions, maxAge });
      if (currentId && currentId !== view.challengeId) response.cookies.set(proofCookie(active, currentId), '', { ...cookieOptions, maxAge: 0 });
    }
    return response;
  } catch {
    return failure(502, '');
  }
}
