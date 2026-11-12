export type RoleRow={role:number;roleName:string;scope:'GLOBAL'|'PROJECT';reservedName:boolean;editablePermissions:boolean;globalAssignmentCount:number;projectAssignmentCount:number};
export type PermissionRow={permissionId:number;permissionName:string};
const id=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=2147483647;
export const permissionLabels:Record<string,string>={
CREATE_PROJECT:'Tạo dự án — mọi tài khoản hoạt động',UPDATE_PROJECT:'Sửa thông tin dự án',DELETE_PROJECT:'Xóa dự án — chủ dự án hoặc quản trị hệ thống',
VIEW_PROJECT:'Xem dự án — thành viên luôn được xem',ADD_MEMBER:'Thêm và đổi vai trò thành viên',DELETE_MEMBER:'Gỡ thành viên',
CREATE_ISSUE:'Tạo công việc',EDIT_ISSUE:'Sửa công việc',DELETE_ISSUE:'Xóa công việc',CREATE_ISSUE_TYPE:'Cấu hình loại công việc — quản trị hệ thống',
MANAGE_SPRINT:'Quản lý sprint',MANAGE_BOARD:'Quản lý board',DELETE_USER:'Xóa tài khoản — quản trị hệ thống'};
/** BFF chỉ mở role CRUD và danh mục quyền read-only; không mở API grant cũ hoặc matrix trong R1. */
export function adminRoleRoute(path:string,method:string,q:URLSearchParams){
  let kind:'roles'|'permissions'|'create'|'update'|'delete'|undefined;
  if(path==='admin/roles'&&method==='GET')kind='roles';
  if(path==='permissions'&&method==='GET')kind='permissions';
  if(path==='user-role'&&method==='POST')kind='create';
  const match=/^user-role\/([^/]+)$/.exec(path);
  if(match&&['PUT','DELETE'].includes(method)){
    if(!/^[1-9]\d*$/.test(match[1])||!id(Number(match[1])))throw new Error('ID vai trò không hợp lệ.');
    kind=method==='PUT'?'update':'delete';
  }
  if(!kind)return null;
  if(q.size)throw new Error('Tham số không hợp lệ.');
  return {kind,write:['create','update','delete'].includes(kind),suffix:''};
}
/** Chỉ nhận một tên mã, không cho chèn actor/scope/permissions từ trình duyệt. */
export function roleBody(kind:string,raw:string){
  if(kind==='delete'){if(raw.trim())throw new Error('Thao tác này không nhận body.');return undefined;}
  const value=JSON.parse(raw);
  if(!value||Array.isArray(value)||Object.keys(value).length!==1||typeof value.roleName!=='string')throw new Error('Tên vai trò không hợp lệ.');
  const name=value.roleName.trim().toUpperCase();
  if(name.length>50||!name.match(/^[A-Z][A-Z0-9_]*$/))throw new Error('Tên cần 1–50 ký tự A–Z, 0–9 hoặc _, bắt đầu bằng chữ.');
  return JSON.stringify({roleName:name});
}
/** Giữ DTO đã kiểm tra, không thay số đếm lỗi thành0 hay suy scope từ trường demo. */
export function rolesFrom(value:unknown):RoleRow[]{
  if(!Array.isArray(value)||value.some(r=>!r||!id(r.role)||typeof r.roleName!=='string'||!['GLOBAL','PROJECT'].includes(r.scope)
    ||typeof r.reservedName!=='boolean'||typeof r.editablePermissions!=='boolean'||!Number.isSafeInteger(r.globalAssignmentCount)||r.globalAssignmentCount<0||!Number.isSafeInteger(r.projectAssignmentCount)||r.projectAssignmentCount<0)
    ||new Set(value.map(r=>r.role)).size!==value.length)throw new Error('Danh sách vai trò không hợp lệ.');
  return value.map(r=>({role:r.role,roleName:r.roleName,scope:r.scope,reservedName:r.reservedName,editablePermissions:r.editablePermissions,globalAssignmentCount:r.globalAssignmentCount,projectAssignmentCount:r.projectAssignmentCount}));
}
/** Alias canonical trùng phải dừng cấu hình, không chọn ngẫu nhiên một permissionId. */
export function permissionsFrom(value:unknown):PermissionRow[]{
  if(!Array.isArray(value)||value.some(r=>!r||!id(r.permissionId)||typeof r.permissionName!=='string')
    ||new Set(value.map(r=>r.permissionName.trim().toUpperCase())).size!==value.length
    ||new Set(value.map(r=>r.permissionId)).size!==value.length)throw new Error('Danh mục quyền không hợp lệ hoặc có mã trùng.');
  return value.map(r=>({permissionId:r.permissionId,permissionName:r.permissionName}));
}
