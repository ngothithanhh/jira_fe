import type {IssueDto,StatusDto,SprintDto} from '../issues/model';
export type ColumnDto={columnId:number;columnName:string;position:number;wipLimit:number;mappedStatusIds:number[]};
export type BoardDto={boardId:number;projectId:number;boardName:string;boardType:string;columnOrderToken:string;columns:ColumnDto[]};
export type CardDto={issue:IssueDto;columnId:number|null;position:number;version:number|null};
export type BoardData={board:BoardDto;sprint:SprintDto|null;cards:CardDto[];sprintIssueIds:number[]};
export type BoardFilter={keyword:string;assignee:string;typeId:string};
export type MoveDraft={issueId:number;expectedVersion:number;columnId:number;position:number;statusIds:number[]};
export const emptyFilter:BoardFilter={keyword:'',assignee:'',typeId:''};
const ordered=(a:CardDto,b:CardDto)=>a.position-b.position||a.issue.issueId-b.issue.issueId;
export const orderedColumns = (columns: ColumnDto[]) => [...columns].sort((a, b) => a.position - b.position || a.columnId - b.columnId);

/** Giữ cả project để tính WIP, giao tập sprint để hiển thị; card unmapped không bị mất. */
export function buildBoardView(data:BoardData,filter:BoardFilter) {
  const ids=new Set(data.sprintIssueIds);
  const visible=(c:CardDto)=>(!filter.keyword.trim()||(`${c.issue.issueKey} ${c.issue.summary}`).toLocaleLowerCase('vi').includes(filter.keyword.trim().toLocaleLowerCase('vi')))
    &&(!filter.typeId||String(c.issue.issueTypeId)===filter.typeId)
    &&(!filter.assignee||(filter.assignee==='none'?c.issue.assigneeId===null:String(c.issue.assigneeId)===filter.assignee));
  const sprintCards=data.cards.filter((c)=>ids.has(c.issue.issueId));
  const columns=orderedColumns(data.board.columns).map((column)=>{
    const all=data.cards.filter((c)=>c.columnId===column.columnId).sort(ordered);
    const cards=all.filter((c)=>ids.has(c.issue.issueId));
    return {column,all,cards,shown:cards.filter(visible),load:all.length,full:column.wipLimit>0&&all.length>=column.wipLimit};
  });
  return {columns,unmapped:sprintCards.filter((c)=>c.columnId===null).filter(visible),filtered:!!filter.keyword.trim()||!!filter.assignee||!!filter.typeId};
}

/**
 * DnD nhận index trong sprint; BE cần index cột toàn project sau khi bỏ chính card.
 * Chèn trước anchor sprint kế tiếp hoặc sau anchor sprint cuối, giữ thứ tự tương đối card bị ẩn.
 */
export function toGlobalBoardPosition(data:BoardData,issueId:number,columnId:number,index:number) {
  const all=data.cards.filter((c)=>c.columnId===columnId&&c.issue.issueId!==issueId).sort(ordered);
  const ids=new Set(data.sprintIssueIds);const selected=all.filter((c)=>ids.has(c.issue.issueId));
  if(!Number.isInteger(index)||index<0||index>selected.length)throw new Error('Vị trí card không hợp lệ.');
  if(index<selected.length)return all.findIndex((c)=>c.issue.issueId===selected[index].issue.issueId);
  if(selected.length)return all.findIndex((c)=>c.issue.issueId===selected[selected.length-1].issue.issueId)+1;
  return all.length;
}

/** Chỉ trạng thái còn map vào cột và workflow cho phép; giữ status hiện tại khi reorder cùng cột. */
export function allowedBoardTargets(card:CardDto,column:ColumnDto,allowed:StatusDto[]) {
  return column.mappedStatusIds.filter((id)=>id===card.issue.statusId||allowed.some((s)=>s.statusId===id));
}
