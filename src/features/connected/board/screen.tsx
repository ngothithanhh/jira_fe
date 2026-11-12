'use client';
import {useRef,useState} from 'react';
import {useParams,usePathname,useRouter,useSearchParams} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {DragDropContext,Draggable,Droppable,type DropResult} from '@hello-pangea/dnd';
import {AlertTriangle,MoreHorizontal,Plus,RefreshCw,Settings2} from 'lucide-react';
import {Avatar,Btn,EmptyState,Field,InlineAlert,LinkBtn,Modal,PageHeading,PointsBadge,SelectInput,TextInput} from '@/components/project-ui/kit';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {completeConnectedMutation,connectedRequest} from '../client';
import {projectIdFromRoute} from '../projects/model';
import {useProjectMutationScope} from '../projects/queries';
import {useIssueContext,useIssueReferences,useIssueWrite} from '../issues/queries';
import {IssuePanel} from '../issues/panel';
import type {StatusDto} from '../issues/model';
import {boardDataKey,useConnectedBoardData,useConnectedBoards} from './queries';
import {allowedBoardTargets,buildBoardView,emptyFilter,toGlobalBoardPosition,type BoardDto,type CardDto,type BoardData} from './model';
import {BoardConfiguration,CreateBoard} from './configuration';

/** Remount toàn bộ board khi đổi project để draft/ID cột của project trước không đi theo URL mới. */
export function ConnectedBoardScreen(){
  const params=useParams<{projectId:string}>();const id=projectIdFromRoute(params.projectId);
  return id===null?<InlineAlert tone="error">ID dự án không hợp lệ.</InlineAlert>:<ProjectBoard key={id} projectId={id}/>;
}

/** Selector chỉ nhận ID thật trong catalog; query ID lạ báo lỗi, không tự mở một board/sprint khác. */
function ProjectBoard({projectId}:{projectId:number}){
  const catalog=useConnectedBoards(projectId);const context=useIssueContext(projectId);const params=useSearchParams();const router=useRouter();const pathname=usePathname();
  const [creating,setCreating]=useState(false);const [config,setConfig]=useState<BoardDto|null>(null);
  const change=(key:string,value:string|null)=>{const next=new URLSearchParams(params.toString());if(value===null)next.delete(key);else next.set(key,value);router.replace(pathname+(next.size?'?'+next.toString():''),{scroll:false});};
  const boards=catalog.data?.boards||[];const sprints=catalog.data?.sprints.filter((s)=>s.state!=='FUTURE')||[];
  const boardId=params.has('boardId')?projectIdFromRoute(params.get('boardId')||''):boards[0]?.boardId??null;
  const sprintId=params.has('sprintId')?projectIdFromRoute(params.get('sprintId')||''):sprints.find((s)=>s.state==='ACTIVE')?.sprintId??null;
  const board=boards.find((b)=>b.boardId===boardId);
  const invalidBoard=params.has('boardId')&&!board;const invalidSprint=params.has('sprintId')&&!sprints.some((s)=>s.sprintId===sprintId);
  if(!catalog.data)return catalog.error?<InlineAlert tone="error">{catalog.error.message}<Btn onClick={()=>void catalog.refetch()}>Thử lại</Btn></InlineAlert>:<p role="status">Đang tải board…</p>;
  return <>
    <PageHeading title={board?.boardName||'Scrum board'} description={context.project.data?.project.projectName} actions={<><Btn disabled={catalog.isFetching} onClick={()=>void catalog.refetch()}><RefreshCw/>Tải lại danh sách</Btn>{context.permitted('MANAGE_BOARD')&&<><Btn onClick={()=>setCreating(true)}><Plus/>Tạo board</Btn>{board&&<Btn onClick={()=>setConfig(board)}><Settings2/>Cấu hình board</Btn>}</>}</>}/>
    {catalog.error&&<InlineAlert tone="error">{catalog.error.message} Dữ liệu đang hiển thị là lần tải trước.</InlineAlert>}
    {!!boards.length&&<div className="mb-4 flex flex-wrap gap-2"><SelectInput className="w-auto max-w-full" aria-label="Chọn board" value={boardId??''} onChange={(e)=>change('boardId',e.target.value)}>{invalidBoard&&<option value={boardId??''}>Board không hợp lệ</option>}{boards.map((b)=><option key={b.boardId} value={b.boardId}>{b.boardName}</option>)}</SelectInput><SelectInput className="w-auto max-w-full" aria-label="Chọn sprint" value={sprintId??''} onChange={(e)=>change('sprintId',e.target.value)}><option value="" disabled>Chọn sprint đã bắt đầu</option>{sprints.map((s)=><option key={s.sprintId} value={s.sprintId}>{s.sprintName}{s.state==='ACTIVE'?' (đang diễn ra)':' (đã đóng)'}</option>)}</SelectInput></div>}
    {invalidBoard||invalidSprint?<InlineAlert tone="error">Board/sprint không tồn tại trong dự án hoặc chưa được bắt đầu. <LinkBtn href={pathname}>Mở board mặc định</LinkBtn></InlineAlert>
      :board?<SelectedBoard key={`${board.boardId}:${sprintId}`} projectId={projectId} boardId={board.boardId} sprintId={sprintId} catalogFailed={!!catalog.error}/>
      :<EmptyState title="Dự án chưa có Scrum board" description="Tạo board rồi ánh xạ trạng thái vào các cột để theo dõi sprint."/>}
    {creating&&<CreateBoard projectId={projectId} blocked={!!catalog.error} onClose={()=>setCreating(false)} onCreated={(b)=>{setCreating(false);change('boardId',String(b.boardId));setConfig(b);}}/>}
    {config&&<ConfigurationLoader key={config.boardId} projectId={projectId} snapshot={config} selected={config.boardId===boardId} onClose={()=>setConfig(null)} onDeleted={()=>{setConfig(null);change('boardId',null);}}/>}
  </>;
}

