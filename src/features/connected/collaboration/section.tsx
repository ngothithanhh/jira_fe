'use client';
import { useEffect, useRef, useState } from 'react';
import { Paperclip, Trash2, Download, Eye } from 'lucide-react';
import { Avatar, Btn, Field, InlineAlert, Modal, TabBar, TextArea, formatBytes, formatDate } from '@/components/project-ui/kit';
import { MAX_ATTACHMENT_BYTES } from './contract';
import { useCollaboration, useCollaborationWrite, type Attachment, type Comment } from './queries';
import { connectedFile, completeConnectedMutation } from '../client';
import { useProjectMutationScope } from '../projects/queries';

type SelectedComment={id:number;version:number;author:number|null;text:string};
const validVersion=(v:number|null):v is number=>v!==null&&Number.isSafeInteger(v)&&v>=0;

/** Cộng tác cùng IssuePanel của issue/backlog/board. ID và quyền từ API thật; draft giữ qua refetch lỗi, đổi issue/actor thì remount. */
export function IssueCollaboration({projectId,issueId,readFailed,readOnly=false,onBusy}:{projectId:number;issueId:number;readFailed:boolean;readOnly?:boolean;onBusy:(busy:boolean)=>void}) {
  const {actor,permitted,comments,attachments}=useCollaboration(projectId,issueId);
  const write=useCollaborationWrite(projectId,issueId),input=useRef<HTMLInputElement>(null);
  const [tab,setTab]=useState<'comments'|'attachments'>('comments'),[text,setText]=useState('');
  const [editing,setEditing]=useState<SelectedComment|null>(null),[removing,setRemoving]=useState<SelectedComment|null>(null);
  const [selected,setSelected]=useState<File|null>(null),[removingFile,setRemovingFile]=useState<Attachment|null>(null),[preview,setPreview]=useState<{file:Attachment;url:string}|null>(null),[fileError,setFileError]=useState('');
  const [fileBusy,setFileBusy]=useState(false),urls=useRef(new Set<string>()),capture=useProjectMutationScope();
  const state=useRef({readFailed,readOnly,actor,canView:permitted('VIEW_PROJECT'),canEdit:permitted('EDIT_ISSUE'),commentsError:comments.isError,filesError:attachments.isError});
  state.current={readFailed,readOnly,actor,canView:permitted('VIEW_PROJECT'),canEdit:permitted('EDIT_ISSUE'),commentsError:comments.isError,filesError:attachments.isError};
  useEffect(()=>{onBusy(write.busy||fileBusy);},[write.busy,fileBusy,onBusy]);
  useEffect(()=>()=>{for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();},[]);
  // Board lịch sử khóa ghi, vẫn cho VIEW_PROJECT tải/preview file; lỗi quyền khác với readOnly.
  const readDisabled=write.busy||write.uncertain||readFailed||fileBusy;
  const disabled=readDisabled||readOnly;
  /** Hàm này còn được gọi sau khi chờ khóa/auth: đọc ref mới nhất để gate lỗi không cho draft cũ tiếp tục ghi. */
  const can=(domain:'comments'|'attachments',owner?:number|null)=>{
    const s=state.current;
    return !s.readFailed&&!s.readOnly&&s.canView&&!(domain==='comments'?s.commentsError:s.filesError)
      &&(domain==='comments'?(owner===undefined||owner===s.actor||s.canEdit):owner===undefined?s.canEdit:owner===s.actor||s.canEdit);
  };
  const snapshot=(c:Comment):SelectedComment=>({id:c.commentId,version:c.version!,author:c.userId,text:c.commentText});
  /** expectedVersion được chụp lúc bấm Sửa/Xóa; refetch409 không tự thay version hoặc gửi lại bằng bản mới. */
  async function saveComment() {
    const draft=editing?.text??text;if(!draft.trim()||draft.length>10000)return;
    const edit=editing;
    await write.run('comments','issues/'+issueId+'/comments'+(edit?'/'+edit.id:''),{method:edit?'PUT':'POST',
      body:JSON.stringify({commentText:draft,...(edit?{expectedVersion:edit.version}:{})})},()=>can('comments',edit?.author),()=>{if(edit)setEditing(null);else setText('');});
  }
  /** Lưu đúng một File vào FormData; giữ File khi upload chưa xác nhận, không dựng attachment giả bằng object URL. */
  async function upload() {
    if(!selected||selected.size===0||selected.size>MAX_ATTACHMENT_BYTES)return;
    const body=new FormData();body.append('file',selected);
    await write.run('attachments','issues/'+issueId+'/attachments',{method:'POST',body},()=>can('attachments'),()=>{setSelected(null);if(input.current)input.current.value='';});
  }
  /** Nội dung đọc qua API local có JWT/parent guard; Object URL chỉ tạo từ byte BE trả và thu hồi khi đóng/đổi issue hoặc phiên. */
  async function openFile(file:Attachment,showPreview:boolean) {
    if(readDisabled||!actor||!file.downloadAvailable)return;
    const current=capture(),canRead=()=>current()&&!state.current.readFailed&&state.current.canView&&!state.current.filesError;
    setFileBusy(true);setFileError('');
    try{
      const blob=await connectedFile('issues/'+issueId+'/attachments/'+file.attachmentId+'/content',actor,canRead);
      const accepted=await completeConnectedMutation(actor,canRead,()=>{
        if(showPreview&&!/^image\/(png|jpeg|gif|webp|bmp)$/.test(blob.type)){setFileError('Định dạng này chỉ hỗ trợ tải xuống.');return;}
        const url=URL.createObjectURL(blob);urls.current.add(url);
        if(showPreview)setPreview({file,url});
        else{const link=document.createElement('a');link.href=url;link.download=file.fileName||'attachment-'+file.attachmentId;link.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1000);}
      });
      // GET có thể thành công nhưng probe phiên lỗi: báo lý do, không tạo Blob URL hoặc im lặng mở lại nút.
      if(!accepted&&current())setFileError('Chưa xác nhận được phiên để mở tệp. Tải lại dữ liệu rồi thử lại.');
    }catch(error){if(current()){
      const accepted=await completeConnectedMutation(actor,current,()=>setFileError(error instanceof Error?error.message:'Không tải được nội dung tệp.'));
      if(!accepted&&current())setFileError('Chưa xác nhận được phiên để mở tệp. Tải lại dữ liệu rồi thử lại.');
    }}
    finally{if(current())setFileBusy(false);}
  }
  /** Chỉ kiểm sớm để người dùng sửa nhanh; BFF/BE vẫn đếm byte thực và kiểm part/tên trước ghi. */
  function choose(file:File|undefined) {
    setFileError('');setSelected(null);
    if(!file)return;
    if(!file.size||file.size>MAX_ATTACHMENT_BYTES){setFileError('Chọn tệp không rỗng, tối đa 10 MiB.');return;}
    setSelected(file);
  }
  const listError=tab==='comments'?comments.error:attachments.error;
  return <section aria-label="Bình luận và tệp đính kèm" className="mt-6 space-y-4 border-t pt-5">
    <TabBar label="Cộng tác công việc" value={tab} onChange={setTab} tabs={[{value:'comments',label:'Bình luận'},{value:'attachments',label:'Tệp đính kèm'}]}/>
    {(readFailed||readOnly)&&<InlineAlert>{readOnly?'Công việc đang được mở ở chế độ chỉ đọc; bạn vẫn có thể xem và tải tệp.':'Chỉ xem cộng tác cho đến khi công việc và quyền được tải lại thành công.'}</InlineAlert>}
    {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    {write.uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại trang để xác nhận</Btn>}
    {listError&&<InlineAlert tone="error">{listError.message}<Btn disabled={write.busy} onClick={()=>void(tab==='comments'?comments.refetch():attachments.refetch())}>Tải lại danh sách</Btn></InlineAlert>}
    <div hidden={tab!=='comments'} className="space-y-5">
      <form className="space-y-2" onSubmit={e=>{e.preventDefault();void saveComment();}}>
        <Field label={editing?'Sửa bình luận':'Thêm bình luận'}>{p=><TextArea {...p} rows={3} maxLength={10000} value={editing?.text??text} disabled={disabled||!can('comments',editing?.author)}
          onChange={e=>editing?setEditing({...editing,text:e.target.value}):setText(e.target.value)} placeholder="Nhập bình luận…"/>}</Field>
        <div className="flex gap-2"><Btn type="submit" variant="primary" disabled={disabled||!can('comments',editing?.author)||!(editing?.text??text).trim()}>{editing?'Lưu bình luận':'Gửi bình luận'}</Btn>
          {editing&&<Btn disabled={write.busy} onClick={()=>{setEditing(null);write.clearError();}}>Hủy sửa</Btn>}</div>
      </form>
      {comments.isPending?<p role="status">Đang tải bình luận…</p>:!comments.isError&&comments.data?.length===0?<p className="text-sm text-[#6b778c]">Chưa có bình luận.</p>:null}
      <ul aria-label="Danh sách bình luận" className="space-y-4">{comments.data?.map(c=><li key={c.commentId} className="flex gap-3" data-comment-id={c.commentId}>
        <Avatar name={c.userName} size={32}/><div className="min-w-0 flex-1 space-y-1"><p className="text-sm font-semibold">{c.userName||'Người dùng không còn tồn tại'}</p>
          <p className="text-xs text-[#6b778c]">{c.createdAt&&formatDate(c.createdAt,true)}{c.updatedAt&&c.updatedAt!==c.createdAt?' · đã chỉnh sửa':''}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{c.commentText}</p>
          {validVersion(c.version)&&(c.userId===actor||permitted('EDIT_ISSUE'))&&<div className="flex gap-2">
            <Btn size="sm" variant="subtle" disabled={disabled||!can('comments',c.userId)} onClick={()=>{setEditing(snapshot(c));write.clearError();}}>Sửa bình luận</Btn>
            <Btn size="sm" variant="subtle" disabled={disabled||!can('comments',c.userId)} onClick={()=>setRemoving(snapshot(c))}>Xóa bình luận</Btn>
          </div>}</div></li>)}</ul>
    </div>
    <div hidden={tab!=='attachments'} className="space-y-4">
      <form onSubmit={e=>{e.preventDefault();void upload();}} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor={'attachment-'+issueId}>Chọn tệp đính kèm</label>
        <input ref={input} id={'attachment-'+issueId} type="file" className="block w-full min-w-0 text-sm" disabled={disabled||!can('attachments')} onChange={e=>choose(e.target.files?.[0])}/>
        <p className="text-xs text-[#6b778c]">Mỗi lần một tệp, tối đa 10 MiB.</p>
        {selected&&<p className="break-all text-sm">{selected.name} · {formatBytes(selected.size)}</p>}
        {fileError&&<InlineAlert tone="error">{fileError}</InlineAlert>}
        <Btn type="submit" variant="primary" disabled={disabled||!can('attachments')||!selected}><Paperclip/>Tải tệp lên</Btn>
      </form>
      {attachments.isPending?<p role="status">Đang tải tệp…</p>:!attachments.isError&&attachments.data?.length===0?<p className="text-sm text-[#6b778c]">Chưa có tệp đính kèm.</p>:null}
      <ul aria-label="Danh sách tệp đính kèm" className="space-y-2">{attachments.data?.map(file=>{
        const name=file.fileName||'Tệp đính kèm #'+file.attachmentId;
        const raster=file.downloadAvailable&&!!file.contentType&&/^image\/(png|jpeg|gif|webp|bmp)$/i.test(file.contentType);
        return <li key={file.attachmentId} data-attachment-id={file.attachmentId} className="flex flex-wrap items-center gap-2 rounded border p-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto"><p className="break-all text-sm font-medium">{name}</p><p className="break-words text-xs text-[#6b778c]">
            {file.fileSize!=null?formatBytes(file.fileSize):'Chưa có dung lượng'} · {file.uploadedByUserName||'Người dùng không còn tồn tại'} · {file.uploadedAt&&formatDate(file.uploadedAt,true)}</p></div>
          {raster&&<Btn variant="subtle" size="sm" disabled={readDisabled} onClick={()=>void openFile(file,true)}><Eye/>Xem ảnh</Btn>}
          {file.downloadAvailable?<Btn variant="subtle" size="sm" disabled={readDisabled} onClick={()=>void openFile(file,false)}><Download/>Tải xuống</Btn>:<span className="text-xs text-[#6b778c]">Chưa có nội dung local</span>}
          {(file.uploadedByUserId===actor||permitted('EDIT_ISSUE'))&&<Btn variant="subtle" size="sm" disabled={disabled||!can('attachments',file.uploadedByUserId)} onClick={()=>setRemovingFile(file)}><Trash2/>Xóa tệp</Btn>}
        </li>;
      })}</ul>
    </div>
    {removing&&<Modal open title="Xóa bình luận?" description="Bình luận sẽ bị xóa khỏi công việc." onOpenChange={v=>{if(!v&&!write.busy)setRemoving(null);}}
      footer={<><Btn disabled={write.busy} onClick={()=>setRemoving(null)}>Hủy</Btn><Btn variant="danger" disabled={disabled||!can('comments',removing.author)} onClick={()=>void write.run('comments','issues/'+issueId+'/comments/'+removing.id+'?expectedVersion='+removing.version,{method:'DELETE'},()=>can('comments',removing.author),()=>setRemoving(null))}>Xác nhận xóa bình luận</Btn></>}>
      {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}<p className="whitespace-pre-wrap break-words text-sm">{removing.text}</p>
    </Modal>}
    {removingFile&&<Modal open title="Xóa tệp đính kèm?" description="Metadata và nội dung tệp sẽ được xóa cùng nhau trong PostgreSQL local." onOpenChange={v=>{if(!v&&!write.busy)setRemovingFile(null);}}
      footer={<><Btn disabled={write.busy} onClick={()=>setRemovingFile(null)}>Hủy</Btn><Btn variant="danger" disabled={disabled||!can('attachments',removingFile.uploadedByUserId)} onClick={()=>void write.run('attachments','issues/'+issueId+'/attachments/'+removingFile.attachmentId,{method:'DELETE'},()=>can('attachments',removingFile.uploadedByUserId),()=>setRemovingFile(null))}>Xác nhận xóa tệp</Btn></>}>
      {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}<p className="break-all text-sm">{removingFile.fileName||'Tệp #'+removingFile.attachmentId}</p>
    </Modal>}
    {preview&&<Modal open title={preview.file.fileName||'Xem tệp'} onOpenChange={v=>{if(!v){URL.revokeObjectURL(preview.url);urls.current.delete(preview.url);setPreview(null);}}}><img src={preview.url} alt={preview.file.fileName||'Ảnh đính kèm'} className="mx-auto max-h-[65vh] max-w-full object-contain"/></Modal>}
  </section>;
}
