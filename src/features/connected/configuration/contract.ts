export type ConfigurationAction={kind:'read'|'type'|'status'|'rule'|'assign'|'default'|'delete';write:boolean;projectId?:number;suffix:string};
const id=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=2147483647;
export const categories=['TO_DO','IN_PROGRESS','DONE'] as const;

/** Chỉ mở catalog toàn cục và project_issue_types. Quyền admin khác quyền cấu hình một project, BE vẫn kiểm từng request. */
export function configurationRoute(path:string,method:string,q:URLSearchParams):ConfigurationAction|null{
  let kind:ConfigurationAction['kind']|undefined;
  const item=/^(issue-types|issue-statuses)\/([1-9]\d*)$/.exec(path),project=/^projects\/([1-9]\d*)\/issue-types(?:\/([1-9]\d*)(\/default)?)?$/.exec(path);
  if(method==='GET'&&(['issue-types','issue-statuses','workflows/rules'].includes(path)||project&&!project[2]))kind='read';
  if(method==='POST'&&path==='issue-types'||method==='PUT'&&item?.[1]==='issue-types')kind='type';
  if(method==='POST'&&path==='issue-statuses'||method==='PUT'&&item?.[1]==='issue-statuses')kind='status';
  if(method==='POST'&&path==='workflows/rules')kind='rule';
  if(method==='DELETE'&&(item||/^workflows\/rules\/[1-9]\d*$/.test(path)||project?.[2]&&!project[3]))kind='delete';
  if(project?.[2]&&!project[3]&&method==='POST')kind='assign';
  if(project?.[2]&&project[3]&&method==='PUT')kind='default';
  if(!kind)return null;
  if(path.split('/').some(v=>/^\d+$/.test(v)&&!id(Number(v))))throw new Error('ID cấu hình không hợp lệ.');
  if(q.size&&(kind!=='assign'||q.size!==1||q.getAll('isDefault').length!==1||!['true','false'].includes(q.get('isDefault')||'')))throw new Error('Tham số cấu hình không hợp lệ.');
  return {kind,write:kind!=='read',...(project?{projectId:Number(project[1])}:{}),suffix:q.size?'?'+q.toString():''};
}

/** Chỉ gửi trường hợp đồng thật. Status sửa vẫn gửi category đã lưu; BE từ chối category khác bằng409. */
export function configurationBody(kind:'type'|'status'|'rule',value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Dữ liệu cấu hình không hợp lệ.');
  const body=value as Record<string,unknown>,keys=Object.keys(body),fields=kind==='type'?['typeName']:kind==='status'?['statusName','statusCategory']:['fromStatusId','toStatusId'];
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k)))throw new Error('Trường cấu hình không hợp lệ.');
  if(kind==='rule'){
    if(!id(body.fromStatusId)||!id(body.toStatusId)||body.fromStatusId===body.toStatusId)throw new Error('Chọn hai trạng thái khác nhau và hợp lệ.');
  }else{
    const key=kind==='type'?'typeName':'statusName',name=body[key];
    if(typeof name!=='string'||!name.trim()||name.trim().length>50)throw new Error('Tên cần 1–50 ký tự.');
    if(kind==='status'&&!categories.includes(body.statusCategory as typeof categories[number]))throw new Error('Nhóm trạng thái không hợp lệ.');
    return JSON.stringify({...body,[key]:name.trim()});
  }
  return JSON.stringify(body);
}

export type ProjectType={projectId:number;issueTypeId:number;issueTypeName:string;isDefault:boolean};
/** BE Lombok hiện trả default; chuẩn hóa đúng boolean này cho cả config và form tạo issue, không đổi API cũ. */
export function projectTypeFrom(raw:unknown):ProjectType{
  const row=raw as Record<string,unknown>;
  if(!row||!id(row.projectId)||!id(row.issueTypeId)||typeof row.issueTypeName!=='string'||typeof(row.isDefault??row.default)!=='boolean')throw new Error('Cấu hình loại công việc không hợp lệ.');
  return {projectId:row.projectId,issueTypeId:row.issueTypeId,issueTypeName:row.issueTypeName,isDefault:(row.isDefault??row.default) as boolean};
}
