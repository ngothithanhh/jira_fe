'use client';

export class ConnectedError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

let refreshing: { revision: string | null; request: Promise<void> } | undefined;
const LOGOUT_PENDING = 'jira_logout_pending';
const PASSWORD_SESSION_REVISION = 'jira_password_session_revision';
// Phân biệt tab gửi để provider không xử lý lặp cả sự kiện local và BroadcastChannel của chính tab đó.
export const SESSION_SOURCE = crypto.randomUUID();

/** Chỉ lưu ý định thoát, không lưu credential. Giữ qua reload khi browser chưa gửi được logout tới Next. */
export function hasPendingLogout() { return localStorage.getItem(LOGOUT_PENDING) === '1'; }
export function markLogoutPending() { localStorage.setItem(LOGOUT_PENDING, '1'); }

/** Request cùng origin gửi HttpOnly cookie; đọc 204 đúng nghĩa và không tự retry lỗi mạng/mutation. */
async function send(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`/api/backend/${path}`, { ...init, credentials: 'same-origin', cache: 'no-store',
      // FormData cần boundary do browser tạo, không được ép JSON hoặc tự đặt boundary khác nội dung.
      headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
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

/** So mốc lúc bắt đầu request với mốc sau đổi mật khẩu; khác nhau thì bỏ refresh/replay của phiên cũ. */
function checkPasswordSession(revision: string | null) {
  if (hasPendingLogout() || localStorage.getItem(PASSWORD_SESSION_REVISION) !== revision) {
    throw new ConnectedError(409, 'Phiên khởi tạo yêu cầu đã kết thúc.');
  }
}

/** Nhiều request 401 cùng mốc phiên dùng chung lượt refresh; kiểm /me sau khóa để tránh rotation lặp giữa các tab. */
function refreshSessionOnce(revision: string | null) {
  if (refreshing?.revision === revision) return refreshing.request;
  const request = withSessionLock(async () => {
    checkPasswordSession(revision);
    if (!navigator.locks) throw new ConnectedError(401, 'Trình duyệt không hỗ trợ khôi phục phiên an toàn. Vui lòng đăng nhập lại.');
    const probe = await send('auth/me');
    if (probe.ok) return;
    if (probe.status !== 401) return readResponse<void>(probe);
    await readResponse(await send('auth/refresh', { method: 'POST' }));
  }).finally(() => { if (refreshing?.request === request) refreshing = undefined; });
  refreshing = { revision, request };
  return request;
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
  const revision = recover ? localStorage.getItem(PASSWORD_SESSION_REVISION) : null;
  let response = await send(path, init);
  if (response.status === 401 && recover) {
    try {
      checkPasswordSession(revision);
      await refreshSessionOnce(revision);
      checkPasswordSession(revision);
      response = await send(path, init);
    }
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
  return withMutationActor(userId, isCurrent, async () => readResponse<T>(await send(path, init)));
}

/** Kiểm users.user_id của form bằng /me dưới khóa phiên rồi mới gọi dispatch; hàm không tự gửi lại thao tác ghi. */
async function withMutationActor<T>(userId: number, isCurrent: () => boolean, dispatch: () => Promise<T>): Promise<T> {
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
    return dispatch();
  });
}

type PasswordOutcome = 'changed' | 'uncertain' | 'expired';

/** Quản trị users ghi một lần dưới khóa phiên. Tự khóa kết thúc phiên trước nhả khóa vì BE đã thu hồi JWT. */
export async function adminUserMutation(path:string,userId:number,init:RequestInit,isCurrent:()=>boolean,
  onEnded:(outcome:'disabled'|'uncertain'|'expired')=>void):Promise<{ended:boolean}>{
  const selfDisable=path===`admin/users/${userId}/enabled`&&init.method==='PATCH'
    &&typeof init.body==='string'&&JSON.parse(init.body).enabled===false;
  return withMutationActor(userId,isCurrent,async()=>{
    // Lưu mốc như đổi mật khẩu để request đọc/refresh đang chờ không khôi phục phiên đã tự khóa.
    const end=(outcome:'disabled'|'uncertain'|'expired',cleared:boolean)=>{
      const show=isCurrent();if(!cleared)markLogoutPending();
      localStorage.setItem(PASSWORD_SESSION_REVISION,crypto.randomUUID());announceSession('ended');if(show)onEnded(outcome);
      return {ended:true};
    };
    let response:Response;
    try{response=await send(path,init);}catch(error){if(selfDisable)return end('uncertain',false);throw error;}
    if(selfDisable){
      const cleared=response.headers.get('X-Jira-Session-Cleared')==='1';
      if(response.status===204||response.status>=500||response.status===401)
        return end(response.status===204&&cleared?'disabled':response.status===401?'expired':'uncertain',cleared);
    }
    // 403/404/409 xác định không ghi giữ phiên; target khác không ảnh hưởng cookie admin.
    await readResponse(response);return {ended:false};
  });
}

/** Tải byte dưới cùng khóa/actor với phiên; chỉ caller còn hiệu lực mới nhận Blob để tạo preview/download local. */
export async function connectedFile(path:string,userId:number,isCurrent:()=>boolean) {
  return withMutationActor(userId,isCurrent,async()=>{
    const response=await send(path);
    if(!response.ok)await readResponse(response);
    const blob=await response.blob();
    if(!isCurrent())throw new ConnectedError(409,'Phiên khởi tạo tải tệp đã kết thúc.');
    return blob;
  });
}

/** Password kết thúc phiên ngay dưới khóa. Probe actor chỉ chạy trước dispatch, vì BE204 vô hiệu JWT cũ. */
export async function changeConnectedPassword(
  userId: number,
  input: { oldPassword: string; newPassword: string },
  isCurrent: () => boolean,
  onEnded: (outcome: PasswordOutcome) => void,
) {
  return withMutationActor(userId, isCurrent, async () => {
    function end(outcome: PasswordOutcome, cleared: boolean) {
      const showOutcome = isCurrent();
      if (!cleared) markLogoutPending();
      // Mốc không chứa credential, dùng cả giữa các tab để bỏ refresh/replay đang chờ của phiên vừa kết thúc.
      localStorage.setItem(PASSWORD_SESSION_REVISION, crypto.randomUUID());
      announceSession('ended');
      if (showOutcome) onEnded(outcome);
    }

    let response: Response;
    try {
      response = await send('account/password', { method: 'POST', body: JSON.stringify(input) });
    } catch {
      end('uncertain', false);
      return;
    }
    const cleared = response.headers.get('X-Jira-Session-Cleared') === '1';
    if (response.ok || response.status >= 500 || response.status === 401) {
      const outcome = response.status === 204 && cleared ? 'changed'
        : response.status === 401 ? 'expired' : 'uncertain';
      end(outcome, cleared);
      return;
    }
    await readResponse<void>(response);
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
