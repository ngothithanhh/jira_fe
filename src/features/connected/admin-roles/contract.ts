export type RoleRow={role:number;roleName:string;scope:'GLOBAL'|'PROJECT';reservedName:boolean;editablePermissions:boolean;globalAssignmentCount:number;projectAssignmentCount:number};
export type PermissionRow={permissionId:number;permissionName:string};
const id=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=2147483647;
export const permissionLabels:Record<string,string>={
CREATE_PROJECT:'Tạo dự án — mọi tài khoản hoạt động',UPDATE_PROJECT:'Sửa thông tin dự án',DELETE_PROJECT:'Xóa dự án — chủ dự án hoặc quản trị hệ thống',
VIEW_PROJECT:'Xem dự án — thành viên luôn được xem',ADD_MEMBER:'Thêm và đổi vai trò thành viên',DELETE_MEMBER:'Gỡ thành viên',
CREATE_ISSUE:'Tạo công việc',EDIT_ISSUE:'Sửa công việc',DELETE_ISSUE:'Xóa công việc',CREATE_ISSUE_TYPE:'Cấu hình loại công việc — quản trị hệ thống',
MANAGE_SPRINT:'Quản lý sprint',MANAGE_BOARD:'Quản lý board',DELETE_USER:'Xóa tài khoản — quản trị hệ thống'};
/** BFF chỉ mở CRUD và snapshot/PUT ma trận; API grant lẻ không được dùng để giả lưu nguyên tử. */
export function adminRoleRoute(path:string,method:string,q:URLSearchParams){
  let kind:'roles'|'permissions'|'create'|'update'|'delete'|'matrix'|'snapshot'|'replace'|undefined;
  if(path==='admin/roles'&&method==='GET')kind='roles';
  if(path==='permissions'&&method==='GET')kind='permissions';
  if(path==='user-role'&&method==='POST')kind='create';
  if(path==='admin/role-permissions'&&method==='GET')kind='matrix';
  const grants=/^roles\/([^/]+)\/permissions$/.exec(path);
  if(grants&&['GET','PUT'].includes(method)){
    if(!/^[1-9]\d*$/.test(grants[1])||!id(Number(grants[1])))throw new Error('ID vai trò không hợp lệ.');
    kind=method==='GET'?'snapshot':'replace';
  }
  const match=/^user-role\/([^/]+)$/.exec(path);
  if(match&&['PUT','DELETE'].includes(method)){
    if(!/^[1-9]\d*$/.test(match[1])||!id(Number(match[1])))throw new Error('ID vai trò không hợp lệ.');
    kind=method==='PUT'?'update':'delete';
  }
  if(!kind)return null;
  if(q.size)throw new Error('Tham số không hợp lệ.');
  return {kind,write:['create','update','delete','replace'].includes(kind),suffix:''};
}
/** Chỉ nhận một tên mã, không cho chèn actor/scope/permissions từ trình duyệt. */
export function roleBody(kind:string,raw:string){
  if(kind==='delete'){if(raw.trim())throw new Error('Thao tác này không nhận body.');return undefined;}
  const value=JSON.parse(raw);
  if(kind==='replace'){
    if(!value||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'expectedPermissionIds')||!Object.hasOwn(value,'permissionIds'))
      throw new Error('Tập quyền không hợp lệ.');
    return JSON.stringify({expectedPermissionIds:permissionIds(value.expectedPermissionIds),permissionIds:permissionIds(value.permissionIds)});
  }
  if(!value||Array.isArray(value)||Object.keys(value).length!==1||typeof value.roleName!=='string')throw new Error('Tên vai trò không hợp lệ.');
  const name=value.roleName.trim().toUpperCase();
  if(name.length>50||!name.match(/^[A-Z][A-Z0-9_]*$/))throw new Error('Tên cần 1–50 ký tự A–Z, 0–9 hoặc _, bắt đầu bằng chữ.');
  return JSON.stringify({roleName:name});
}

export type MatrixPermission=PermissionRow&{supported:boolean;assignableToProjectRole:boolean;memberAlwaysAllowed:boolean};
export type MatrixRole=RoleRow&{permissionIds:number[]};
export type RoleMatrix={roles:MatrixRole[];permissions:MatrixPermission[]};
/** Tập snapshot được sort để so nội dung; chặn ép kiểu, trùng, âm và tập quá lớn từ cả UI/upstream. */
export function permissionIds(value:unknown):number[]{
  if(!Array.isArray(value)||value.length>1000||value.some(v=>!id(v))||new Set(value).size!==value.length)throw new Error('Tập quyền không hợp lệ.');
  return [...value].sort((a,b)=>a-b);
}
/** Snapshot chỉ nhận ID có trong danh mục thật; thiếu grant không được biến thành checkbox đã bật mặc định. */
export function matrixFrom(value:unknown):RoleMatrix{
  const data=value as RoleMatrix;
  if(!data||!Array.isArray(data.roles)||!Array.isArray(data.permissions))throw new Error('Ma trận quyền không hợp lệ.');
  const rows=rolesFrom(data.roles),catalog=permissionsFrom(data.permissions),ids=new Set(catalog.map(p=>p.permissionId));
  const permissions=catalog.map((p,index)=>{
    const r=data.permissions[index];
    if(typeof r.supported!=='boolean'||typeof r.assignableToProjectRole!=='boolean'||typeof r.memberAlwaysAllowed!=='boolean'
      ||r.assignableToProjectRole&&!r.supported||r.memberAlwaysAllowed&&p.permissionName!=='VIEW_PROJECT')throw new Error('Metadata quyền không hợp lệ.');
    return {...p,supported:r.supported,assignableToProjectRole:r.assignableToProjectRole,memberAlwaysAllowed:r.memberAlwaysAllowed};
  });
  const roles=rows.map((r,index)=>{const stored=permissionIds(data.roles[index].permissionIds);
    if(stored.some(id=>!ids.has(id))||(r.scope==='GLOBAL')!==(r.roleName.toUpperCase()==='SYSTEM_ADMIN')||r.editablePermissions===(r.scope==='GLOBAL'))throw new Error('Snapshot vai trò không hợp lệ.');
    return {...r,permissionIds:stored};});
  return {roles,permissions};
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
