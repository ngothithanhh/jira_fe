export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export type CollaborationRoute = {kind:'read'|'content'|'comment'|'edit-comment'|'delete-comment'|'upload'|'delete-file';write:boolean;suffix:string};
const version = (value:unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Chỉ nhận comment/file của issue cụ thể; parent issue được BE kiểm trước khi đọc/xóa nội dung PostgreSQL local. */
export function collaborationRoute(path:string,method:string,query:URLSearchParams):CollaborationRoute|null {
  const comments=/^issues\/[1-9]\d*\/comments$/.test(path),comment=/^issues\/[1-9]\d*\/comments\/[1-9]\d*$/.test(path);
  const files=/^issues\/[1-9]\d*\/attachments$/.test(path),file=/^issues\/[1-9]\d*\/attachments\/[1-9]\d*$/.test(path);
  const content=/^issues\/[1-9]\d*\/attachments\/[1-9]\d*\/content$/.test(path);
  const kind=method==='GET'&&content?'content':method==='GET'&&(comments||files)?'read':method==='POST'&&comments?'comment':method==='PUT'&&comment?'edit-comment'
    :method==='DELETE'&&comment?'delete-comment':method==='POST'&&files?'upload':method==='DELETE'&&file?'delete-file':null;
  if(!kind)return null;
  if(path.split('/').some(p=>/^\d+$/.test(p)&&Number(p)>2147483647))throw new Error('ID không hợp lệ.');
  if(kind==='delete-comment'){
    const value=query.get('expectedVersion');
    if(query.size!==1||query.getAll('expectedVersion').length!==1||value===null||!/^(0|[1-9]\d*)$/.test(value)||!version(Number(value)))throw new Error('Cần expectedVersion hợp lệ.');
  }else if(query.size)throw new Error('Tham số không hợp lệ.');
  return {kind,write:kind!=='read'&&kind!=='content',suffix:query.size?'?'+query.toString():''};
}

/** Giữ text nguyên văn, chặn rỗng và field lạ; author/issue lấy từ JWT/path, version là snapshot lúc bắt đầu sửa. */
export function commentBody(kind:'comment'|'edit-comment',input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Bình luận không hợp lệ.');
  const fields=input as Record<string,unknown>,allowed=kind==='comment'?['commentText']:['commentText','expectedVersion'];
  if(Object.keys(fields).length!==allowed.length||Object.keys(fields).some(k=>!allowed.includes(k))||typeof fields.commentText!=='string'
    ||!fields.commentText.trim()||fields.commentText.length>10000||kind==='edit-comment'&&!version(fields.expectedVersion))throw new Error('Bình luận cần 1–10000 ký tự và version hợp lệ khi sửa.');
  return JSON.stringify(fields);
}

export class UploadInputError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
/** Đếm byte thực trước parse multipart, kể cả không có Content-Length; không nhận part trùng hoặc body chỉ định actor/URL. */
export async function readAttachment(request:Request):Promise<FormData> {
  const type=request.headers.get('content-type')||'';
  if(!/^multipart\/form-data\s*;/i.test(type))throw new UploadInputError(400,'Cần gửi multipart/form-data.');
  const max=MAX_ATTACHMENT_BYTES+65536,reader=request.body?.getReader(),chunks:Uint8Array[]=[];
  if(!reader)throw new UploadInputError(400,'Chưa chọn tệp.');
  let total=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new UploadInputError(413,'Tệp tối đa 10 MiB.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  let data:FormData;
  try {data=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{'Content-Type':type}}).formData();}
  catch {throw new UploadInputError(400,'Multipart không hợp lệ.');}
  const values=[...data.entries()],file=data.get('file');
  if(values.length!==1||values[0][0]!=='file'||!file||typeof file==='string'||file.size===0)throw new UploadInputError(400,'Chỉ nhận một tệp không rỗng.');
  if(file.size>MAX_ATTACHMENT_BYTES)throw new UploadInputError(413,'Tệp tối đa 10 MiB.');
  if(!file.name.trim()||file.name.length>255||/[\x00-\x1f\x7f]/.test(file.name))throw new UploadInputError(400,'Tên tệp không hợp lệ.');
  return data;
}

/** Nội dung từ BE local cũng bị chặn theo byte thực; không chuyển JSON lỗi/URL thành nội dung tệp. */
export async function readAttachmentContent(response:Response) {
  const reader=response.body?.getReader();if(!reader)throw new UploadInputError(502,'Không nhận được nội dung tệp.');
  const chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_ATTACHMENT_BYTES){await reader.cancel();throw new UploadInputError(413,'Tệp tối đa 10 MiB.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return new Uint8Array(Buffer.concat(chunks));
}
