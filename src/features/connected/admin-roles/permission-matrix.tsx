'use client';
import {useRef,useState} from 'react';
import {Btn,Card,InlineAlert,Modal,tableClass,thClass,tdClass} from '@/components/project-ui/kit';
import {useRoleMatrix} from './queries';
import {permissionLabels,type MatrixRole} from './contract';
import {beginDraft,togglePermission,legacyIds,replacePayload,sameIds,type PermissionDraft} from './matrix-model';
import type {useAdminUserWrite} from '../admin-users/queries';
import {useProjectMutationScope} from '../projects/queries';
import {useSession} from '../session';
import {completeConnectedMutation} from '../client';
type Write=ReturnType<typeof useAdminUserWrite>;

/** Ma trận giữ một draft độc lập snapshot server; mọi grant legacy chỉ được gỡ khi có xác nhận rõ. */
export function PermissionMatrix({write,blocked,onEditingChange}:{write:Write;blocked:boolean;onEditingChange:(value:boolean)=>void}){
  const matrix=useRoleMatrix();
  const actor=useSession().data?.user.userId;
  const capture=useProjectMutationScope();
  const [reloading,setReloading]=useState(false);
  const loadingRef=useRef(false);
  const [reloadError,setReloadError]=useState('');
  const [draft,setDraft]=useState<PermissionDraft|null>(null),[confirmLegacy,setConfirmLegacy]=useState(false);
  const [intent,setIntent]=useState<{kind:'cancel'|'reload'|'switch';role?:MatrixRole}|null>(null);
  const canDispatch=!blocked&&!reloadError&&!matrix.isError&&!!matrix.data&&!!draft&&matrix.data.roles.some(r=>r.role===draft.roleId&&r.editablePermissions);
  const allowed=useRef(canDispatch);allowed.current=canDispatch;
  const locked=blocked||!!reloadError||matrix.isError||write.busy||write.uncertain||reloading;
  const dirty=!!draft&&!sameIds(draft.expectedPermissionIds,draft.permissionIds);
  const legacy=draft&&matrix.data?legacyIds(draft,matrix.data.permissions):[];
  const changed=dirty||legacy.length>0;
  /** Chuyển editor sau xác nhận; base được lấy ở đúng thời điểm bắt đầu sửa, không chạy effect ghi đè khi refetch. */
  function start(role:MatrixRole){setDraft(beginDraft(role));setConfirmLegacy(false);setReloadError('');write.clearError();onEditingChange(true);}
  function finish(){setDraft(null);setConfirmLegacy(false);write.clearError();onEditingChange(false);setIntent(null);}
  function choose(role:MatrixRole){
    if(draft?.roleId===role.role)return;
    if(draft&&(dirty||confirmLegacy))setIntent({kind:'switch',role});else start(role);
  }
  /** Tải lại theo lựa chọn người dùng; giữ draft cũ nếu API lỗi, không tự merge hay gửi lại sau409. */
  async function reload(){
    if(loadingRef.current||write.busy||write.uncertain)return;
    const current=capture();loadingRef.current=true;setReloading(true);
    const result=await matrix.refetch();
    if(!current()){loadingRef.current=false;return;}
    // Dữ liệu GET có thể vừa về lúc cookie đổi sang tài khoản khác; probe actor trước thay draft/xóa lỗi409.
    if(!result.isError&&result.data&&draft&&actor){const role=result.data.roles.find(r=>r.role===draft.roleId);
      if(role?.editablePermissions&&!await completeConnectedMutation(actor,current,()=>start(role))){
        if(current())setReloadError('Không xác nhận được phiên khi tải cấu hình. Bản nháp được giữ; tải lại trang trước khi thao tác tiếp.');
      }}
    loadingRef.current=false;setReloading(false);setIntent(null);
  }
  function save(){
    if(!draft||!matrix.data||!canDispatch||write.busy||write.uncertain||!changed||legacy.length>0&&!confirmLegacy||write.status===409)return;
    const payload=replacePayload(draft,matrix.data.permissions,confirmLegacy);
    void write.run('roles/'+draft.roleId+'/permissions',{method:'PUT',body:JSON.stringify(payload)},()=>allowed.current,finish);
  }
  return <Card title="Ma trận quyền">
    <div className="space-y-4">
      <p className="text-sm text-[#6b778c]">Mỗi lần lưu áp dụng cho một vai trò và tất cả thành viên đang dùng vai trò đó ở các dự án. Chủ dự án và SYSTEM_ADMIN giữ quyền quản lý theo quy tắc riêng.</p>
      {matrix.error&&<InlineAlert tone="error">{matrix.error.message} <Btn disabled={write.busy} onClick={()=>void matrix.refetch()}>Thử lại ma trận</Btn></InlineAlert>}
      {reloadError&&<InlineAlert tone="error">{reloadError}</InlineAlert>}
      {draft&&<div className="space-y-3 rounded border border-[#b3d4ff] bg-[#f4f8ff] p-3">
        <p className="text-sm font-semibold">Đang sửa quyền: {draft.roleName}</p>
        <div className="flex flex-wrap gap-2"><Btn variant="primary" disabled={locked||!changed||legacy.length>0&&!confirmLegacy||write.status===409} onClick={save}>Lưu quyền</Btn>
          <Btn disabled={write.busy||reloading} onClick={()=>dirty||confirmLegacy?setIntent({kind:'cancel'}):finish()}>Hủy sửa quyền</Btn>
          <Btn disabled={write.busy||write.uncertain||reloading} onClick={()=>dirty||confirmLegacy?setIntent({kind:'reload'}):void reload()}>Tải cấu hình mới</Btn></div>
        {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
        {write.uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn>}
        {legacy.length>0&&<InlineAlert tone="warning"><p>Các quyền cũ không áp dụng cho vai trò dự án: {legacy.map(id=>matrix.data?.permissions.find(p=>p.permissionId===id)?.permissionName||id).join(', ')}.</p>
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={confirmLegacy} disabled={locked} onChange={e=>setConfirmLegacy(e.target.checked)}/>Tôi xác nhận gỡ các quyền cũ này khi lưu.</label></InlineAlert>}
      </div>}
      {matrix.isPending?<p role="status">Đang tải ma trận quyền…</p>:matrix.data&&<div className="overflow-x-auto"><table className={tableClass} aria-label="Ma trận quyền vai trò"><thead><tr><th className={thClass}>Quyền</th>{matrix.data.roles.map(role=><th key={role.role} className={thClass}><div className="min-w-[155px]">{role.roleName}</div>{role.editablePermissions?<Btn variant="subtle" disabled={locked} aria-label={'Sửa quyền '+role.roleName} onClick={()=>choose(role)}>{draft?.roleId===role.role?'Đang sửa':'Sửa quyền'}</Btn>:<span className="text-xs font-normal">Luôn toàn quyền hệ thống</span>}</th>)}</tr></thead>
        <tbody>{matrix.data.permissions.map(permission=><tr key={permission.permissionId}><td className={tdClass}><code>{permission.permissionName}</code><p className="mt-1 min-w-[220px] text-xs text-[#6b778c]">{permissionLabels[permission.permissionName]||'Mã cũ chưa được hỗ trợ'}</p>{!permission.assignableToProjectRole&&<p className="text-xs text-[#974f0c]">Không cấp qua vai trò dự án</p>}</td>
          {matrix.data.roles.map(role=>{
            const editing=draft?.roleId===role.role;
            const stored=(editing?draft.permissionIds:role.permissionIds).includes(permission.permissionId);
            const inherent=permission.memberAlwaysAllowed||role.scope==='GLOBAL'&&permission.supported;
            return <td key={role.role} className={tdClass}><label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={permission.permissionName+' — '+role.roleName}
              checked={inherent||stored} disabled={locked||!editing||inherent||!permission.assignableToProjectRole}
              onChange={()=>setDraft(current=>current?togglePermission(current,permission):current)}/>{inherent?<span>{role.scope==='GLOBAL'?'Toàn quyền':'Có sẵn cho thành viên'}</span>:stored&&!permission.assignableToProjectRole?<span className="text-[#974f0c]">Lưu cũ; không áp dụng</span>:null}</label></td>;
          })}</tr>)}</tbody></table></div>}
    </div>
    {intent&&<Modal open title="Bỏ thay đổi chưa lưu?" onOpenChange={v=>{if(!v)setIntent(null);}} footer={<><Btn onClick={()=>setIntent(null)}>Tiếp tục sửa</Btn><Btn variant="danger" onClick={()=>{if(intent.kind==='cancel')finish();else if(intent.kind==='switch'&&intent.role){start(intent.role);setIntent(null);}else void reload();}}>Bỏ thay đổi</Btn></>}>
      <p>Bản nháp hiện tại chưa được lưu. Chỉ bỏ bản nháp khi bạn xác nhận.</p>
    </Modal>}
  </Card>;
}