/** Modal nằm ngoài selected board để đổi catalog sau xóa không cắt mất callback completion. */
function ConfigurationLoader({projectId,snapshot,selected,onClose,onDeleted}:{projectId:number;snapshot:BoardDto;selected:boolean;onClose:()=>void;onDeleted:()=>void}){
  const data=useConnectedBoardData(projectId,snapshot.boardId,null);
  const {permitted}=useIssueContext(projectId);
  return <BoardConfiguration projectId={projectId} board={data.data?.board||snapshot} cards={data.data?.cards||[]} readFailed={!!data.error||!data.data||data.isFetching||!permitted('MANAGE_BOARD')} selected={selected} onClose={onClose} onDeleted={onDeleted}/>;
}

type Pending={card:CardDto;columnId?:number;index?:number;allowed:StatusDto[]};

/** Board giữ toàn project để tính rank/WIP; chỉ card thuộc sprint đang chọn mới xuất hiện trong các cột. */
function SelectedBoard({projectId,boardId,sprintId,catalogFailed}:{projectId:number;boardId:number;sprintId:number|null;catalogFailed:boolean}){
  const query=useConnectedBoardData(projectId,boardId,sprintId);const refs=useIssueReferences(projectId);const context=useIssueContext(projectId);
  const write=useIssueWrite(projectId);const client=useQueryClient();const capture=useProjectMutationScope();
  const [filter,setFilter]=useState(emptyFilter);const [pending,setPending]=useState<Pending|null>(null);const [selected,setSelected]=useState<number|null>(null);const [localError,setLocalError]=useState('');const [checking,setChecking]=useState(false);const checkingRef=useRef(false);
  const data=query.data;const failed=!!query.error||!!refs.error||catalogFailed;
  const editable=context.permitted('EDIT_ISSUE')&&data?.sprint?.state==='ACTIVE'&&!failed;
  const busy=write.busy||checking;
  const latest=useRef({data,editable,writing:write.busy});
  latest.current={data,editable,writing:write.busy};

  /** Gửi đúng snapshot version đã quyết định; kiểm lại mapping của cột, không tự thay version rồi replay. */
  async function commit(card:CardDto,columnId:number,statusId:number,index:number){
    // Workflow có thể chờ lâu; kiểm render mới nhất thay vì editable/data của closure lúc bắt đầu kéo.
    const state=latest.current;
    if(!state.data||!sprintId||!state.editable||state.writing)return;
    const column=state.data.board.columns.find((c)=>c.columnId===columnId);
    if(!column?.mappedStatusIds.includes(statusId)){setLocalError('Mapping đã thay đổi. Tải lại board trước khi chuyển.');return;}
    try{
      const position=toGlobalBoardPosition(state.data,card.issue.issueId,columnId,index);
      await write.run(`boards/${boardId}/issues/${card.issue.issueId}/move`,{method:'PUT',body:JSON.stringify({columnId,statusId,position,expectedVersion:card.version,sprintId})},`Đã chuyển ${card.issue.issueKey}`,()=>setPending(null),()=>{
        // Lượt đọc mới có thể đang chờ khóa phiên của chính mutation; không dùng snapshot cũ để gửi card.
        const cached = client.getQueryState<BoardData>(boardDataKey(context.actor,projectId,boardId,sprintId));
        return latest.current.editable && cached?.status==='success' && cached.fetchStatus==='idle' && cached.data===state.data;
      });
    }catch(error){
      // Lỗi tính vị trí xảy ra trước request cũng cần được hiện; không nuốt lỗi khi scope card đích vừa thay đổi.
      if(context.actor){const current=capture();await completeConnectedMutation(context.actor,current,()=>setLocalError(error instanceof Error?error.message:'Không thể chuyển card.'));}
    }
  }

  /** Chờ workflow rồi kiểm lại actor dưới khóa trước mở dialog/gửi PUT; kết quả của board/sprint cũ bị bỏ. */
  async function requestMove(card:CardDto,columnId?:number,index?:number){
    if(!editable||busy||checkingRef.current||!context.actor||!data)return;
    const current=capture();checkingRef.current=true;setChecking(true);setLocalError('');
    try{
      const allowed=await client.fetchQuery({queryKey:['connected','transitions',context.actor,projectId,card.issue.statusId],staleTime:0,queryFn:()=>connectedRequest<StatusDto[]>(`workflows/allowed-transitions?currentStatusId=${card.issue.statusId}`)});
      let single:number|undefined;
      const col=data.board.columns.find((c)=>c.columnId===columnId);
      const targets=col?(card.columnId===col.columnId?[card.issue.statusId]:allowedBoardTargets(card,col,allowed)):[];
      if(col&&targets.length===0)throw new Error('Workflow không cho phép chuyển sang cột này.');
      await completeConnectedMutation(context.actor,current,()=>{if(!latest.current.editable)return;if(col&&targets.length===1)single=targets[0];else setPending({card,columnId,index,allowed});});
      if(single!==undefined&&current())await commit(card,columnId!,single,index!);
    }catch(e){if(current())await completeConnectedMutation(context.actor,current,()=>setLocalError(e instanceof Error?e.message:'Không đọc được workflow.'));}
    finally{checkingRef.current=false;if(current())setChecking(false);}
  }

  if(!data)return query.error?<InlineAlert tone="error">{query.error.message}<Btn onClick={()=>void query.refetch()}>Thử lại</Btn></InlineAlert>:<p role="status">Đang tải card…</p>;
  const view=buildBoardView(data,filter);const dragDisabled=!editable||busy||view.filtered;
  function dragEnd(result:DropResult){
    if(!result.destination||dragDisabled||!data)return;
    if(result.source.droppableId===result.destination.droppableId&&result.source.index===result.destination.index)return;
    const card=data.cards.find((c)=>String(c.issue.issueId)===result.draggableId);if(card)void requestMove(card,Number(result.destination.droppableId),result.destination.index);
  }
  return <>
    <div className="mb-4 flex flex-wrap gap-2"><TextInput className="w-full sm:w-60" aria-label="Tìm trên board" placeholder="Tìm mã hoặc tên công việc" value={filter.keyword} maxLength={200} onChange={(e)=>setFilter({...filter,keyword:e.target.value})}/>
      <SelectInput className="w-auto max-w-full" aria-label="Lọc người phụ trách trên board" value={filter.assignee} onChange={(e)=>setFilter({...filter,assignee:e.target.value})}><option value="">Mọi người phụ trách</option><option value="none">Chưa phân công</option>{refs.data?.members.map((m)=><option key={m.userId} value={m.userId}>{m.fullName||m.userName}</option>)}</SelectInput>
      <SelectInput className="w-auto" aria-label="Lọc loại trên board" value={filter.typeId} onChange={(e)=>setFilter({...filter,typeId:e.target.value})}><option value="">Mọi loại</option>{refs.data?.types.map((t)=><option key={t.issueTypeId} value={t.issueTypeId}>{t.issueTypeName}</option>)}</SelectInput>
      {view.filtered&&<Btn variant="link" onClick={()=>setFilter(emptyFilter)}>Xóa bộ lọc</Btn>}<Btn className="ml-auto" disabled={busy||query.isFetching} onClick={()=>{void query.refetch();void refs.refetch();}}><RefreshCw/>Tải lại board</Btn>
    </div>
    {(query.error||refs.error)&&<InlineAlert tone="error">{query.error?.message||refs.error?.message} Bản đã tải được giữ lại; tải lại thành công trước khi ghi tiếp.</InlineAlert>}
    {(write.error||localError)&&<div className="mb-3"><InlineAlert tone="error">{write.error||localError}</InlineAlert></div>}
    {!data.sprint?<EmptyState title="Chưa có sprint đang diễn ra" description="Bắt đầu sprint từ Backlog để theo dõi trên board." action={<LinkBtn variant="primary" href={`/app/projects/${projectId}/backlog`}>Mở Backlog</LinkBtn>}/>:<>
      {data.sprint.state==='CLOSED'&&<div className="mb-3"><InlineAlert>Đang xem sprint đã đóng. Board chỉ đọc; trạng thái là trạng thái hiện tại của công việc, không phải snapshot lúc đóng.</InlineAlert></div>}
      {view.filtered&&<div className="mb-3"><InlineAlert>Đang lọc: kéo thả bị tắt. Dùng menu Chuyển tới hoặc xóa bộ lọc.</InlineAlert></div>}
      {!data.board.columns.length&&<EmptyState title="Board chưa có cột" description="Thêm cột trong Cấu hình board."/>}
      <DragDropContext onDragEnd={dragEnd}><div className="flex max-w-full gap-3 overflow-x-auto pb-4" aria-label="Các cột Scrum board">
        {view.columns.map((col)=><section key={col.column.columnId} aria-label={`Cột ${col.column.columnName}`} className="flex w-[272px] shrink-0 flex-col rounded-[3px] bg-[#f4f5f7]">
          <header className="flex items-center gap-2 px-3 pt-3 text-xs"><h2 className="truncate font-semibold uppercase text-[#5e6c84]">{col.column.columnName}</h2><span>{view.filtered?`${col.shown.length}/${col.cards.length}`:col.cards.length}</span>{col.column.wipLimit>0&&<span title="WIP tính trên toàn project, kể cả issue ngoài sprint đang xem" className={`ml-auto rounded px-1 ${col.full?'bg-red-100 text-red-700':'bg-[#dfe1e6]'}`}>{col.full&&<AlertTriangle className="mr-1 inline size-3"/>}WIP {col.load}/{col.column.wipLimit}</span>}</header>
          <p className="px-3 pb-2 pt-1 text-[11px] text-[#6b778c]">{col.column.mappedStatusIds.map((id)=>refs.data?.statuses.find((s)=>s.statusId===id)?.statusName||`Status ${id}`).join(' · ')||'Chưa ánh xạ trạng thái'}</p>
          <Droppable droppableId={String(col.column.columnId)} isDropDisabled={dragDisabled}>{(drop)=><div ref={drop.innerRef} {...drop.droppableProps} className="flex min-h-[150px] flex-1 flex-col gap-2 px-2 pb-2">
            {col.shown.map((card,index)=><Draggable key={card.issue.issueId} draggableId={String(card.issue.issueId)} index={index} isDragDisabled={dragDisabled||card.version===null}>{(drag,snapshot)=><article ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} aria-label={`Card ${card.issue.issueKey}`} className={`rounded-[3px] bg-white p-3 text-[13px] shadow-sm focus-visible:outline-blue-500 ${snapshot.isDragging?'ring-2 ring-blue-300':''}`}>
              <div className="flex items-start gap-1"><button className="min-w-0 flex-1 break-words text-left leading-5 hover:text-[#0052cc]" onClick={()=>setSelected(card.issue.issueId)}>{card.issue.summary}</button>
                {editable&&<DropdownMenu><DropdownMenuTrigger asChild><Btn size="icon" variant="subtle" disabled={busy} className="size-6" aria-label={`Thao tác ${card.issue.issueKey}`}><MoreHorizontal/></Btn></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={()=>setSelected(card.issue.issueId)}>Xem chi tiết</DropdownMenuItem><DropdownMenuItem onSelect={()=>void requestMove(card)}>Chuyển tới…</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
              </div><div className="mt-3 flex items-center gap-2"><button className="text-xs text-[#6b778c] hover:underline" onClick={()=>setSelected(card.issue.issueId)}>{card.issue.issueKey}</button><span title={card.issue.priority||''} className="ml-auto text-xs text-[#6b778c]">{card.issue.priority}</span><PointsBadge points={card.issue.storyPoints}/><Avatar name={card.issue.assigneeName}/></div>
            </article>}</Draggable>)}{drop.placeholder}{!col.shown.length&&<p className="py-6 text-center text-xs text-[#6b778c]">{view.filtered?'Không có card khớp bộ lọc':'Chưa có card trong sprint'}</p>}
          </div>}</Droppable>
        </section>)}
      </div></DragDropContext>
      {!!view.unmapped.length&&<section aria-label="Chưa phân cột" className="space-y-2 rounded border border-dashed border-amber-400 p-3"><h2 className="text-sm font-semibold">Chưa phân cột ({view.unmapped.length})</h2><p className="text-xs text-[#6b778c]">Ánh xạ trạng thái trong Cấu hình board hoặc chuyển issue sang trạng thái đã có cột.</p>{view.unmapped.map((c)=><div key={c.issue.issueId} className="flex flex-wrap items-center gap-3 text-sm"><button className="text-blue-700" onClick={()=>setSelected(c.issue.issueId)}>{c.issue.issueKey} · {c.issue.summary}</button>{editable&&<Btn disabled={busy} onClick={()=>void requestMove(c)}>Chuyển tới…</Btn>}</div>)}</section>}
    </>}
    {pending&&<MoveDialog key={`${pending.card.issue.issueId}:${pending.columnId}`} data={data} pending={pending} error={write.error||localError} busy={write.busy} blocked={!editable} statuses={refs.data?.statuses||[]} onClose={()=>setPending(null)} onChoose={(columnId,statusId,index)=>void commit(pending.card,columnId,statusId,index)}/>}
    {selected!==null&&<IssuePanel projectId={projectId} issueId={selected} readOnly={data.sprint?.state!=='ACTIVE'||failed} onClose={()=>setSelected(null)}/>}
  </>;
}

