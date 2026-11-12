'use client';
import {useEffect,useRef,useState} from 'react';
import {Btn,Avatar,EmptyState,InlineAlert,Modal,PageHeading,Pagination,SearchInput,SelectInput,formatDate,tableClass,thClass,tdClass} from '@/components/project-ui/kit';
import {useConfigurationGate} from '../configuration/queries';
import {ConnectedError} from '../client';
import {useAdminUsers,useAdminUser,useAdminRoles,useAdminUserWrite,type UserFilters} from './queries';
import type {AdminUser,AdminRole} from './contract';

type Action={kind:'grant'|'revoke';role:AdminRole}|{kind:'enabled';enabled:boolean};
type Write=ReturnType<typeof useAdminUserWrite>;

/** Admin list giữ cùng bố cục mẫu; lọc/phân trang do API, chỉ đếm membership thật và avatar chữ cái đầu. */
export function ConnectedAdminUsers(){
  const [filters,setFilters]=useState<UserFilters>({keyword:'',enabled:'',page:0,size:20}),[keyword,setKeyword]=useState(''),[selected,setSelected]=useState<number|null>(null);
  const gate=useConfigurationGate(),list=useAdminUsers(filters),write=useAdminUserWrite();
  // Debounce chỉ đổi page khi keyword thật sự đổi, không kéo người dùng về trang1 sau click phân trang.
  useEffect(()=>{const timer=setTimeout(()=>setFilters(f=>f.keyword===keyword?f:{...f,keyword,page:0}),300);return()=>clearTimeout(timer);},[keyword]);
  useEffect(()=>{if(list.data&&filters.page>0&&filters.page>=list.data.totalPages)setFilters(f=>({...f,page:Math.max(0,list.data!.totalPages-1)}));},[list.data,filters.page]);
  const retry=()=>{void gate.refetch();void list.refetch();};
  const blocked=gate.isError||list.isError||write.busy||write.uncertain;
  return <div className="space-y-4"><PageHeading title="Người dùng" breadcrumbs={[{label:'Quản trị'},{label:'Người dùng'}]}/>
    <div className="flex flex-wrap gap-3"><SearchInput value={keyword} onChange={setKeyword} placeholder="Tên, tên đăng nhập, email" label="Tìm người dùng"/>
      <SelectInput aria-label="Lọc trạng thái tài khoản" className="w-auto" value={filters.enabled} onChange={e=>setFilters(f=>({...f,enabled:e.target.value,page:0}))}><option value="">Mọi trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Bị khóa</option></SelectInput><Btn disabled={list.isFetching} onClick={retry}>Tải lại dữ liệu</Btn></div>
    {list.error&&<InlineAlert tone="error">{list.error.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>}
    {write.uncertain&&<InlineAlert tone="warning">Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp. <Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn></InlineAlert>}
    {list.isPending?<p role="status">Đang tải người dùng…</p>:list.data&&<>
      {!list.data.items.length?<EmptyState title="Không có người dùng khớp"/>:<div className="overflow-x-auto"><table className={tableClass}><thead><tr>{['Người dùng','Email','Role hệ thống','Dự án tham gia','Trạng thái','Thao tác'].map(h=><th className={thClass} key={h}>{h}</th>)}</tr></thead>
      <tbody>{list.data.items.map(user=><tr key={user.userId} className="hover:bg-[#f4f5f7]"><td className={tdClass}><span className="flex items-center gap-2"><Avatar name={user.fullName||user.userName} size={28}/><span><span className="block font-medium">{user.fullName||user.userName}</span><span className="block text-xs text-[#6b778c]">@{user.userName}</span></span></span></td><td className={tdClass}>{user.email}</td><td className={tdClass}>{user.roles.map(r=>r.roleName).join(', ')||'—'}</td><td className={tdClass} title="Số dự án có quan hệ thành viên">{user.projectMembershipCount}</td><td className={tdClass}><UserState enabled={user.enabled}/></td><td className={tdClass}><Btn variant="subtle" disabled={write.busy} onClick={()=>{write.clearError();setSelected(user.userId);}}>Chi tiết</Btn></td></tr>)}</tbody></table></div>}
      <Pagination page={filters.page+1} totalPages={Math.max(1,list.data.totalPages)} totalItems={list.data.totalItems} size={filters.size} onPage={page=>setFilters(f=>({...f,page:page-1}))} onSize={size=>setFilters(f=>({...f,size,page:0}))}/>
    </>}
    {selected!==null&&<UserDetail key={selected} targetId={selected} write={write} parentError={gate.error||list.error} retryParent={retry} blocked={blocked} onClose={()=>setSelected(null)}/>}
  </div>;
}

/** Badge phân biệt boolean enabled từ DB, không suy trạng thái theo có role hoặc tên tài khoản. */
function UserState({enabled}:{enabled:boolean}){
  return <span className={'rounded-[3px] px-1.5 text-[11px] font-bold '+(enabled?'bg-[#e3fcef] text-[#006644]':'bg-[#ffebe6] text-[#bf2600]')}>{enabled?'HOẠT ĐỘNG':'BỊ KHÓA'}</span>;
}

/** Target ID giữ cố định trong modal. Mỗi role/đổi enabled xác nhận riêng, không ghép nhiều API thành Lưu tất cả. */
function UserDetail({targetId,write,parentError,retryParent,blocked,onClose}:{targetId:number;write:Write;parentError:Error|null;retryParent:()=>void;blocked:boolean;onClose:()=>void}){
  const detail=useAdminUser(targetId),roles=useAdminRoles(),[confirm,setConfirm]=useState<{action:Action;user:AdminUser}|null>(null);
  const denied=detail.error instanceof ConnectedError&&[401,403,404].includes(detail.error.status);
  const user=detail.data,failed=parentError||detail.error||roles.error;
  const canDispatch=!failed&&!write.uncertain&&!!user&&!!roles.data;
  const canWrite=!blocked&&canDispatch;
  // Busy chỉ khóa nút UI; không dùng nó hủy chính request đang chờ probe actor dưới khóa phiên.
  const allowed=useRef(canDispatch);allowed.current=canDispatch;
  const retry=()=>{retryParent();void detail.refetch();void roles.refetch();};
  // Giữ snapshot câu xác nhận dù background data đổi; intent gửi chính xác giá trị/role đã chọn.
  const open=(action:Action)=>{if(!canWrite||!user)return;write.clearError();setConfirm({action,user});};
  const submit=()=>{
    if(!confirm||!canWrite)return;
    const action=confirm.action;
    const path='admin/users/'+targetId+(action.kind==='enabled'?'/enabled':'/roles/'+action.role.role);
    const init=action.kind==='enabled'?{method:'PATCH',body:JSON.stringify({enabled:action.enabled})}:{method:action.kind==='grant'?'PUT':'DELETE'};
    void write.run(path,init,()=>allowed.current,()=>setConfirm(null));
  };
  return <Modal open title={user?(user.fullName||user.userName):'Chi tiết người dùng'} description={user?user.email:'Đang tải dữ liệu người dùng.'} width={600} onOpenChange={v=>{if(!v&&!write.busy)onClose();}}>
    {detail.isPending&&<p role="status">Đang tải chi tiết…</p>}
    {failed&&<InlineAlert tone="error">{failed.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>}
    {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    {write.uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn>}
    {user&&!denied&&<div className="space-y-5 pb-3"><dl className="grid grid-cols-[130px_1fr] gap-2 text-sm"><dt>Tên đăng nhập</dt><dd>{user.userName}</dd><dt>Ngày tạo</dt><dd>{formatDate(user.createdAt,true)}</dd><dt>Dự án tham gia</dt><dd>{user.projectMembershipCount} membership</dd></dl>
      <section><h3 className="mb-3 text-xs font-semibold text-[#6b778c]">Role hệ thống</h3>
        <div className="space-y-2">{roles.data?.map(role=>{const assigned=user.roles.some(r=>r.role===role.role);return <div key={role.role} className="flex items-center justify-between gap-3 rounded border border-[#ebecf0] px-3 py-2"><span className="text-sm">{role.roleName}{role.roleName.toUpperCase()==='SYSTEM_ADMIN'&&<span className="ml-2 text-xs text-[#974f0c]">(quản trị hệ thống)</span>}</span><Btn disabled={!canWrite} variant={assigned?'subtle':'secondary'} aria-label={(assigned?'Gỡ ':'Gán ')+role.roleName} onClick={()=>open({kind:assigned?'revoke':'grant',role})}>{assigned?'Gỡ':'Gán'}</Btn></div>;})}</div>
        <p className="mt-3 text-xs text-[#6b778c]">Mỗi thao tác lưu riêng. Vai trò trong từng dự án được quản lý ở trang Thành viên của dự án.</p>
      </section>
      <section className="space-y-3 border-t border-[#ebecf0] pt-4"><h3 className="text-xs font-semibold text-[#6b778c]">Trạng thái tài khoản</h3><UserState enabled={user.enabled}/><div><Btn disabled={!canWrite} variant={user.enabled?'danger':'primary'} onClick={()=>open({kind:'enabled',enabled:!user.enabled})}>{user.enabled?'Khóa tài khoản':'Mở khóa tài khoản'}</Btn></div></section>
    </div>}
    {confirm&&<Modal open title={confirm.action.kind==='enabled'?(confirm.action.enabled?'Mở khóa tài khoản?':'Khóa tài khoản?'):(confirm.action.kind==='grant'?'Gán role hệ thống?':'Gỡ role hệ thống?')} onOpenChange={v=>{if(!v&&!write.busy)setConfirm(null);}} footer={<><Btn disabled={write.busy} onClick={()=>setConfirm(null)}>Hủy</Btn><Btn variant={confirm.action.kind==='revoke'||confirm.action.kind==='enabled'&&!confirm.action.enabled?'danger':'primary'} disabled={!canWrite} onClick={submit}>Xác nhận</Btn></>}>
      <div className="space-y-3 text-sm"><p>{confirm.user.fullName||confirm.user.userName} · {confirm.user.email}</p>
        <p>{confirm.action.kind==='enabled'?(confirm.action.enabled?'Mở lại tài khoản. Các phiên cũ vẫn không được khôi phục.':'Khóa tài khoản và thu hồi phiên đăng nhập. Công việc và lịch sử được giữ nguyên.'):((confirm.action.kind==='grant'?'Gán ':'Gỡ ')+confirm.action.role.roleName+'. Thao tác không đổi vai trò trong từng dự án.')}</p>
        {failed&&<InlineAlert tone="error">{failed.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>}
        {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
        {write.uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn>}
      </div>
    </Modal>}
  </Modal>;
}
