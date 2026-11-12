'use client';

export class ConnectedError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

let refreshing: Promise<void> | undefined;
const LOGOUT_PENDING = 'jira_logout_pending';
// Phân biệt tab gửi để provider không xử lý lặp cả sự kiện local và BroadcastChannel của chính tab đó.
export const SESSION_SOURCE = crypto.randomUUID();

/** Chỉ lưu ý định thoát, không lưu credential. Giữ qua reload khi browser chưa gửi được logout tới Next. */
export function hasPendingLogout() { return localStorage.getItem(LOGOUT_PENDING) === '1'; }
export function markLogoutPending() { localStorage.setItem(LOGOUT_PENDING, '1'); }

/** Request cùng origin gửi HttpOnly cookie; đọc 204 đúng nghĩa và không tự retry lỗi mạng/mutation. */
async function send(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`/api/backend/${path}`, { ...init, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    if (response.headers.get('X-Jira-Session-Cleared') === '1') localStorage.removeItem(LOGOUT_PENDING);
    return response;
  } catch { throw new ConnectedError(0, 'Mất kết nối. Kiểm tra dữ liệu trước khi thử lại thao tác.'); }
}

/** Các tab dùng cùng khóa khi login/refresh/logout; cookie mới được browser nhận trước khi nhả khóa. */
export async function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request('jira-connected-session', action);
  // Không thử rotation khi thiếu khóa liên tab: đăng nhập lại thay vì có nguy cơ reuse refresh token.
  return action();
}

/**
 * Dùng khi mở lại ứng dụng sau logout bị mất mạng. Kiểm ý định thoát sau khi đã có khóa:
 * tab khác có thể vừa xóa phiên cũ và đăng nhập B trong lúc lượt này đang đợi.
 * Query đã bị hủy hoặc ý định đã hoàn tất thì bỏ qua, không thu hồi cookie B mới nhất.
 */
export async function completePendingLogout(signal?: AbortSignal) {
  return withSessionLock(async () => {
    if (signal?.aborted || !hasPendingLogout()) return;
    await connectedRequest('auth/logout', { method: 'POST', signal }, false);
  });
}

/** Chỉ phát thay đổi danh tính; không truyền cookie, password hoặc token qua BroadcastChannel. */
export function announceSession(type: 'changed' | 'ended') {
  window.dispatchEvent(new CustomEvent('jira-session', { detail: type }));
  if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('jira-connected-session'); channel.postMessage({ type, source: SESSION_SOURCE }); channel.close(); }
}

/** Nhiều request 401 dùng chung một lượt; tab sau kiểm /me trước để không rotation phiên tab trước vừa làm mới. */
function refreshSessionOnce() {
  if (!refreshing) refreshing = withSessionLock(async () => {
    if (!navigator.locks) throw new ConnectedError(401, 'Trình duyệt không hỗ trợ khôi phục phiên an toàn. Vui lòng đăng nhập lại.');
    const probe = await send('auth/me');
    if (probe.ok) return;
    if (probe.status !== 401) return readResponse<void>(probe);
    await readResponse(await send('auth/refresh', { method: 'POST' }));
  }).finally(() => { refreshing = undefined; });
  return refreshing;
}

/** Lỗi có status để UI phân biệt thiếu phiên/quyền với lỗi kết nối; không hiển thị HTML/stack từ upstream. */
async function readResponse<T>(response: Response): Promise<T> {
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new ConnectedError(response.status, data?.message || 'Không thể thực hiện yêu cầu.');
  return data as T;
}

/** Chỉ replay một lần sau 401 từ tầng xác thực BE; 403/409/timeout/5xx không tự gửi lại thao tác. */
export async function connectedRequest<T>(path: string, init?: RequestInit, recover = true): Promise<T> {
  // Đã yêu cầu thoát thì không để cookie chưa xóa khôi phục tài khoản cũ sau khi mạng trở lại.
  if (recover && hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng trên thiết bị này.');
  let response = await send(path, init);
  if (response.status === 401 && recover) {
    try { await refreshSessionOnce(); response = await send(path, init); }
    catch (error) { if (error instanceof ConnectedError && error.status === 401) announceSession('ended'); throw error; }
  }
  return readResponse<T>(response);
}

/**
 * Ghi dữ liệu cho userId đã khởi tạo form, giữ cùng khóa với login/logout ở các tab.
 * Kiểm /me và khôi phục phiên trước khi ghi; chỉ gửi mutation một lần, không replay 401 bằng tài khoản mới.
 * userId khác nghĩa là form thuộc phiên cũ: dừng409 trước khi gửi bất kỳ mutation nghiệp vụ nào.
 */
export async function connectedMutation<T>(path: string, userId: number, init: RequestInit, isCurrent: () => boolean = () => true): Promise<T> {
  // Không có khóa liên tab thì dừng ghi thay vì có nguy cơ dùng cookie tài khoản khác giữa probe và mutation.
  if (!navigator.locks) throw new ConnectedError(409, 'Trình duyệt chưa hỗ trợ khóa phiên an toàn. Vui lòng dùng trình duyệt hỗ trợ Web Locks.');
  return withSessionLock(async () => {
    if (!isCurrent()) throw new ConnectedError(409, 'Phiên khởi tạo thao tác không còn hiệu lực.');
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng trên thiết bị này.');
    let probe = await send('auth/me');
    if (probe.status === 401) {
      // Đã giữ khóa liên tab nên không gọi refreshSessionOnce (hàm đó sẽ lấy khóa lần nữa).
      if (!navigator.locks) throw new ConnectedError(401, 'Vui lòng đăng nhập lại để tiếp tục.');
      try { await readResponse(await send('auth/refresh', { method: 'POST' })); }
      catch (error) {
        // BFF đã xóa cookie khi refresh401; bỏ cache/phiên cũ ngay trong khóa trước khi tab khác login.
        if (error instanceof ConnectedError && error.status === 401) announceSession('ended');
        throw error;
      }
      probe = await send('auth/me');
    }
    const identity = await readResponse<{ user: { id: number } }>(probe);
    if (identity.user?.id !== userId) throw new ConnectedError(409, 'Tài khoản đã thay đổi. Vui lòng mở lại thao tác trong phiên hiện tại.');
    if (!isCurrent()) throw new ConnectedError(409, 'Phiên khởi tạo thao tác không còn hiệu lực.');
    return readResponse<T>(await send(path, init));
  });
}

/**
 * Sau khi refetch có thể đã có tab khác login nhưng BroadcastChannel chưa được xử lý ở tab cũ.
 * Kiểm lại danh tính cookie dưới khóa rồi chạy completion đồng bộ trong khóa, không chỉ dựa vào cache/event.
 * Không còn đúng actor/scope hoặc không đọc được phiên thì bỏ completion; không replay mutation đã thành công.
 */
export async function completeConnectedMutation(userId: number, isCurrent: () => boolean, complete: () => void) {
  return withSessionLock(async () => {
    if (!isCurrent() || hasPendingLogout()) return false;
    let identity: { user: { id: number } };
    try { identity = await readResponse(await send('auth/me')); } catch { return false; }
    if (identity.user?.id !== userId || !isCurrent()) return false;
    complete();
    return true;
  });
}

/** Giữ đường quay lại trong ứng dụng; không nhận URL ngoài origin, backslash hoặc route đăng nhập làm redirect. */
export function safeReturnTo(value: string | null) {
  return value?.startsWith('/app/') && !value.includes('\\') && !value.startsWith('/app/sign-in') && !value.startsWith('/app/sign-up') ? value : '/app/projects';
}
