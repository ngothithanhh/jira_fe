import type {MatrixRole,MatrixPermission} from './contract';
export type PermissionDraft={roleId:number;roleName:string;expectedPermissionIds:number[];permissionIds:number[]};
/** Bắt đầu sửa bằng bản sao; background refetch không được đổi base hoặc draft người dùng đang chọn. */
export function beginDraft(role:MatrixRole):PermissionDraft{
  return {roleId:role.role,roleName:role.roleName,expectedPermissionIds:[...role.permissionIds],permissionIds:[...role.permissionIds]};
}
/** Chỉ toggle grant theo role; VIEW_PROJECT là quyền membership sẵn có, giữ stored ID hiện tại. */
export function togglePermission(draft:PermissionDraft,permission:MatrixPermission):PermissionDraft{
  if(!permission.assignableToProjectRole||permission.memberAlwaysAllowed)return draft;
  const ids=new Set(draft.permissionIds);
  if(ids.has(permission.permissionId))ids.delete(permission.permissionId);else ids.add(permission.permissionId);
  return {...draft,permissionIds:[...ids].sort((a,b)=>a-b)};
}
export function sameIds(a:number[],b:number[]){const right=[...b].sort((x,y)=>x-y);return a.length===b.length&&[...a].sort((x,y)=>x-y).every((v,i)=>v===right[i]);}
/** Legacy grant chỉ được gỡ khi người dùng đã xác nhận; phần giữ lại không tự thêm VIEW/default hoặc đổi ID. */
export function legacyIds(draft:PermissionDraft,permissions:MatrixPermission[]){
  const valid=new Set(permissions.filter(p=>p.assignableToProjectRole).map(p=>p.permissionId));
  return draft.permissionIds.filter(id=>!valid.has(id));
}
export function replacePayload(draft:PermissionDraft,permissions:MatrixPermission[],confirmLegacy:boolean){
  const invalid=legacyIds(draft,permissions);
  if(invalid.length&&!confirmLegacy)throw new Error('Cần xác nhận gỡ các quyền cũ không áp dụng.');
  return {expectedPermissionIds:[...draft.expectedPermissionIds],permissionIds:draft.permissionIds.filter(id=>!invalid.includes(id))};
}
