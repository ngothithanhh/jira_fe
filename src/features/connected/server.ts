import { NextResponse } from 'next/server.js';
import { accountBody } from './account/contract.ts';
import { issueBody, issueRoute, type IssueRoute } from './issues/contract.ts';
import { boardBody, boardRoute, type BoardAction } from './board/contract.ts';
import { memberBody, memberRoute } from './members/contract.ts';
import { collaborationRoute, commentBody, readAttachment, readAttachmentContent, UploadInputError, type CollaborationRoute } from './collaboration/contract.ts';
import { configurationRoute,configurationBody,type ConfigurationAction } from './configuration/contract.ts';
import {adminUserRoute,adminUserBody,type AdminUserAction} from './admin-users/contract.ts';
import {adminRoleRoute,roleBody} from './admin-roles/contract.ts';
import { verificationRoute } from './registration/contract.ts';
import { verificationBackend } from './registration/server.ts';

const ACCESS = 'jira_access';
const REFRESH = 'jira_refresh';
const NO_STORE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const PASSWORD_UNCERTAIN = 'Chưa xác nhận được kết quả đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới.';

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
  const verification = verificationRoute(route, request.method);
  if (verification) return verificationBackend(request, verification, {
    access: readCookie(request, ACCESS), trustedOrigin: trustedOrigin(request),
    cookie: (name) => readCookie(request, name),
  });
  let adminRole:ReturnType<typeof adminRoleRoute>;
  try{adminRole=adminRoleRoute(route,request.method,new URL(request.url).searchParams);}catch(error){return failure(400,(error as Error).message);}
  // API issue chỉ mở theo whitelist riêng, kiểm query trước khi đọc cookie hay gọi Spring Boot.
  let issue: IssueRoute | null;
  let board: BoardAction | null;
  let collaboration: CollaborationRoute | null;
  let configuration: ConfigurationAction | null;
  let adminUser: AdminUserAction | null;
  try { const query=new URL(request.url).searchParams; issue = issueRoute(route, request.method, query); board = boardRoute(route, request.method, query); collaboration=collaborationRoute(route,request.method,query); configuration=configurationRoute(route,request.method,query); adminUser=adminUserRoute(route,request.method,query); }
  catch (error) { return failure(400, (error as Error).message); }
  const authAction = request.method === 'POST' && /^auth\/(login|refresh|logout)$/.test(route);
  const projectItem = /^projects\/([1-9]\d*)$/.exec(route);
  if (projectItem && Number(projectItem[1]) > 2147483647) return failure(400, 'ID dự án không hợp lệ.');
  const projectWrite = (request.method === 'POST' && route === 'projects/create') || (!!projectItem && ['PATCH', 'DELETE'].includes(request.method));
  const member = memberRoute(route, request.method);
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
    || (request.method === 'GET' && (['auth/me', 'account/context', 'projects/getList'].includes(route) || !!projectItem));
  const accountWrite = request.method === 'PATCH' && route === 'account/profile' ? 'profile'
    : request.method === 'POST' && route === 'account/password' ? 'password' : null;
  // Thêm tài khoản vào các API đã nối; giữ nguyên quyền truy cập project, board, thành viên, thông báo và báo cáo.
  const protectedAction = readAction || notificationMutation || projectWrite || !!issue || !!board || !!member || !!accountWrite || !!collaboration || !!configuration || !!adminUser || !!adminRole;
  if (!authAction && !protectedAction) return failure(404, 'Chức năng chưa được kết nối.');
  // Tất cả mutation dùng cookie đều kiểm Origin; public auth vẫn không nhận Bearer cũ.
  if ((authAction || notificationMutation || projectWrite || accountWrite || issue?.write || board?.write || collaboration?.write || configuration?.write || adminUser?.write || adminRole?.write || (member && member !== 'roles')) && !trustedOrigin(request)) return failure(403, 'Nguồn yêu cầu không hợp lệ.');

  // Chỉ chuyển query projectId hợp lệ; không chuyển actorId hoặc URL upstream từ người gọi.
  let suffix = issue?.suffix || board?.suffix || collaboration?.suffix || configuration?.suffix || adminUser?.suffix || '';
  if (!issue && !board && !collaboration && !configuration && !adminUser && !adminRole && !notificationRead && !notificationMutation && !reportRead && route !== 'account/context' && new URL(request.url).searchParams.size) return failure(400, 'Tham số không hợp lệ.');
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

  let body: string | FormData | undefined;
  // Role chỉ nhận mã tên; delete không có body, không cho gán quyền hoặc actor qua endpoint CRUD.
  if(adminRole?.write){const raw=await request.text();if(raw.length>1024)return failure(413,'Dữ liệu quá dài.');
    try{body=roleBody(adminRole.kind,raw);}catch(error){return failure(400,(error as Error).message);}}
  // Enabled chỉ là boolean; gán/gỡ role không có body. Kiểm trước gọi /me hoặc dispatch mutation.
  if(adminUser?.write){const raw=await request.text();if(raw.length>1024)return failure(413,'Dữ liệu quá dài.');
    try{body=adminUserBody(adminUser.kind,raw);}catch{return failure(400,'Dữ liệu quản trị người dùng không hợp lệ.');}}
  if(configuration?.write&&['assign','default','delete'].includes(configuration.kind)&& (await request.text()).trim())return failure(400,'Thao tác này không nhận body.');
  // Catalog chỉ nhận tên/nhóm hoặc hai ID status; gán/default/gỡ project không nhận actor/role từ body.
  if(configuration&&['type','status','rule'].includes(configuration.kind)){
    const raw=await request.text();if(raw.length>4096)return failure(413,'Dữ liệu cấu hình quá dài.');
    try{body=configurationBody(configuration.kind as 'type'|'status'|'rule',JSON.parse(raw));}catch(error){return failure(400,error instanceof SyntaxError?'JSON không hợp lệ.':(error as Error).message);}
  }
  // Parse riêng JSON comment và multipart, sau xác thực/Origin nhưng trước khi gọi BE.
  if(collaboration?.kind==='upload'){
    try{body=await readAttachment(request);}catch(error){return failure(error instanceof UploadInputError?error.status:400,(error as Error).message);}
  }else if(collaboration?.kind==='comment'||collaboration?.kind==='edit-comment'){
    const raw=await request.text();if(raw.length>65536)return failure(413,'Bình luận quá dài.');
    try{body=commentBody(collaboration.kind,JSON.parse(raw));}catch(error){return failure(400,error instanceof SyntaxError?'JSON không hợp lệ.':(error as Error).message);}
  }
  if (route === 'auth/login') {
    // Giới hạn form và chỉ chuyển các trường hợp đồng; không nhận quyền/role hoặc refresh token từ body browser.
    const raw = await request.text();
    if (raw.length > 8192) return failure(413, 'Thông tin đăng nhập quá dài.');
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return failure(400, 'Dữ liệu không hợp lệ.'); }
    if (!input || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 100
      || typeof input.password !== 'string' || !input.password || Buffer.byteLength(input.password, 'utf8') > 72) return failure(400, 'Email hoặc mật khẩu không hợp lệ.');
    body = JSON.stringify({ email: input.email.trim(), password: input.password });
  } else if (authAction) body = JSON.stringify({ refreshToken: refresh });
  if (projectWrite && request.method !== 'DELETE') {
    // Chỉ cho phép tên/mô tả và key khi tạo; lead/ID/quyền/counter từ browser bị loại bỏ.
    const raw = await request.text();
    if (raw.length > 8192) return failure(413, 'Thông tin dự án quá dài.');
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return failure(400, 'Dữ liệu không hợp lệ.'); }
    if (!input || typeof input.projectName !== 'string' || !input.projectName.trim() || input.projectName.length > 100
      || (input.description !== undefined && input.description !== null && (typeof input.description !== 'string' || input.description.length > 255))) return failure(400, 'Thông tin dự án không hợp lệ.');
    const payload: Record<string, unknown> = { projectName: input.projectName.trim(), description: input.description ?? null };
    if (route === 'projects/create') {
      if (typeof input.projectKey !== 'string' || !input.projectKey.trim() || input.projectKey.length > 10) return failure(400, 'Mã dự án cần từ 1 đến 10 ký tự.');
      payload.projectKey = input.projectKey.trim();
    }
    body = JSON.stringify(payload);
  }
  // Giới hạn payload lập kế hoạch; các thao tác link/status/assign không cần body.
  if (issue?.write && ['create','edit','order','sprint'].includes(issue.kind)) {
    const raw = await request.text();
    if (raw.length > 1048576) return failure(413, 'Dữ liệu quá dài.');
    try { body = issueBody(issue.kind, JSON.parse(raw)); }
    catch (error) { return failure(400, error instanceof SyntaxError ? 'Dữ liệu không hợp lệ.' : (error as Error).message); }
  }
  if (member === 'search' || member === 'add' || member === 'role') {
    const raw = await request.text();
    if (raw.length > 8192) return failure(413, 'Dữ liệu quá dài.');
    try { body = memberBody(member, JSON.parse(raw)); }
    catch (error) { return failure(400, error instanceof SyntaxError ? 'Dữ liệu không hợp lệ.' : (error as Error).message); }
  }

  // Route board dùng contract riêng; mọi thao tác vẫn dùng chung cookie, Origin và khóa phiên của connected.
  if (board?.write && !['delete','unmap'].includes(board.kind)) {
    const raw=await request.text();
    if(raw.length>16384)return failure(413,'Dữ liệu board quá dài.');
    try {body=boardBody(board.kind,JSON.parse(raw));}
    catch(error){return failure(400,error instanceof SyntaxError?'Dữ liệu không hợp lệ.':(error as Error).message);}
  }
  if (accountWrite) {
    const raw = await request.text();
    if (raw.length > 8192) return failure(413, 'Dữ liệu tài khoản quá dài.');
    try { body = accountBody(accountWrite, JSON.parse(raw)); }
    catch (error) { return failure(400, error instanceof SyntaxError ? 'Dữ liệu không hợp lệ.' : (error as Error).message); }
  }
  let disablingSelf=false;
  try {
    // Địa chỉ chỉ lấy từ cấu hình server, không dùng NEXT_PUBLIC_API_URL và không follow redirect mang Bearer ra nơi khác.
    const base = process.env.BACKEND_API_URL || 'http://127.0.0.1:8080/api';
    // Xác định actor bằng JWT thật trước disable; client không được tự khai isSelf để làm BFF xóa cookie người khác.
    if(adminUser?.kind==='enabled'&&typeof body==='string'&&JSON.parse(body).enabled===false){
      const probe=await fetch(`${base.replace(/\/$/,'')}/auth/me`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!probe.ok)return failure(probe.status,'Không xác nhận được tài khoản quản trị.');
      const identity=await probe.json();if(!Number.isInteger(identity?.user?.id))return failure(502,'Không xác nhận được tài khoản quản trị.');
      disablingSelf=identity.user.id===adminUser.targetId;
    }
    const upstream = await fetch(`${base.replace(/\/$/, '')}/${route}${suffix}`, {
      method: request.method, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(collaboration?.kind==='upload'||collaboration?.kind==='delete-file'?60000:12000),
      // Auth public dùng form/refresh token riêng; Bearer cũ không được chặn login, refresh hoặc logout ở JWT filter.
      headers: { ...(typeof body==='string' ? { 'Content-Type': 'application/json' } : {}), ...(protectedAction && access ? { Authorization: `Bearer ${access}` } : {}) },
    });
    if (route === 'auth/logout') {
      // Đóng phiên cục bộ kể cả mất kết nối/revoke lỗi; không thông báo đã thu hồi phía BE nếu BE không xác nhận.
      return clearSession(upstream.ok ? new NextResponse(null, { status: 204, headers: NO_STORE }) : failure(upstream.status, 'Đã thoát trên máy này nhưng chưa xác nhận thu hồi phiên trên máy chủ.'));
    }
    // Tự khóa đã vô hiệu JWT trước response; xóa cookie ngay, không probe lại bằng token cũ để chốt thành công.
    if(disablingSelf&&(upstream.status===204||upstream.status>=500))return clearSession(upstream.status===204
      ?new NextResponse(null,{status:204,headers:NO_STORE}):failure(502,'Chưa xác nhận được kết quả tự khóa tài khoản.'));
    if (accountWrite === 'password') {
      // BE204 đã tăng auth_version. Xóa cả hai cookie trước khi browser nhả khóa phiên.
      if (upstream.status === 204) return clearSession(new NextResponse(null, { status: 204, headers: NO_STORE }));
      if (upstream.status === 401) return clearSession(failure(401, 'Phiên đăng nhập đã hết hạn.'));
      if (upstream.status === 400) return failure(400, 'Mật khẩu hiện tại không đúng.');
      if (upstream.ok || upstream.status >= 500) return clearSession(failure(502, PASSWORD_UNCERTAIN));
    }
    if (!upstream.ok) {
      let message = upstream.status === 401 ? 'Thông tin đăng nhập hoặc phiên không hợp lệ.' : 'Không thể thực hiện yêu cầu.';
      if (upstream.status === 403) message = 'Bạn không có quyền thực hiện.';
      if (upstream.status === 404) message = 'Không tìm thấy dữ liệu.';
      if (upstream.status === 409) message = 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng kiểm tra lại.';
      if (upstream.status === 409 && route === 'projects/create') message = 'Mã dự án đã tồn tại. Vui lòng dùng mã khác.';
      if(upstream.status===409&&adminUser)message='Phải giữ ít nhất một quản trị viên đang hoạt động. Tải lại để kiểm tra quyền và trạng thái mới nhất.';
      if (upstream.status === 409 && projectItem && request.method === 'DELETE') message = 'Dự án còn dữ liệu liên kết nên chưa thể xóa.';
      if (upstream.status === 409 && issue) message = 'Dữ liệu đã thay đổi hoặc còn liên kết. Tải lại để kiểm tra trước khi thực hiện lại.';
      if (upstream.status === 400 && issue) message = 'Thao tác không hợp lệ với dữ liệu hiện tại. Kiểm tra loại công việc, workflow, người nhận và sprint.';
      if (upstream.status === 409 && board) message = 'Card/cấu hình đã thay đổi, cột đạt WIP hoặc sprint không còn cho phép thao tác. Tải lại trước khi thử tiếp.';
      if (upstream.status === 400 && board) message = 'Cột, trạng thái hoặc vị trí không hợp lệ với board hiện tại.';
      if(configuration&&upstream.status===409){
        message=configuration.kind==='rule'?'Cạnh workflow đã tồn tại.':configuration.kind==='type'?'Tên loại công việc đã tồn tại.':configuration.kind==='status'?'Tên trạng thái đã có hoặc nhóm khác nhóm cố định ban đầu.'
          :configuration.projectId!==undefined?'Loại đã gán, đang dùng hoặc là mặc định. Kiểm tra cấu hình trước khi gỡ/đổi.':'Cấu hình còn liên kết issue, project, mapping, workflow hoặc lịch sử nên chưa thể xóa.';
      }
      if(adminRole&&upstream.status===409)message='Vai trò mặc định, tên bị trùng hoặc dữ liệu còn được sử dụng. Tải lại để kiểm tra.';
      if(adminUser?.kind==='grant'&&upstream.status===400)message='Chỉ SYSTEM_ADMIN được gán toàn hệ thống. Role khác được gán ở trang Thành viên dự án.';
      const response = failure(upstream.status, message);
      return route === 'auth/refresh' && upstream.status === 401 ? clearSession(response) : response;
    }
    // File local trả byte thật sau quyền BE; không parse JSON hoặc redirect tới URL do metadata chỉ định.
    if(collaboration?.kind==='content'){
      try{
        const bytes=await readAttachmentContent(upstream),mime=upstream.headers.get('content-type')?.split(';')[0]||'';
        const allowed=/^image\/(png|jpeg|gif|webp|bmp)$/.test(mime)?mime:'application/octet-stream';
        return new NextResponse(bytes,{headers:{...NO_STORE,'Content-Type':allowed,'Content-Disposition':upstream.headers.get('content-disposition')||'attachment','X-Content-Type-Options':'nosniff'}});
      }catch(error){return failure(error instanceof UploadInputError?error.status:502,'Không tải được nội dung tệp.');}
    }
    // DELETE project có thể trả 200 rỗng, endpoint khác trả204; không cố parse JSON làm thành lỗi502.
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: NO_STORE });
    const text = await upstream.text();
    if (!text && !authAction) return new NextResponse(null, { status: upstream.status, headers: NO_STORE });
    const data = JSON.parse(text);
    // Comment/upload giữ201 từ BE; các route cũ giữ nguyên hợp đồng200 đã nối trước đó.
    return authAction ? establishSession(data) : NextResponse.json(data, { headers: NO_STORE, status: collaboration||configuration||adminRole ? upstream.status : 200 });
  } catch {
    if(disablingSelf)return clearSession(failure(502,'Chưa xác nhận được kết quả tự khóa tài khoản.'));
    if (accountWrite === 'password') return clearSession(failure(502, PASSWORD_UNCERTAIN));
    const response = failure(502, route === 'auth/logout'
      ? 'Đã thoát trên máy này nhưng chưa xác nhận thu hồi phiên trên máy chủ.'
      : 'Không kết nối được máy chủ. Vui lòng thử lại.');
    return route === 'auth/logout' ? clearSession(response) : response;
  }
}
