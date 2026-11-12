'use client';
import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {connectedRequest,connectedMutation,completeConnectedMutation,ConnectedError,hasPendingLogout,withSessionLock} from '../client';
import {useSession,type AccountContext} from '../session';
import {useProjectMutationScope,projectKeys} from '../projects/queries';
import {projectTypeFrom,type ProjectType} from './contract';
export type IssueType={issueTypeId:number;typeName:string};
export type Status={statusId:number;statusName:string;statusCategory:'TO_DO'|'IN_PROGRESS'|'DONE'};
export type Rule={ruleId:number;fromStatus:Status;toStatus:Status};
type Catalog={types:IssueType[];statuses:Status[];rules:Rule[];'project-types':ProjectType[]};
export const configGateKey=(actor?:number)=>['connected','config-gate',actor] as const;
export const configKey=(actor:number|undefined,kind:keyof Catalog,project?:number)=>['connected','configuration',actor,kind,project] as const;

/** Đọc dưới khóa phiên như inbox/members; GET401 refresh ngoài khóa rồi probe actor lại, không trộn dữ liệu hai tài khoản. */
export async function configurationRead<T>(actor:number,path:string,signal:AbortSignal):Promise<T>{
  const read=()=>withSessionLock(async()=>{
    signal.throwIfAborted();
    if(hasPendingLogout())throw new ConnectedError(401,'Phiên đã đóng.');
    const context=await connectedRequest<AccountContext>('account/context',{signal},false);
    if(context.user.userId!==actor||signal.aborted||hasPendingLogout())throw new ConnectedError(409,'Tài khoản đã thay đổi.');
    return path==='account/context'?context as T:connectedRequest<T>(path,{signal},false);
  });
  try{return await read();}catch(error){if(signal.aborted||!(error instanceof ConnectedError)||error.status!==401)throw error;
    await connectedRequest('auth/me',{signal});return read();}
}

/** Admin gate là context thật; lỗi refetch503 giữ form nhưng khóa ghi, 403 hoặc systemAdmin=false bỏ form quản trị. */
export function useConfigurationGate(){
  const session=useSession(),actor=session.data?.user.userId;
  return useQuery({queryKey:configGateKey(actor),enabled:!!actor&&!session.switching,retry:false,
    queryFn:({signal})=>configurationRead<AccountContext>(actor!,'account/context',signal)});
}

/** Danh mục chỉ chứa dữ liệu hợp đồng thật. default của BE được chuẩn hóa trước khi project form hoặc issue picker sử dụng. */
export function useConfiguration<K extends keyof Catalog>(kind:K,projectId?:number,enabled=true){
  const session=useSession(),actor=session.data?.user.userId;
  const path=kind==='types'?'issue-types':kind==='statuses'?'issue-statuses':kind==='rules'?'workflows/rules':'projects/'+projectId+'/issue-types';
  return useQuery({queryKey:configKey(actor,kind,projectId),enabled:enabled&&!!actor&&!session.switching,retry:false,
    queryFn:async({signal})=>{
      const data=await configurationRead<Catalog[K]>(actor!,path,signal);
      if(kind==='project-types'){
        const rows=(data as unknown[]).map(projectTypeFrom);if(rows.some(r=>r.projectId!==projectId))throw new Error('Loại công việc không thuộc dự án.');
        return rows as Catalog[K];
      }return data;
    }});
}

