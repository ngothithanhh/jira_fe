'use client';
import {useRef,useState,type FormEvent} from 'react';
import {Btn,Field,InlineAlert,Modal,TextInput,SelectInput} from '@/components/project-ui/kit';
import {useIssueWrite,useIssueReferences,useIssueContext} from '../issues/queries';
import type {BoardDto,ColumnDto,CardDto} from './model';
import type {StatusDto} from '../issues/model';

/** Tạo board SCRUM bằng API; ba cột mặc định chưa có mapping được hiển thị đúng để cấu hình tiếp. */
export function CreateBoard({projectId,onClose,onCreated,blocked=false}:{projectId:number;onClose:()=>void;onCreated:(board:BoardDto)=>void;blocked?:boolean}) {
  const write=useIssueWrite(projectId);const [name,setName]=useState('');
  const {permitted}=useIssueContext(projectId);
  const canCreate=!blocked&&permitted('MANAGE_BOARD');
  const allowed=useRef(canCreate);allowed.current=canCreate;
  async function submit(e:FormEvent){e.preventDefault();if(!canCreate||write.busy)return;try{await write.run<BoardDto>('boards',{method:'POST',body:JSON.stringify({projectId,boardName:name})},'Đã tạo Scrum board',onCreated,()=>allowed.current);}catch{/* Giữ form và thông báo lỗi đã qua kiểm actor. */}}
  return <Modal open title="Tạo Scrum board" description="Board mới có ba cột mặc định. Ánh xạ trạng thái sau khi tạo để card xuất hiện đúng cột." onOpenChange={(v)=>{if(!v&&!write.busy)onClose();}}
    footer={<><Btn disabled={write.busy} onClick={onClose}>Hủy</Btn><Btn type="submit" form="create-connected-board" variant="primary" disabled={write.busy||!canCreate||!name.trim()}>Tạo board</Btn></>}>
    <form id="create-connected-board" onSubmit={submit} className="space-y-3">{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}<Field label="Tên board" required>{(p)=><TextInput {...p} autoFocus required maxLength={100} value={name} disabled={write.busy} onChange={(e)=>setName(e.target.value)}/>}</Field></form>
  </Modal>;
}

/** Cấu hình đang mở giữ snapshot board để DELETE/refetch không unmount form trước completion kiểm actor. */
export function BoardConfiguration({projectId,board,cards,readFailed,onClose,onDeleted}:{projectId:number;board:BoardDto;cards:CardDto[];readFailed:boolean;onClose:()=>void;onDeleted:()=>void}) {
  const write=useIssueWrite(projectId);const refs=useIssueReferences(projectId);
  const [name,setName]=useState(board.boardName);const [newColumn,setNewColumn]=useState('');
  const [confirm,setConfirm]=useState('');
  const allowed=useRef(!readFailed&&!refs.error);allowed.current=!readFailed&&!refs.error;
  const send=async(path:string,method:string,body:unknown,message:string,done?:()=>void)=>{
    if(readFailed)return;
    try{await write.run(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})},message,done,()=>allowed.current);}catch{/* Từng nút là một request đã lưu; không ghép nhiều request thành transaction giả. */}
  };
  return <Modal open title="Cấu hình board" description="Mỗi thao tác lưu riêng vào hệ thống. WIP được tính trên toàn dự án." width={760} onOpenChange={(v)=>{if(!v&&!write.busy)onClose();}} footer={<Btn disabled={write.busy} onClick={onClose}>Đóng</Btn>}>
    <div className="space-y-5">
      {readFailed&&<InlineAlert tone="warning">Chưa xác nhận được dữ liệu/quyền mới nhất. Đóng hộp thoại và tải lại trước khi ghi.</InlineAlert>}
      {write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
      {refs.error&&<InlineAlert tone="error">{refs.error.message}<Btn onClick={()=>void refs.refetch()}>Tải lại cấu hình</Btn></InlineAlert>}
      <form className="flex items-end gap-2" onSubmit={(e)=>{e.preventDefault();void send(`boards/${board.boardId}`,'PATCH',{boardName:name},'Đã đổi tên board');}}>
        <Field label="Tên board" required className="flex-1">{(p)=><TextInput {...p} required maxLength={100} value={name} disabled={write.busy} onChange={(e)=>setName(e.target.value)}/>}</Field><Btn type="submit" disabled={write.busy||!name.trim()}>Lưu tên board</Btn>
      </form>
      <div className="space-y-3">{board.columns.map((c)=><ColumnForm key={c.columnId} column={c} board={board} statuses={refs.data?.statuses||[]} cards={cards} disabled={write.busy||readFailed||!!refs.error} send={send}/>)}</div>
      <form className="flex items-end gap-2 border-t pt-4" onSubmit={(e)=>{e.preventDefault();void send('boards/columns','POST',{boardId:board.boardId,columnName:newColumn,position:Math.max(0,...board.columns.map((c)=>c.position))+1},'Đã thêm cột',()=>setNewColumn(''));}}>
        <Field label="Tên cột mới" required className="flex-1">{(p)=><TextInput {...p} required maxLength={100} value={newColumn} disabled={write.busy} onChange={(e)=>setNewColumn(e.target.value)}/>}</Field><Btn type="submit" disabled={write.busy||!newColumn.trim()}>Thêm cột</Btn>
      </form>
      <div className="space-y-2 border-t pt-4"><p className="text-sm text-[#bf2600]">Xóa board giữ nguyên issue, project và sprint; cấu hình cột và thứ tự card của board này bị xóa.</p><Field label={`Nhập ${board.boardName} để xóa board`}>{(p)=><TextInput {...p} value={confirm} disabled={write.busy} onChange={(e)=>setConfirm(e.target.value)}/>}</Field><Btn variant="danger" disabled={write.busy||confirm!==board.boardName} onClick={()=>void send(`boards/${board.boardId}`,'DELETE',undefined,'Đã xóa board',onDeleted)}>Xóa board</Btn></div>
    </div>
  </Modal>;
}

