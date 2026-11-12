'use client';
import {useRef,useState} from 'react';
import {Btn,Field,InlineAlert,Modal,TextInput,PageHeading,Card,tableClass,thClass,tdClass} from '@/components/project-ui/kit';
import {useRoleCatalog} from './queries';
import {useAdminUserWrite} from '../admin-users/queries';
import {permissionLabels,type RoleRow} from './contract';

/** R1 hiển thị role thật và danh mục quyền chỉ đọc; không dựng matrix lưu giả hoặc scope/description không có trong DB. */
export function ConnectedAdminRoles(){
  const {roles,permissions,gate}=useRoleCatalog();
  const write=useAdminUserWrite({domain:'admin-roles',entityLabel:'vai trò'});
  const [draft,setDraft]=useState<{role:number|null;name:string}|null>(null),[removing,setRemoving]=useState<RoleRow|null>(null);
  const canDispatch=!!gate.data?.systemAdmin&&!gate.isError&&!roles.isError&&!permissions.isError&&!roles.isPending&&!permissions.isPending;
  const allowed=useRef(canDispatch);allowed.current=canDispatch;
  const blocked=!canDispatch||write.busy||write.uncertain;
  const retry=()=>{void gate.refetch();void roles.refetch();void permissions.refetch();};
  const close=()=>{if(!write.busy){setDraft(null);setRemoving(null);write.clearError();}};
  const error=gate.error||roles.error||permissions.error;
  const feedback=<>{error&&<InlineAlert tone="error">{error.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>}{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}{write.uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn>}</>;
  /** Chỉ một mutation theo ID đã chọn; giữ bản nháp khi server từ chối và chặn dispatch nếu quyền đã đổi lúc chờ khóa. */
  function submit(){
    if(!draft||blocked)return;
    void write.run(draft.role===null?'user-role':'user-role/'+draft.role,{method:draft.role===null?'POST':'PUT',body:JSON.stringify({roleName:draft.name})},()=>allowed.current,()=>setDraft(null));
  }
  return <div className="space-y-5">
    <PageHeading title="Vai trò & quyền" description="Chỉ SYSTEM_ADMIN quản trị toàn hệ thống. Các vai trò còn lại được gán trong từng dự án."
      actions={<Btn variant="primary" disabled={blocked} onClick={()=>{write.clearError();setDraft({role:null,name:''});}}>Tạo vai trò</Btn>}/>
    {feedback}
    {roles.isPending?<p role="status">Đang tải vai trò…</p>:<div className="overflow-x-auto"><table className={tableClass}><thead><tr>{['Tên vai trò','Phạm vi','Gán toàn cục','Thành viên dự án','Thao tác'].map(x=><th key={x} className={thClass}>{x}</th>)}</tr></thead>
    <tbody>{roles.data?.map(r=><tr key={r.role}><td className={tdClass}><strong>{r.roleName}</strong>{r.reservedName&&<span className="ml-2 text-xs text-[#6b778c]">Mặc định</span>}</td><td className={tdClass}>{r.scope==='GLOBAL'?'Hệ thống':'Dự án'}</td><td className={tdClass}>{r.globalAssignmentCount}{r.scope==='PROJECT'&&r.globalAssignmentCount>0&&<p className="mt-1 text-xs text-[#974f0c]">Gán cũ; không cấp quyền toàn cục. Gỡ tại Người dùng.</p>}</td><td className={tdClass}>{r.projectAssignmentCount}</td><td className={tdClass}>{r.reservedName?<span className="text-xs text-[#6b778c]">Giữ tên và vai trò mặc định</span>:<div className="flex gap-2"><Btn variant="subtle" disabled={blocked} aria-label={'Đổi tên '+r.roleName} onClick={()=>{write.clearError();setDraft({role:r.role,name:r.roleName});}}>Đổi tên</Btn><Btn variant="subtle" disabled={blocked} aria-label={'Xóa '+r.roleName} onClick={()=>{write.clearError();setRemoving(r);}}>Xóa</Btn></div>}</td></tr>)}</tbody></table>
    {roles.data?.length===0&&!roles.isError&&<p>Chưa có vai trò.</p>}</div>}
    <Card title="Danh mục quyền"><p className="mb-4 text-sm text-[#6b778c]">Danh mục chỉ xem. Chủ dự án quản lý dự án của mình; vai trò thành viên chỉ có hiệu lực trong dự án được gán.</p>
      {permissions.isPending?<p role="status">Đang tải danh mục quyền…</p>:<table className={tableClass}><thead><tr><th className={thClass}>Mã quyền</th><th className={thClass}>Ý nghĩa</th></tr></thead><tbody>{permissions.data?.map(p=><tr key={p.permissionId}><td className={tdClass}><code>{p.permissionName}</code></td><td className={tdClass}>{permissionLabels[p.permissionName]||'Mã legacy chưa được chương trình hỗ trợ'}</td></tr>)}</tbody></table>}
    </Card>
    {draft&&<Modal open title={draft.role===null?'Tạo vai trò':'Đổi tên vai trò'} onOpenChange={v=>{if(!v)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn variant="primary" type="submit" form="role-form" disabled={blocked||!draft.name.trim()}>Lưu vai trò</Btn></>}>
      <form id="role-form" className="space-y-4" onSubmit={e=>{e.preventDefault();submit();}}>{feedback}<Field label="Tên vai trò" required>{p=><TextInput {...p} required maxLength={50} disabled={write.busy||write.uncertain} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/>}</Field><p className="text-sm text-[#6b778c]">Mã được chuyển sang chữ hoa, bắt đầu bằng chữ, gồm A–Z, 0–9 và _. Vai trò mới dùng trong dự án và chưa có quyền ghi.</p></form>
    </Modal>}
    {removing&&<Modal open title="Xóa vai trò" onOpenChange={v=>{if(!v)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn variant="danger" disabled={blocked} onClick={()=>void write.run('user-role/'+removing.role,{method:'DELETE'},()=>allowed.current,()=>setRemoving(null))}>Xác nhận xóa</Btn></>}>
      <div className="space-y-3">{feedback}<p>Xóa “{removing.roleName}” và các cấu hình quyền của vai trò? Chỉ xóa được khi không còn người dùng hoặc thành viên dự án đang dùng. Không xóa tài khoản hay danh mục quyền.</p></div>
    </Modal>}
  </div>;
}
