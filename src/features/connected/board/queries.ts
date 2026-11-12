'use client';
import {useQuery} from '@tanstack/react-query';
import {connectedReadForActor,connectedRequest} from '../client';
import {useIssueContext} from '../issues/queries';
import {assertProject,type IssueDto,type SprintDto} from '../issues/model';
import type {BoardDto,CardDto,BoardData} from './model';

export const boardDataKey = (actor: number | undefined, projectId: number, boardId: number, sprintId: number | null) =>
  ['connected', 'board', actor, projectId, boardId, sprintId] as const;

/** Catalog lấy đúng project đã qua gate; không đoán boardId/sprintId từ số thứ tự hoặc tên. */
export function useConnectedBoards(projectId:number) {
  const {actor,enabled}=useIssueContext(projectId);
  return useQuery({queryKey:['connected','board-catalog',actor,projectId],enabled,retry:false,queryFn:({signal})=>connectedReadForActor(actor!,signal,async()=>{
    const [boards,sprints]=await Promise.all([
      connectedRequest<BoardDto[]>(`boards/project/${projectId}`,{signal},false),
      connectedRequest<SprintDto[]>(`sprints/project/${projectId}`,{signal},false),
    ]);
    [...boards,...sprints].forEach((v)=>assertProject(v,projectId));
    return {boards:boards.filter((b)=>b.boardType==='SCRUM'),sprints};
  })});
}

/** Đọc board/project trước card; scope sprint là giao tập ID thật, còn toàn project vẫn giữ để đếm WIP/quy đổi vị trí. */
export function useConnectedBoardData(projectId:number,boardId:number,sprintId:number|null) {
  const {actor,enabled}=useIssueContext(projectId);
  return useQuery({queryKey:boardDataKey(actor,projectId,boardId,sprintId),enabled,retry:false,queryFn:({signal}):Promise<BoardData>=>connectedReadForActor(actor!,signal,async()=>{
    const board=await connectedRequest<BoardDto>(`boards/${boardId}`,{signal},false);assertProject(board,projectId);
    if(board.boardType!=='SCRUM')throw new Error('Bảng này không phải Scrum board.');
    const [cards,sprint,members]=await Promise.all([
      connectedRequest<CardDto[]>(`boards/${boardId}/issues`,{signal},false),
      sprintId?connectedRequest<SprintDto>(`sprints/${sprintId}`,{signal},false):null,
      sprintId?connectedRequest<IssueDto[]>(`sprints/${sprintId}/issues`,{signal},false):[],
    ]);
    if(sprint)assertProject(sprint,projectId);
    members.forEach((i)=>assertProject(i,projectId));
    cards.forEach((c)=>{assertProject(c.issue,projectId);if(c.columnId!==null&&!board.columns.some((col)=>col.columnId===c.columnId))throw new Error('Cấu hình cột vừa thay đổi. Hãy tải lại.');});
    return {board,sprint,cards,sprintIssueIds:members.map((i)=>i.issueId)};
  })});
}