/** Mutation catalog dùng admin gate; mutation project dùng MANAGE_BOARD/UPDATE_PROJECT đúng project và recheck sau chờ khóa. */
export function useConfigurationWrite(projectId?:number){
  const session=useSession(),actor=session.data?.user.userId,client=useQueryClient(),capture=useProjectMutationScope();
  const locked=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
  const domains=new Set(['configuration','config-gate','issue-refs','issue','issues','planning','board','board-catalog','transitions','project','projects','reports']);
  const affected=(q:{queryKey:readonly unknown[]})=>{
    const key=q.queryKey;if(key[0]!=='connected'||key[2]!==actor||typeof key[1]!=='string'||!domains.has(key[1]))return false;
    if(projectId===undefined)return true;
    return key[1]==='configuration'?key[3]==='project-types'&&key[4]===projectId:key[1]==='projects'||key[3]===projectId;
  };
  /** Khóa bấm đôi qua completion; đã commit nhưng probe/refetch lỗi thì yêu cầu reload, không mở lại gửi âm thầm. */
  async function run(path:string,init:RequestInit,complete:()=>void){
    if(locked.current||uncertain||!actor)return;
    locked.current=true;setBusy(true);setError('');const current=capture();
    try{
      await connectedMutation(path,actor,init,()=>{
        if(!current())return false;
        if(projectId!==undefined){const key=projectKeys.detail(actor,projectId),data=client.getQueryData<{context:AccountContext}>(key);
          return client.getQueryState(key)?.status==='success'&&!!data&&(data.context.systemAdmin||data.context.projectPermissions.some(p=>p==='MANAGE_BOARD'||p==='UPDATE_PROJECT'));}
        return client.getQueryState(configGateKey(actor))?.status==='success'&&client.getQueryData<AccountContext>(configGateKey(actor))?.systemAdmin===true;
      });
      await client.invalidateQueries({predicate:affected,refetchType:'none'});
      const cacheCurrent=()=>!hasPendingLogout()&&client.getQueryData<AccountContext|null>(['connected','session'])?.user.userId===actor;
      let refresh:Promise<unknown>|undefined;
      const accepted=await completeConnectedMutation(actor,cacheCurrent,()=>{refresh=client.invalidateQueries({predicate:affected});});
      if(!accepted){if(current()){setUncertain(true);setError('Cấu hình đã lưu nhưng chưa xác nhận được phiên. Tải lại trang trước khi thao tác tiếp.');}return;}
      await refresh;if(!current())return;
      // Chỉ xét query active vừa được refetch; lỗi ở màn đã đóng vẫn stale nhưng không khóa lượt lưu hiện tại.
      if(client.getQueryCache().findAll({predicate:affected}).some(q=>q.isActive()&&q.state.status==='error')){
        setUncertain(true);setError('Cấu hình đã lưu nhưng chưa tải lại được dữ liệu. Tải lại trang để xác nhận.');return;
      }
      if(!await completeConnectedMutation(actor,current,complete)&&current()){setUncertain(true);setError('Cấu hình đã lưu. Tải lại trang để xác nhận kết quả.');}
    }catch(failure){
      if(!current())return;
      const status=failure instanceof ConnectedError?failure.status:0;
      // Đánh stale trước; chỉ bắt đầu refetch trong callback đã xác nhận cookie actor, không trộn cache A với dữ liệu B.
      if(status===409)await client.invalidateQueries({predicate:affected,refetchType:'none'});
      if(status===403)await client.invalidateQueries({queryKey:projectId===undefined?configGateKey(actor):projectKeys.detail(actor,projectId),refetchType:'none'});
      let refresh:Promise<unknown>|undefined;
      const confirmed=await completeConnectedMutation(actor,current,()=>{
        const unknown=status===0||status>=500;setUncertain(unknown);
        setError(unknown?'Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp.':failure instanceof Error?failure.message:'Không lưu được cấu hình.');
        if(status===409)refresh=client.invalidateQueries({predicate:affected});
        if(status===403)refresh=client.invalidateQueries({queryKey:projectId===undefined?configGateKey(actor):projectKeys.detail(actor,projectId)});
      });
      if(!confirmed&&current()){setUncertain(true);setError('Không xác nhận được phiên và kết quả. Tải lại trang trước khi thao tác tiếp.');}
      await refresh;
    }finally{locked.current=false;if(current())setBusy(false);}
  }
  return {run,busy,error,uncertain,clearError:()=>setError('')};
}
