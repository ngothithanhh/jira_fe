export type BoardAction = { kind:'read'|'create'|'rename'|'column'|'edit-column'|'map'|'unmap'|'delete'|'move'; write:boolean; suffix:string };
const integer = (v:unknown, min=1):v is number => typeof v==='number' && Number.isInteger(v) && v>=min && v<=2147483647;
const validId = (s:string) => /^[1-9]\d*$/.test(s) && integer(Number(s));

/** Mở đúng endpoint board/cột. Query ID không lặp, không nhận actor hoặc URL upstream từ browser. */
export function boardRoute(path:string,method:string,q:URLSearchParams):BoardAction|null {
  let kind:BoardAction['kind']|undefined;
  if(method==='GET' && (/^boards\/project\/[1-9]\d*$/.test(path)||/^boards\/[1-9]\d*(\/issues)?$/.test(path)||/^sprints\/[1-9]\d*$/.test(path))) kind='read';
  if(method==='POST' && path==='boards') kind='create';
  if(method==='PATCH' && /^boards\/[1-9]\d*$/.test(path)) kind='rename';
  if(method==='POST' && path==='boards/columns') kind='column';
  if(method==='PATCH' && /^boards\/columns\/[1-9]\d*$/.test(path)) kind='edit-column';
  if(method==='POST' && path==='boards/columns/map-status') kind='map';
  if(method==='DELETE' && path==='boards/columns/map-status') kind='unmap';
  if(method==='DELETE' && /^boards\/(columns\/)?[1-9]\d*$/.test(path)) kind='delete';
  if(method==='PUT' && /^boards\/[1-9]\d*\/issues\/[1-9]\d*\/move$/.test(path)) kind='move';
  if(!kind)return null;
  if(path.split('/').some((p)=>/^\d+$/.test(p)&&!validId(p))) throw new Error('ID board/cột không hợp lệ.');
  if(kind==='unmap') {
    if(q.size!==2 || !validId(q.get('columnId')||'') || !validId(q.get('statusId')||''))throw new Error('Thiếu ID cột/trạng thái hợp lệ.');
    for(const key of q.keys())if(!['columnId','statusId'].includes(key)||q.getAll(key).length!==1)throw new Error('Tham số không hợp lệ.');
  } else if(q.size)throw new Error('Tham số không hợp lệ.');
  return {kind,write:kind!=='read',suffix:q.size?'?'+q.toString():''};
}

/** Payload chỉ chứa ID nghiệp vụ và trường hợp đồng; Sprint guard luôn bật cho move từ màn connected. */
export function boardBody(kind:BoardAction['kind'],input:unknown):string|undefined {
  if(['read','delete','unmap'].includes(kind))return undefined;
  if(!input || typeof input!=='object'||Array.isArray(input))throw new Error('Dữ liệu không hợp lệ.');
  const v=input as Record<string,unknown>;const out:Record<string,unknown>={};
  const num=(key:string,min=1)=>{if(!integer(v[key],min))throw new Error('ID/vị trí/WIP không hợp lệ.');out[key]=v[key];};
  const name=(key:string)=>{if(typeof v[key]!=='string'||!v[key].trim()||v[key].length>100)throw new Error('Tên cần từ 1 đến 100 ký tự.');out[key]=v[key].trim();};
  if(kind==='create'){num('projectId');name('boardName');out.boardType='SCRUM';}
  if(kind==='rename')name('boardName');
  if(kind==='column'){num('boardId');name('columnName');num('position',0);}
  if(kind==='edit-column'){name('columnName');num('wipLimit',0);}
  if(kind==='map'){num('columnId');num('statusId');}
  if(kind==='move'){
    num('columnId');num('statusId');num('position',0);num('sprintId');
    if(typeof v.expectedVersion!=='number'||!Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<0)throw new Error('Phiên bản card không hợp lệ.');
    out.expectedVersion=v.expectedVersion;
  }
  return JSON.stringify(out);
}
