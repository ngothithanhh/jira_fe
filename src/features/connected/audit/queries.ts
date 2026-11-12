'use client';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession,type AccountContext} from '../session';
import {configurationRead} from '../configuration/queries';
import {completeConnectedMutation,ConnectedError,hasPendingLogout} from '../client';
import {useProjectMutationScope} from '../projects/queries';
import {auditPageFrom,auditQuery,type AuditFilter} from './contract';

/** Đọc quyền và log dưới khóa phiên, rồi probe cookie sau GET trước khi cache/UI nhận kết quả. */
export function useAudit(filter:AuditFilter,page:number,size:number,project?:number){
  const session=useSession(),actor=session.data?.user.userId,client=useQueryClient(),capture=useProjectMutationScope();
  async function read<T>(path:string,signal:AbortSignal):Promise<T>{
    if(!navigator.locks)throw new ConnectedError(412,'Trình duyệt chưa hỗ trợ khóa phiên an toàn. Vui lòng dùng trình duyệt hỗ trợ Web Locks.');
    const current=capture();
    const value=await configurationRead<T>(actor!,path,signal);
    const accepted=await completeConnectedMutation(actor!,()=>current()&&!signal.aborted&&!hasPendingLogout()&&client.getQueryData<AccountContext|null>(['connected','session'])?.user.userId===actor,()=>{});
    if(!accepted)throw new ConnectedError(409,'Phiên đăng nhập đã thay đổi. Tải lại trang để xác nhận.');
    return value;
  }
  const gate=useQuery({queryKey:['connected','audit-gate',actor,project],enabled:!!actor&&!session.switching,retry:false,
    queryFn:({signal})=>read<AccountContext>('account/context'+(project===undefined?'':`?projectId=${project}`),signal)});
  const permitted=!!gate.data&&gate.data.user.userId===actor&&gate.data.projectId===(project??null)&&(project===undefined?gate.data.systemAdmin:gate.data.systemAdmin||gate.data.projectPermissions.includes('UPDATE_PROJECT'));
  const logs=useQuery({queryKey:['connected','audit',actor,project,filter,page,size],enabled:!!actor&&!session.switching&&permitted&&!gate.isError,retry:false,
    queryFn:async({signal})=>auditPageFrom(await read(auditQuery(filter,page,size,project),signal),project)});
  return {gate,logs,permitted,actor,switching:session.switching};
}
