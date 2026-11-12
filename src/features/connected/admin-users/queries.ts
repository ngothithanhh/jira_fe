'use client';
import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {adminUserMutation,connectedMutation,completeConnectedMutation,ConnectedError,hasPendingLogout} from '../client';
import {useSession,type AccountContext} from '../session';
import {useProjectMutationScope} from '../projects/queries';
import {configurationRead,configGateKey,useConfigurationGate} from '../configuration/queries';
import {userFrom,userPageFrom,type AdminRole} from './contract';
export type UserFilters={keyword:string;enabled:string;page:number;size:number};
export const adminUserKey=(actor:number|undefined)=>['connected','admin-users',actor] as const;

/** Danh sách nhận page từ BE, không lọc toàn bộ users ở browser; key tách actor và bộ lọc. */
export function useAdminUsers(filters:UserFilters){
  const session=useSession(),actor=session.data?.user.userId,gate=useConfigurationGate();
  const q=new URLSearchParams({page:String(filters.page),size:String(filters.size)});
  if(filters.keyword.trim())q.set('keyword',filters.keyword.trim());if(filters.enabled)q.set('enabled',filters.enabled);
  return useQuery({queryKey:[...adminUserKey(actor),'list',q.toString()],enabled:!!actor&&gate.data?.systemAdmin===true&&!session.switching,retry:false,
    queryFn:async({signal})=>userPageFrom(await configurationRead(actor!,'admin/users?'+q.toString(),signal))});
}

/** target là users.user_id được chọn; luôn tải lại DTO thật, không sửa object hàng list thành chi tiết giả. */
export function useAdminUser(target:number){
  const session=useSession(),actor=session.data?.user.userId,gate=useConfigurationGate();
  return useQuery({queryKey:[...adminUserKey(actor),'detail',target],enabled:!!actor&&gate.data?.systemAdmin===true&&!session.switching,retry:false,
    queryFn:async({signal})=>{const row=userFrom(await configurationRead(actor!,'admin/users/'+target,signal));if(row.userId!==target)throw new Error('Người dùng không khớp yêu cầu.');return row;}});
}

/** Role catalog chỉ để chọn ID đã tồn tại; không tự tạo role hoặc giả lập scope GLOBAL/PROJECT của demo. */
export function useAdminRoles(){
  const session=useSession(),actor=session.data?.user.userId,gate=useConfigurationGate();
  return useQuery({queryKey:[...adminUserKey(actor),'roles'],enabled:!!actor&&gate.data?.systemAdmin===true&&!session.switching,retry:false,
    queryFn:async({signal})=>{const rows=await configurationRead<AdminRole[]>(actor!,'user-role',signal);
      if(!Array.isArray(rows)||rows.some(r=>!r||!Number.isInteger(r.role)||r.role<=0||typeof r.roleName!=='string'))throw new Error('Danh mục vai trò không hợp lệ.');
      return rows;}});
}