/** Người dùng chọn status khi cột có nhiều mapping; Hủy vẫn dùng được nếu chỉ lỗi đọc, chỉ khóa khi request ghi đang chạy. */
function MoveDialog({data,pending,busy,blocked,error,statuses,onClose,onChoose}:{data:BoardData;pending:Pending;busy:boolean;blocked:boolean;error:string;statuses:StatusDto[];onClose:()=>void;onChoose:(columnId:number,statusId:number,index:number)=>void}){
  const ids=new Set(data.sprintIssueIds);
  return <Modal open title={`Chuyển ${pending.card.issue.issueKey}`} description={blocked?'Dữ liệu/quyền đã thay đổi. Đóng hộp thoại và tải lại.':'Chọn trạng thái đích hợp lệ. Thao tác chỉ được lưu khi máy chủ xác nhận.'} onOpenChange={(v)=>{if(!v&&!busy)onClose();}} footer={<Btn disabled={busy} onClick={onClose}>Hủy</Btn>}>
    <div className="space-y-4">{error&&<InlineAlert tone="error">{error}</InlineAlert>}{data.board.columns.filter((c)=>pending.columnId===undefined||pending.columnId===c.columnId).map((column)=>{
      const allowed=allowedBoardTargets(pending.card,column,pending.allowed);
      const end=data.cards.filter((c)=>c.columnId===column.columnId&&ids.has(c.issue.issueId)&&c.issue.issueId!==pending.card.issue.issueId).length;
      return <div key={column.columnId}><h3 className="mb-2 text-xs font-semibold uppercase">{column.columnName}</h3><div className="flex flex-wrap gap-2">{column.mappedStatusIds.map((id)=><Btn key={id} disabled={busy||blocked||!allowed.includes(id)} title={!allowed.includes(id)?'Workflow không cho phép':undefined} onClick={()=>onChoose(column.columnId,id,pending.index??end)}>{statuses.find((s)=>s.statusId===id)?.statusName||`Status ${id}`}</Btn>)}{!column.mappedStatusIds.length&&<p className="text-xs text-[#6b778c]">Cột chưa ánh xạ trạng thái</p>}</div></div>;
    })}</div>
  </Modal>;
}
