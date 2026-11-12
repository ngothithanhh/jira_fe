export const entityTypes=['USER','PROJECT','ISSUE','SPRINT','BOARD','COMMENT','ATTACHMENT','WORKLOG','ROLE'] as const;
export type AuditEntry={auditId:number;actorId:number|null;actorName:string|null;action:string;entityType:typeof entityTypes[number];entityId:number;description:string|null;createdAt:string;projectId:number|null};
export type AuditPage={items:AuditEntry[];page:number;size:number;totalItems:number;totalPages:number};
export type AuditFilter={entityType:string;entityId:string;actorId:string;systemOnly:boolean;action:string;from:string;to:string;projectId:string};
export const emptyFilter:AuditFilter={entityType:'',entityId:'',actorId:'',systemOnly:false,action:'',from:'',to:'',projectId:''};
const id=(v:string)=>/^[1-9]\d*$/.test(v)&&Number(v)<=2147483647;
const day=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number(v.slice(0,4))>0&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const timestamp=(v:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?$/.test(v)&&day(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60;

/** Draft từ form chỉ thành filter đã áp dụng khi hợp lệ; ngày theo đồng hồ DB, không đổi sang UTC. */
export function auditQuery(filter:AuditFilter,page=0,size=20,project?:number){
  const q=new URLSearchParams({page:String(page),size:String(size)});
  if(filter.entityType)q.set('entityType',filter.entityType);
  if(filter.entityId)q.set('entityId',filter.entityId);
  if(filter.systemOnly)q.set('systemOnly','true');else if(filter.actorId)q.set('actorId',filter.actorId);
  if(filter.action.trim())q.set('action',filter.action.trim().toUpperCase());
  if(filter.from){if(!day(filter.from))throw new Error('Ngày bắt đầu không hợp lệ.');q.set('createdFrom',filter.from+'T00:00:00');}
  if(filter.to){if(!day(filter.to))throw new Error('Ngày kết thúc không hợp lệ.');q.set('createdTo',filter.to+'T23:59:59.999999');}
  if(project===undefined&&filter.projectId)q.set('projectId',filter.projectId);
  const route=project===undefined?'admin/audit-logs':`projects/${project}/audit-logs`;
  return route+auditRoute(route,'GET',q)!.suffix;
}

/** BFF chỉ mở GET danh sách; project trong URL không thể bị query ghi đè và không nhận tham số tùy ý. */
export function auditRoute(route:string,method:string,query:URLSearchParams):{suffix:string}|null{
  const match=/^projects\/(\d+)\/audit-logs$/.exec(route);
  if(method!=='GET'||route!=='admin/audit-logs'&&!match)return null;
  if(match&&!id(match[1]))throw new Error('ID dự án không hợp lệ.');
  const allowed=new Set(['entityType','entityId','actorId','systemOnly','action','createdFrom','createdTo','page','size',...(!match?['projectId']:[])]);
  for(const [key,value] of query){
    if(!allowed.has(key)||query.getAll(key).length!==1||!value)throw new Error('Bộ lọc nhật ký không hợp lệ.');
    if(['entityId','actorId','projectId'].includes(key)&&!id(value))throw new Error('ID bộ lọc phải là số nguyên dương.');
    if(key==='entityType'&&!entityTypes.includes(value as typeof entityTypes[number]))throw new Error('Loại đối tượng không hợp lệ.');
    if(key==='systemOnly'&&!['true','false'].includes(value))throw new Error('Bộ lọc hệ thống không hợp lệ.');
    if(key==='action'&&(!value.trim()||value.length>50||/[\x00-\x1f]/.test(value)))throw new Error('Mã thao tác tối đa 50 ký tự.');
    if(['createdFrom','createdTo'].includes(key)&&!timestamp(value))throw new Error('Thời gian không hợp lệ.');
    if(key==='page'&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))))throw new Error('Trang không hợp lệ.');
    if(key==='size'&&(!/^\d+$/.test(value)||Number(value)<1||Number(value)>100))throw new Error('Cỡ trang phải từ 1 đến 100.');
  }
  if(query.has('entityId')&&!query.has('entityType')||query.get('systemOnly')==='true'&&query.has('actorId')
      ||Number(query.get('page')||0)*Number(query.get('size')||20)>2147483647)throw new Error('Bộ lọc nhật ký không hợp lệ.');
  if(query.has('createdFrom')&&query.has('createdTo')&&Date.parse(query.get('createdFrom')!+'Z')>Date.parse(query.get('createdTo')!+'Z'))throw new Error('Ngày bắt đầu phải trước ngày kết thúc.');
  return {suffix:query.size?'?'+query.toString():''};
}

/** Chỉ nhận DTO cần hiển thị; scope project sai hoặc response lỗi không được đưa vào cache của màn hiện tại. */
export function auditPageFrom(value:unknown,project?:number):AuditPage{
  const data=value as AuditPage;
  if(!data||!Array.isArray(data.items)||![data.page,data.size,data.totalItems,data.totalPages].every(n=>Number.isSafeInteger(n)&&n>=0)||data.size<1||data.size>100||data.items.length>data.size)throw new Error('Dữ liệu nhật ký không hợp lệ.');
  return {page:data.page,size:data.size,totalItems:data.totalItems,totalPages:data.totalPages,items:data.items.map(row=>{
    if(!row||!id(String(row.auditId))||!id(String(row.entityId))||!entityTypes.includes(row.entityType)||typeof row.action!=='string'||!row.action||typeof row.createdAt!=='string'||!timestamp(row.createdAt)
       ||row.actorId!==null&&!id(String(row.actorId))||row.projectId!==null&&!id(String(row.projectId))||row.actorName!==null&&typeof row.actorName!=='string'||row.description!==null&&typeof row.description!=='string'||project!==undefined&&row.projectId!==project)throw new Error('Phạm vi hoặc nội dung nhật ký không hợp lệ.');
    return {auditId:row.auditId,actorId:row.actorId,actorName:row.actorName,action:row.action,entityType:row.entityType,entityId:row.entityId,description:row.description,createdAt:row.createdAt,projectId:row.projectId};
  })};
}
