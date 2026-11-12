'use client';
import {useState} from 'react';
import {useParams} from 'next/navigation';
import {Btn,Field,InlineAlert,Modal,TextInput,SelectInput,PageHeading,StateView,tableClass,thClass,tdClass} from '@/components/project-ui/kit';
import {useSession} from '../session';
import {ConnectedError} from '../client';
import {useAudit} from './queries';
import {auditQuery,emptyFilter,entityTypes,type AuditEntry,type AuditFilter} from './contract';

/** Đổi actor hoặc project phải tạo lại màn hình và bỏ detail/filter của phạm vi trước. */
export function ConnectedAudit({project}:{project?:number}){
  const session=useSession();
  return <AuditScreen key={`${session.data?.user.userId}:${project}`} project={project}/>;
}
/** ID project chỉ lấy từ URL, không lấy từ ô lọc của người dùng. */
export function ConnectedProjectAudit(){
  const params=useParams<{projectId:string}>();
  const id=/^[1-9]\d*$/.test(params.projectId)?Number(params.projectId):0;
  return id>0&&id<=2147483647?<ConnectedAudit project={id}/>:<StateView kind="not-found" title="Không tìm thấy dự án"/>;
}

/** Nhật ký chỉ đọc; draft chỉ áp dụng khi submit, table/modal không tồn tại khi phiên hoặc quyền bị từ chối. */
function AuditScreen({project}:{project?:number}){
  const [draft,setDraft]=useState<AuditFilter>({...emptyFilter}),[filter,setFilter]=useState<AuditFilter>({...emptyFilter});
  const [page,setPage]=useState(0),[size,setSize]=useState(20),[error,setError]=useState(''),[detail,setDetail]=useState<AuditEntry|null>(null);
  const {gate,logs,permitted,switching}=useAudit(filter,page,size,project);
  const retry=()=>{void gate.refetch();void logs.refetch();};
  const failures=[gate.error,logs.error];
  const denied=failures.some(e=>e instanceof ConnectedError&&[401,403,404,409].includes(e.status));
  const failed=failures.find(Boolean);
  if(switching||gate.isPending)return <p role="status">Đang kiểm tra quyền xem nhật ký…</p>;
  if(denied||gate.data&&!permitted)return <div className="space-y-3"><StateView kind="forbidden" title="Bạn không có quyền xem nhật ký này"/><Btn onClick={retry}>Kiểm tra lại quyền</Btn></div>;
  if(!gate.data)return <InlineAlert tone="error">{gate.error?.message||'Chưa tải được quyền.'} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>;
  function field<K extends keyof AuditFilter>(key:K,value:AuditFilter[K]){setDraft(old=>({...old,[key]:value}));}
  function apply(){
    try{auditQuery(draft,0,size,project);setFilter({...draft,action:draft.action.trim().toUpperCase()});setPage(0);setDetail(null);setError('');}
    catch(e){setError((e as Error).message);}
  }
  return <div className="min-w-0 space-y-5">
    <PageHeading title={project===undefined?'Nhật ký hoạt động toàn hệ thống':'Nhật ký hoạt động dự án'} description="Lịch sử thao tác đã ghi nhận, mới nhất trước. Thời gian theo máy chủ, không chuyển múi giờ."/>
    <form aria-label="Lọc nhật ký" className="grid gap-3 rounded-[3px] border border-[#dfe1e6] p-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();apply();}}>
      <Field label="Loại đối tượng"><SelectInput aria-label="Loại đối tượng" value={draft.entityType} onChange={e=>field('entityType',e.target.value)}><option value="">Tất cả</option>{entityTypes.map(t=><option key={t}>{t}</option>)}</SelectInput></Field>
      <Field label="ID đối tượng"><TextInput aria-label="ID đối tượng" inputMode="numeric" value={draft.entityId} onChange={e=>field('entityId',e.target.value)}/></Field>
      <Field label="ID người thao tác"><TextInput aria-label="ID người thao tác" inputMode="numeric" disabled={draft.systemOnly} value={draft.actorId} onChange={e=>field('actorId',e.target.value)}/></Field>
      <Field label="Mã thao tác"><TextInput aria-label="Mã thao tác" maxLength={50} placeholder="VD: CREATE_ISSUE" value={draft.action} onChange={e=>field('action',e.target.value)}/></Field>
      <Field label="Từ ngày"><TextInput aria-label="Từ ngày" type="date" value={draft.from} onChange={e=>field('from',e.target.value)}/></Field>
      <Field label="Đến ngày"><TextInput aria-label="Đến ngày" type="date" value={draft.to} onChange={e=>field('to',e.target.value)}/></Field>
      {project===undefined&&<Field label="ID dự án"><TextInput aria-label="ID dự án" inputMode="numeric" value={draft.projectId} onChange={e=>field('projectId',e.target.value)}/></Field>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.systemOnly} onChange={e=>setDraft(old=>({...old,systemOnly:e.target.checked,actorId:''}))}/>Chỉ thao tác hệ thống</label>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-4"><Btn type="submit" variant="primary">Áp dụng</Btn><Btn type="button" onClick={()=>{setDraft({...emptyFilter});setFilter({...emptyFilter});setPage(0);setDetail(null);setError('');}}>Xóa bộ lọc</Btn><Btn type="button" onClick={()=>{setDetail(null);retry();}}>Tải lại</Btn></div>
    </form>
    {error&&<InlineAlert tone="error">{error}</InlineAlert>}
    {failed&&<InlineAlert tone="error">{failed.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>}
    {logs.isFetching&&<p role="status">Đang tải nhật ký…</p>}
    {logs.data&&<>
      <p className="text-sm text-[#6b778c]">{logs.data.totalItems} bản ghi{logs.isError?' · Dữ liệu đã tải trước đó':''}</p>
      <div className="max-w-full overflow-x-auto rounded-[3px] border border-[#dfe1e6]"><table aria-label="Nhật ký hoạt động" className={tableClass}><thead><tr>{['Thời gian','Người thao tác','Thao tác','Đối tượng',...(project===undefined?['Dự án']:[]),'Chi tiết'].map(h=><th key={h} className={thClass}>{h}</th>)}</tr></thead><tbody>
        {logs.data.items.map(row=><tr key={row.auditId}><td className={tdClass+' whitespace-nowrap'}>{row.createdAt.replace('T',' ').slice(0,19)}</td><td className={tdClass}>{row.actorId===null?'Hệ thống':`${row.actorName||'Người dùng'} (#${row.actorId})`}</td><td className={tdClass}>{row.action}</td><td className={tdClass}>{row.entityType} #{row.entityId}</td>{project===undefined&&<td className={tdClass}>{row.projectId===null?'Toàn cục / chưa xác định':`#${row.projectId}`}</td>}<td className={tdClass}><Btn onClick={()=>setDetail(row)} aria-label={`Chi tiết nhật ký ${row.auditId}`}>Xem chi tiết</Btn></td></tr>)}
        {!logs.data.items.length&&<tr><td className={tdClass} colSpan={project===undefined?6:5}>Không có hoạt động khớp bộ lọc.</td></tr>}
      </tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><label>Số dòng <SelectInput aria-label="Số dòng" className="ml-2 w-20" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0);setDetail(null);}}>{[20,50,100].map(n=><option key={n}>{n}</option>)}</SelectInput></label><span>Trang {page+1}/{Math.max(1,logs.data.totalPages)}</span><div className="flex gap-2"><Btn disabled={!page||logs.isFetching} onClick={()=>{setPage(p=>p-1);setDetail(null);}}>Trước</Btn><Btn disabled={page+1>=logs.data.totalPages||logs.isFetching} onClick={()=>{setPage(p=>p+1);setDetail(null);}}>Sau</Btn></div></div>
    </>}
    {detail&&<Modal open title={`Chi tiết nhật ký #${detail.auditId}`} onOpenChange={open=>{if(!open)setDetail(null);}} footer={<Btn onClick={()=>setDetail(null)}>Đóng</Btn>}>
      <dl className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] gap-3 break-words text-sm">{[['Thời gian',detail.createdAt.replace('T',' ')],['Người thao tác',detail.actorId===null?'Hệ thống':`${detail.actorName||'Người dùng'} (#${detail.actorId})`],['Thao tác',detail.action],['Đối tượng',`${detail.entityType} #${detail.entityId}`],['Dự án',detail.projectId===null?'Toàn cục / chưa xác định':`#${detail.projectId}`],['Mô tả',detail.description||'Không có mô tả.']].map(([label,value])=><div key={label} className="contents"><dt className="text-[#6b778c]">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
    </Modal>}
  </div>;
}
