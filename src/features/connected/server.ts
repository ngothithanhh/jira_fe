import { NextResponse } from 'next/server.js';

const ACCESS = 'jira_access';
const REFRESH = 'jira_refresh';
const NO_STORE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/** Đọc cookie của cầu nối; cookie hỏng được xem là thiếu phiên, không làm route trả 500. */
function readCookie(request: Request, name: string) {
  const value = request.headers.get('cookie')?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  try { return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined; } catch { return undefined; }
}

/** Mọi response xác thực đều không cache; lỗi chỉ chứa thông báo, không có URL cấu hình hoặc token. */
function failure(status: number, message: string) {
  return NextResponse.json({ message }, { status, headers: NO_STORE });
}

/** Gỡ hai cookie đúng path đã cấp, kể cả khi access hết hạn nhưng refresh còn tồn tại. */
function clearSession(response: NextResponse) {
  // Browser cần phân biệt Next đã xóa cookie với request logout chưa tới được Next do mất mạng.
  response.headers.set('X-Jira-Session-Cleared', '1');
  response.cookies.set(ACCESS, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/backend', maxAge: 0 });
  response.cookies.set(REFRESH, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/backend/auth', maxAge: 0 });
  return response;
}

/** Chỉ dùng exp để đặt hạn cookie; Spring Boot vẫn là bên kiểm chữ ký, version và quyền của JWT. */
function accessLifetime(token: string) {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
    return typeof exp === 'number' ? Math.max(0, Math.min(604800, Math.floor(exp - Date.now() / 1000))) : 0;
  } catch { return 0; }
}

/** Giữ credential phía server bằng HttpOnly; trả trạng thái thành công thay vì trả token cho JavaScript. */
function establishSession(data: unknown) {
  const pair = data as { token?: unknown; refreshToken?: unknown };
  if (typeof pair?.token !== 'string' || typeof pair?.refreshToken !== 'string' || !accessLifetime(pair.token)) {
    return failure(502, 'Máy chủ trả về phiên đăng nhập không hợp lệ.');
  }
  const response = NextResponse.json({ authenticated: true }, { headers: NO_STORE });
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };
  response.cookies.set(ACCESS, pair.token, { ...options, path: '/api/backend', maxAge: accessLifetime(pair.token) });
  // BE hiện cấp refresh trong 7 ngày; rotation tạo cookie mới sau mỗi lần thành công.
  response.cookies.set(REFRESH, pair.refreshToken, { ...options, path: '/api/backend/auth', maxAge: 604800 });
  return response;
}

/** Mutation chỉ nhận từ origin ứng dụng đã cấu hình để bảo vệ thao tác dùng cookie. */
function trustedOrigin(request: Request) {
  // Next có thể dựng request.url bằng localhost nội bộ dù browser mở 127.0.0.1.
  // Khi chưa cấu hình public origin, dùng Host của HTTP request; không dùng chính Origin làm giá trị tin cậy.
  const url = new URL(request.url);
  const allowed = process.env.APP_ORIGIN || `${url.protocol}//${request.headers.get('host') || url.host}`;
  return request.headers.get('origin') === allowed;
}

/** ID dự án, sprint và thông báo trên các route mới đều là số nguyên dương kiểu int của Spring. */
function validRouteId(id: string | undefined) {
  return id !== undefined && /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647;
}

/**
 * Browser gọi /api/backend; chỉ method và path đã liệt kê được chuyển tới Spring Boot.
 * Spring xác thực JWT và kiểm quyền nghiệp vụ. BFF không gửi lại mutation khi upstream lỗi.
 */