/** Cột dùng columnId DB; map/unmap từng status, không tự gỡ status đang nằm ở cột khác rồi ghi tiếp. */
function ColumnForm({column,board,statuses,cards,disabled,send}:{column:ColumnDto;board:BoardDto;statuses:StatusDto[];cards:CardDto[];disabled:boolean;send:(path:string,method:string,body:unknown,message:string,done?:()=>void)=>Promise<void>}) {
  const [name,setName]=useState(column.columnName);const [wip,setWip]=useState(String(column.wipLimit));const [status,setStatus]=useState('');const [deleting,setDeleting]=useState(false);
  const load=cards.filter((c)=>c.columnId===column.columnId).length;
  return <section aria-label={`Cấu hình cột ${column.columnName}`} className="space-y-3 rounded border border-[#dfe1e6] p-3">
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e)=>{e.preventDefault();void send(`boards/columns/${column.columnId}`,'PATCH',{columnName:name,wipLimit:Number(wip)},'Đã lưu cột');}}>
      <Field label="Tên cột" required className="min-w-[160px] flex-1">{(p)=><TextInput {...p} required maxLength={100} value={name} disabled={disabled} onChange={(e)=>setName(e.target.value)}/>}</Field>
      <Field label="Giới hạn WIP" hint={`0: không giới hạn · tải hiện tại ${load}`} className="w-40">{(p)=><TextInput {...p} type="number" required min={0} max={2147483647} step={1} value={wip} disabled={disabled} onChange={(e)=>setWip(e.target.value)}/>}</Field><Btn type="submit" disabled={disabled}>Lưu cột</Btn>
    </form>
    <div className="flex flex-wrap gap-2">{column.mappedStatusIds.map((id)=><span className="flex items-center gap-1 rounded bg-[#f4f5f7] px-2 py-1 text-xs" key={id}>{statuses.find((s)=>s.statusId===id)?.statusName||`Status ${id}`}<Btn size="icon" variant="subtle" disabled={disabled} aria-label={`Gỡ ánh xạ ${id}`} onClick={()=>{if(window.confirm('Gỡ ánh xạ sẽ đưa các issue mang trạng thái này vào nhóm Chưa phân cột. Tiếp tục?'))void send(`boards/columns/map-status?columnId=${column.columnId}&statusId=${id}`,'DELETE',undefined,'Đã gỡ ánh xạ');}}>×</Btn></span>)}</div>
    <form className="flex items-end gap-2" onSubmit={(e)=>{e.preventDefault();if(status)void send('boards/columns/map-status','POST',{columnId:column.columnId,statusId:Number(status)},'Đã ánh xạ trạng thái',()=>setStatus(''));}}>
      <Field label="Trạng thái cần ánh xạ" className="flex-1">{(p)=><SelectInput {...p} value={status} disabled={disabled} onChange={(e)=>setStatus(e.target.value)}><option value="">Chọn trạng thái</option>{statuses.map((s)=>{const owner=board.columns.find((c)=>c.mappedStatusIds.includes(s.statusId));return <option key={s.statusId} value={s.statusId} disabled={!!owner}>{s.statusName}{owner?` · đang ở ${owner.columnName}`:''}</option>;})}</SelectInput>}</Field><Btn type="submit" disabled={disabled||!status}>Ánh xạ</Btn>
    </form>
    {deleting?<div className="flex flex-wrap items-center gap-2 text-xs"><span>Xóa cột này? Cột còn issue sẽ bị từ chối.</span><Btn variant="danger" disabled={disabled} onClick={()=>void send(`boards/columns/${column.columnId}`,'DELETE',undefined,'Đã xóa cột')}>Xác nhận xóa cột</Btn><Btn disabled={disabled} onClick={()=>setDeleting(false)}>Hủy</Btn></div>:<Btn variant="subtle" disabled={disabled} onClick={()=>setDeleting(true)}>Xóa cột</Btn>}
  </section>;
}
