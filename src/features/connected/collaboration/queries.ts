'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { completeConnectedMutation, connectedMutation, connectedRequest, ConnectedError, hasPendingLogout, withSessionLock } from '../client';
import { useIssueContext } from '../issues/queries';
import { useProjectMutationScope, projectKeys } from '../projects/queries';
import type { AccountContext } from '../session';

export type Comment = {commentId:number;issueId:number;userId:number|null;userName:string|null;commentText:string;createdAt:string|null;updatedAt:string|null;version:number|null};
export type Attachment = {attachmentId:number;issueId:number;filePath:string;uploadedByUserId:number;uploadedByUserName:string|null;uploadedAt:string|null;fileName:string|null;contentType:string|null;fileSize:number|null;downloadAvailable:boolean};
export const collaborationKey=(domain:'comments'|'attachments',actor:number|undefined,project:number,issue:number)=>['connected',domain,actor,project,issue] as const;

/** Đọc đúng actor và parent dưới khóa phiên; refresh401 chạy ngoài khóa rồi probe lại trước GET. */
async function read<T>(actor:number,path:string,signal:AbortSignal) {
  const request=()=>withSessionLock(async()=>{
    signal.throwIfAborted();
    const context=await connectedRequest<AccountContext>('account/context',{signal},false);
    if(signal.aborted||hasPendingLogout()||context.user.userId!==actor)throw new ConnectedError(409,'Tài khoản đã thay đổi.');
    return connectedRequest<T>(path,{signal},false);
  });
  try{return await request();}catch(error){
    if(signal.aborted||!(error instanceof ConnectedError)||error.status!==401)throw error;
    await connectedRequest('auth/me',{signal});return request();
  }
}

/** Chỉ gắn dữ liệu comment/file sau gate và issue detail; response phải cùng issues.issue_id đang mở. */
export function useCollaboration(projectId:number,issueId:number) {
  const {actor,enabled,permitted}=useIssueContext(projectId);
  const comments=useQuery({queryKey:collaborationKey('comments',actor,projectId,issueId),enabled:enabled&&!!actor,retry:false,
    queryFn:async({signal})=>{const list=await read<Comment[]>(actor!,'issues/'+issueId+'/comments',signal);if(list.some(c=>c.issueId!==issueId))throw new Error('Bình luận không thuộc công việc.');return list;}});
  const attachments=useQuery({queryKey:collaborationKey('attachments',actor,projectId,issueId),enabled:enabled&&!!actor,retry:false,
    queryFn:async({signal})=>{const list=await read<Attachment[]>(actor!,'issues/'+issueId+'/attachments',signal);if(list.some(c=>c.issueId!==issueId))throw new Error('Tệp không thuộc công việc.');return list;}});
  return {actor,permitted,comments,attachments};
}

/** Một lượt ghi giữ khóa bấm đôi tới completion. canWrite lấy quyền mới nhất ngay trước dispatch, không chỉ dựa disabled. */
export function useCollaborationWrite(projectId:number,issueId:number) {
  const {actor}=useIssueContext(projectId),client=useQueryClient(),capture=useProjectMutationScope();
  const locked=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
  async function run(domain:'comments'|'attachments',path:string,init:RequestInit,canWrite:()=>boolean,complete:()=>void) {
    if(locked.current||uncertain||!actor)return;
    locked.current=true;setBusy(true);setError('');const current=capture();
    const key=collaborationKey(domain,actor,projectId,issueId);
    try{
      await connectedMutation(path,actor,init,()=>{
        const gate=client.getQueryState(projectKeys.detail(actor,projectId)),detail=client.getQueryState(['connected','issue',actor,projectId,issueId]);
        return current()&&canWrite()&&gate?.status==='success'&&detail?.status==='success';
      });
      // Đã commit thì stale kể cả panel unmount; không dựng response vào cache của phiên mới.
      await client.invalidateQueries({queryKey:key,refetchType:'none'});
      await client.invalidateQueries({queryKey:['connected','notifications',actor],refetchType:'none'});
      const cacheCurrent=()=>!hasPendingLogout()&&client.getQueryData<AccountContext|null>(['connected','session'])?.user.userId===actor;
      let refresh:Promise<unknown>|undefined;
      const accepted=await completeConnectedMutation(actor,cacheCurrent,()=>{
        refresh=client.invalidateQueries({queryKey:key});
        void client.invalidateQueries({queryKey:['connected','notifications',actor]});
      });
      if(!accepted){if(current()){setUncertain(true);setError('Thao tác đã lưu nhưng chưa xác nhận được phiên. Tải lại trang trước khi thao tác tiếp.');}return;}
      await refresh;
      if(!current())return;
      // Không xóa draft khi GET sau ghi thất bại; khóa gửi tiếp để tránh tạo lại comment/file đã commit.
      if(client.getQueryState(key)?.status==='error'){
        setUncertain(true);setError('Thao tác đã lưu nhưng chưa tải lại được danh sách. Tải lại trang để xác nhận kết quả.');return;
      }
      if(!await completeConnectedMutation(actor,current,complete)&&current()){setUncertain(true);setError('Thao tác đã lưu. Tải lại trang để xác nhận kết quả.');}
    }catch(failure){
      if(!current())return;
      const status=failure instanceof ConnectedError?failure.status:0;
      // Timeout/5xx có thể xảy ra sau commit. Không tự replay hoặc mở lại nút gửi khi chưa biết kết quả.
      const unknown=status===0||status>=500;
      const confirmed=await completeConnectedMutation(actor,current,()=>{
        setError(unknown?'Chưa xác nhận được kết quả. Tải lại trang trước khi thao tác tiếp.':failure instanceof Error?failure.message:'Không thực hiện được thao tác.');
        if(unknown)setUncertain(true);
      });
      if(!confirmed&&current()){setUncertain(true);setError('Chưa xác nhận được phiên và kết quả. Tải lại trang trước khi thao tác tiếp.');}
      if(status===409)await client.invalidateQueries({queryKey:key});
    }finally{locked.current=false;if(current())setBusy(false);}
  }
  return {run,busy,error,uncertain,clearError:()=>setError('')};
}
