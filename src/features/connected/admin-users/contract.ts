export type AdminUserAction={kind:'list'|'detail'|'roles'|'grant'|'revoke'|'enabled';write:boolean;targetId?:number;suffix:string};
const validId=(v:string)=>/^[1-9]\d*$/.test(v)&&Number(v)<=2147483647;
const natural=(v:string)=>/^(0|[1-9]\d*)$/.test(v)&&Number.isSafeInteger(Number(v));
/** Chỉ mở trang quản trị users và từng cặp user/role; không cho arbitrary admin route hoặc trường actor. */
export function adminUserRoute(path:string,method:string,q:URLSearchParams):AdminUserAction|null{
  const target=/^admin\/users\/([^/]+)(?:\/(roles|enabled)(?:\/([^/]+))?)?$/.exec(path);
  let kind:AdminUserAction['kind']|undefined;
  if(path==='admin/users'&&method==='GET')kind='list';
  if(target){
    if(!validId(target[1])||target[3]!==undefined&&!validId(target[3]))throw new Error('ID người dùng/vai trò không hợp lệ.');
    if(method==='GET'&&!target[2])kind='detail';
    if(method==='GET'&&target[2]==='roles'&&!target[3])kind='roles';
    if(target[2]==='roles'&&target[3]&&method==='PUT')kind='grant';
    if(target[2]==='roles'&&target[3]&&method==='DELETE')kind='revoke';
    if(target[2]==='enabled'&&!target[3]&&method==='PATCH')kind='enabled';
  }
  if(!kind)return null;
  if(kind!=='list'&&q.size)throw new Error('Tham số không hợp lệ.');
  const normalized=new URLSearchParams();
  for(const [key,value]of q){
    if(q.getAll(key).length!==1||!['keyword','enabled','page','size'].includes(key))throw new Error('Bộ lọc không hợp lệ.');
    if(key==='keyword'&&value.length>100||key==='enabled'&&!['true','false'].includes(value)
      ||['page','size'].includes(key)&&!natural(value))throw new Error('Bộ lọc không hợp lệ.');
    normalized.set(key,key==='keyword'?value.trim():value);
  }
  const page=Number(q.get('page')||0),size=Number(q.get('size')||20);
  if(size<1||size>100||page*size>2147483647)throw new Error('Phân trang không hợp lệ.');
  return {kind,write:['grant','revoke','enabled'].includes(kind),...(target?{targetId:Number(target[1])}:{}),suffix:normalized.size?'?'+normalized.toString():''};
}
/** Khóa/mở chỉ nhận enabled boolean; gán/gỡ role không nhận body, actor hoặc danh sách role để tránh batch giả nguyên tử. */
export function adminUserBody(kind:AdminUserAction['kind'],raw:string){
  if(kind==='grant'||kind==='revoke'){if(raw.trim())throw new Error('Thao tác này không nhận body.');return undefined;}
  if(kind!=='enabled')return undefined;
  const data=JSON.parse(raw);
  if(!data||Array.isArray(data)||Object.keys(data).length!==1||typeof data.enabled!=='boolean')throw new Error('Trạng thái tài khoản không hợp lệ.');
  return JSON.stringify({enabled:data.enabled});
}
export type AdminRole={role:number;roleName:string};
export type AdminUser={userId:number;userName:string;fullName:string|null;email:string;enabled:boolean;createdAt:string|null;roles:AdminRole[];projectMembershipCount:number};
export type AdminUserPage={items:AdminUser[];page:number;size:number;totalItems:number;totalPages:number};
/** Không lấp dữ liệu sai bằng count0; DTO chỉ giữ trường hiển thị, không lấy password/hash từ upstream. */
export function userFrom(value:unknown):AdminUser{
  const r=value as AdminUser;
  if(!r||!validId(String(r.userId))||typeof r.userId!=='number'||typeof r.userName!=='string'||typeof r.email!=='string'
    ||typeof r.enabled!=='boolean'||r.fullName!==null&&typeof r.fullName!=='string'||r.createdAt!==null&&typeof r.createdAt!=='string'
    ||!Number.isSafeInteger(r.projectMembershipCount)||r.projectMembershipCount<0||!Array.isArray(r.roles)
    ||r.roles.some(role=>!role||!validId(String(role.role))||typeof role.role!=='number'||typeof role.roleName!=='string'))throw new Error('Dữ liệu người dùng không hợp lệ.');
  return {userId:r.userId,userName:r.userName,fullName:r.fullName,email:r.email,enabled:r.enabled,createdAt:r.createdAt,
    roles:r.roles.map(role=>({role:role.role,roleName:role.roleName})),projectMembershipCount:r.projectMembershipCount};
}
export function userPageFrom(value:unknown):AdminUserPage{
  const r=value as AdminUserPage;
  if(!r||!Array.isArray(r.items)||![r.page,r.size,r.totalItems,r.totalPages].every(n=>Number.isSafeInteger(n)&&n>=0)||r.size<1||r.size>100
    ||r.items.length>r.size)throw new Error('Trang người dùng không hợp lệ.');
  return {items:r.items.map(userFrom),page:r.page,size:r.size,totalItems:r.totalItems,totalPages:r.totalPages};
}