export async function backendRoute(request: Request, path: string[]) {
  const route = path.join('/');
  const authAction = request.method === 'POST' && /^auth\/(login|register|refresh|logout)$/.test(route);
  const notificationRead = request.method === 'GET' && ['notifications', 'notifications/unread-count'].includes(route);
  const markOne = request.method === 'PUT' && validRouteId(/^notifications\/(\d+)\/read$/.exec(route)?.[1]);
  const deleteOne = request.method === 'DELETE' && validRouteId(/^notifications\/(\d+)$/.exec(route)?.[1]);
  const notificationMutation = markOne || deleteOne || (request.method === 'PUT' && route === 'notifications/read-all');
  const velocity = /^projects\/(\d+)\/reports\/velocity$/.exec(route);
  const reportRead = request.method === 'GET' && (
    validRouteId(velocity?.[1])
    || validRouteId(/^sprints\/project\/(\d+)$/.exec(route)?.[1])
    || validRouteId(/^sprints\/(\d+)\/reports\/(summary|burndown)$/.exec(route)?.[1])
  );
  const readAction = notificationRead || reportRead
    || (request.method === 'GET' && ['auth/me', 'account/context', 'projects/getList'].includes(route));
  const protectedAction = readAction || notificationMutation;
  if (!authAction && !protectedAction) return failure(404, 'Chức năng chưa được kết nối.');
  if ((authAction || notificationMutation) && !trustedOrigin(request)) return failure(403, 'Nguồn yêu cầu không hợp lệ.');

  // Chỉ chuyển query projectId hợp lệ; không chuyển actorId hoặc URL upstream từ người gọi.
  let suffix = '';
  if (route === 'account/context') {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => key !== 'projectId')) return failure(400, 'Tham số không hợp lệ.');
    const projectId = query.get('projectId');
    if (projectId !== null && (!/^[1-9]\d*$/.test(projectId) || Number(projectId) > 2147483647)) return failure(400, 'ID dự án không hợp lệ.');
    suffix = projectId ? `?projectId=${projectId}` : '';
  } else if (notificationRead || notificationMutation || reportRead) {
    // Chỉ chuyển filter của inbox hoặc giới hạn velocity, tối đa một giá trị.
    const query = [...new URL(request.url).searchParams];
    if (query.length > 0) {
      const [key, value] = query[0];
      const unreadFilter = route === 'notifications' && key === 'unreadOnly' && (value === 'true' || value === 'false');
      const velocityLimit = velocity && key === 'limit' && /^[1-9]\d?$/.test(value) && Number(value) <= 50;
      if (query.length !== 1 || (!unreadFilter && !velocityLimit)) return failure(400, 'Tham số không hợp lệ.');
      suffix = `?${key}=${value}`;
    }
  }
  const access = readCookie(request, ACCESS);
  const refresh = readCookie(request, REFRESH);
  if (protectedAction && !access) return failure(401, 'Bạn cần đăng nhập.');
  if (route === 'auth/refresh' && !refresh) return clearSession(failure(401, 'Phiên đăng nhập đã hết hạn.'));
  if (route === 'auth/logout' && !refresh) return clearSession(new NextResponse(null, { status: 204, headers: NO_STORE }));

  let body: string | undefined;
  if (route === 'auth/login' || route === 'auth/register') {
    // Giới hạn form và chỉ chuyển các trường hợp đồng; không nhận quyền/role hoặc refresh token từ body browser.
    const raw = await request.text();
    if (raw.length > 8192) return failure(413, 'Thông tin đăng nhập quá dài.');
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return failure(400, 'Dữ liệu không hợp lệ.'); }
    if (!input || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 100
      || typeof input.password !== 'string' || !input.password || Buffer.byteLength(input.password, 'utf8') > 72) return failure(400, 'Email hoặc mật khẩu không hợp lệ.');
    const payload: Record<string, string> = { email: input.email.trim(), password: input.password };
    if (route === 'auth/register') {
      if (input.password.length < 8 || typeof input.userName !== 'string' || !input.userName.trim() || input.userName.trim().length > 50
        || typeof input.fullName !== 'string' || input.fullName.trim().length > 100) return failure(400, 'Tên hoặc mật khẩu đăng ký không hợp lệ.');
      payload.userName = input.userName.trim(); payload.fullName = input.fullName.trim();
    }
    body = JSON.stringify(payload);
  } else if (authAction) body = JSON.stringify({ refreshToken: refresh });

  try {
    // Địa chỉ chỉ lấy từ cấu hình server, không dùng NEXT_PUBLIC_API_URL và không follow redirect mang Bearer ra nơi khác.
    const base = process.env.BACKEND_API_URL || 'http://127.0.0.1:8080/api';
    const upstream = await fetch(`${base.replace(/\/$/, '')}/${route}${suffix}`, {
      method: request.method, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
      // Auth public dùng form/refresh token riêng; Bearer cũ không được chặn login, refresh hoặc logout ở JWT filter.
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(protectedAction && access ? { Authorization: `Bearer ${access}` } : {}) },
    });
    if (route === 'auth/logout') {
      // Đóng phiên cục bộ kể cả mất kết nối/revoke lỗi; không thông báo đã thu hồi phía BE nếu BE không xác nhận.
      return clearSession(upstream.ok ? new NextResponse(null, { status: 204, headers: NO_STORE }) : failure(upstream.status, 'Đã thoát trên máy này nhưng chưa xác nhận thu hồi phiên trên máy chủ.'));
    }
    if (!upstream.ok) {
      let message = upstream.status === 401 ? 'Thông tin đăng nhập hoặc phiên không hợp lệ.' : 'Không thể thực hiện yêu cầu.';
      if (upstream.status === 403) message = 'Bạn không có quyền thực hiện.';
      if (upstream.status === 404) message = 'Không tìm thấy dữ liệu.';
      if (upstream.status === 409) message = 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng kiểm tra lại.';
      if (upstream.status === 409 && route === 'auth/register') message = 'Email đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.';
      const response = failure(upstream.status, message);
      return route === 'auth/refresh' && upstream.status === 401 ? clearSession(response) : response;
    }
    // Mark-one trả 200 rỗng, delete trả 204. Giữ status để client nhận đúng kết quả thao tác.
    if ((markOne && upstream.status === 200) || (deleteOne && upstream.status === 204)) {
      return new NextResponse(null, { status: upstream.status, headers: NO_STORE });
    }
    const data = await upstream.json();
    return authAction ? establishSession(data) : NextResponse.json(data, { headers: NO_STORE });
  } catch {
    const response = failure(502, route === 'auth/logout'
      ? 'Đã thoát trên máy này nhưng chưa xác nhận thu hồi phiên trên máy chủ.'
      : 'Không kết nối được máy chủ. Vui lòng thử lại.');
    return route === 'auth/logout' ? clearSession(response) : response;
  }
}