/** Một action chỉ có một mutation. Hoàn tất quyền/context trước refetch; tự khóa kết thúc phiên theo response BE. */
export function useAdminUserWrite(options?:{domain:'admin-roles';entityLabel:string}){
  const session=useSession(),actor=session.data?.user.userId,client=useQueryClient(),capture=useProjectMutationScope(),router=useRouter();
  // Role CRUD dùng lại bảo vệ actor/completion của trang users nhưng có latch riêng, không xử lý nhánh tự khóa.
  const domainKey=options?['connected',options.domain,actor] as const:adminUserKey(actor);
  const uncertainKey=[...domainKey,'uncertain'] as const;
  const locked=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(()=>client.getQueryData<boolean>(uncertainKey)===true);
  const [status,setStatus]=useState(0);
  const affected=(q:{queryKey:readonly unknown[]})=>q.queryKey[0]==='connected'&&q.queryKey[2]===actor;
  const cacheCurrent=()=>!hasPendingLogout()&&client.getQueryData<AccountContext|null>(['connected','session'])?.user.userId===actor;
  /** Giữ action intent cố định khi xác nhận; không bật/tắt ngược theo DTO refetch hoặc replay khi chưa rõ kết quả. */
  async function run(path:string,init:RequestInit,allowed:()=>boolean,done:()=>void){
    if(!actor||locked.current||uncertain)return;
    const current=capture();locked.current=true;setBusy(true);setError('');setStatus(0);
    // Giữ cờ qua đóng modal/rời trang; chỉ reload hoặc completion xác nhận mới cho phép một mutation tiếp.
    // Query này không có observer; bỏ GC mặc định5 phút để rời trang lâu không tự mở lại quyền gửi.
    client.setQueryDefaults(uncertainKey,{gcTime:Infinity});
    client.setQueryData(uncertainKey,true);
    try{
      const canDispatch=()=>current()&&allowed()
        &&client.getQueryState(configGateKey(actor))?.status==='success'
        &&client.getQueryData<AccountContext>(configGateKey(actor))?.systemAdmin===true;
      const result=options?await connectedMutation(path,actor,init,canDispatch).then(()=>({ended:false})):
        await adminUserMutation(path,actor,init,canDispatch,outcome=>{
          toast[outcome==='disabled'?'success':'warning'](outcome==='disabled'?'Đã khóa tài khoản của bạn.':outcome==='expired'?'Phiên đăng nhập đã hết hạn.':'Chưa xác nhận được kết quả tự khóa tài khoản. Hãy thử đăng nhập lại.');
          router.replace('/app/sign-in');
        });
      if(result.ended)return;
      // Cache vẫn stale khi form rời trang; chỉ đọc/refetch nếu cookie vẫn thuộc actor đã ghi.
      await client.invalidateQueries({predicate:affected,refetchType:'none'});
      let contextRead:Promise<AccountContext>|undefined;
      if(!await completeConnectedMutation(actor,cacheCurrent,()=>{contextRead=configurationRead<AccountContext>(actor,'account/context',new AbortController().signal);}))
        throw new ConnectedError(0,'Không xác nhận được phiên sau khi lưu.');
      const context=await contextRead!;let refresh:Promise<unknown>|undefined,lostAdmin=false;
      if(!await completeConnectedMutation(actor,cacheCurrent,()=>{
        lostAdmin=!context.systemAdmin;
        // Gỡ quyền của chính actor vẫn giữ đăng nhập, nhưng mọi form admin và cache users phải biến mất.
        client.setQueryData(['connected','session'],context);client.setQueryData(configGateKey(actor),context);
        if(lostAdmin){client.removeQueries({queryKey:domainKey});toast.success('Đã cập nhật. Bạn không còn quyền quản trị hệ thống.');}
        else refresh=client.invalidateQueries({predicate:affected});
      }))throw new ConnectedError(0,'Không xác nhận được phiên sau khi lưu.');
      if(lostAdmin)return;
      await refresh;if(!current())return;
      if(client.getQueryCache().findAll({predicate:affected}).some(q=>q.isActive()&&q.state.status==='error'))
        throw new ConnectedError(0,'Chưa tải lại được dữ liệu sau khi lưu.');
      if(!await completeConnectedMutation(actor,current,()=>{client.setQueryData(uncertainKey,false);done();toast.success('Đã cập nhật '+(options?.entityLabel||'người dùng')+'.');}))
        throw new ConnectedError(0,'Không xác nhận được phiên sau khi lưu.');
    }catch(failure){
      if(!current())return;
      const status=failure instanceof ConnectedError?failure.status:0;
      // Chỉ đánh stale trước probe; lỗi401/403/409 không được refetch cache A bằng cookie B mới đăng nhập.
      await client.invalidateQueries({predicate:affected,refetchType:'none'});
      let refresh:Promise<unknown>|undefined;
      const confirmed=await completeConnectedMutation(actor,current,()=>{
        const unknown=status===0||status>=500;setUncertain(unknown);client.setQueryData(uncertainKey,unknown);
        setStatus(status);
        setError(unknown?'Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp.':failure instanceof Error?failure.message:'Không cập nhật được người dùng.');
        if(status===403||status===409)refresh=client.invalidateQueries({predicate:affected});
      });
      if(!confirmed&&current()){setUncertain(true);setError('Không xác nhận được phiên và kết quả. Tải lại trang trước khi thao tác tiếp.');}
      await refresh;
    }finally{locked.current=false;if(current())setBusy(false);}
  }
  return {run,busy,error,uncertain,status,clearError:()=>{setError('');setStatus(0);}};
}
