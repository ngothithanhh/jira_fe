'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState,type ReactNode} from 'react';
import {Btn,Field,InlineAlert,Modal,TextInput,SelectInput,PageHeading,StateView,tableClass,thClass,tdClass,Card} from '@/components/project-ui/kit';
import {useConfiguration,useConfigurationGate,useConfigurationWrite,type IssueType,type Status,type Rule} from './queries';
import {categories,type ProjectType} from './contract';
import {useConnectedProject} from '../projects/queries';
import {ConnectedError} from '../client';

/** Lỗi đọc phải hiện kèm retry. Khi giữ được cache, form vẫn tồn tại để không mất bản nháp. */
function ReadError({error,retry}:{error:Error|null;retry:()=>void}){
  return error?<InlineAlert tone="error">{error.message} <Btn onClick={retry}>Thử lại</Btn></InlineAlert>:null;
}
const labels={TO_DO:'Chưa làm',IN_PROGRESS:'Đang làm',DONE:'Hoàn thành'};

/** Gate đọc quyền quản trị thật; role project không được xem form sửa danh mục toàn hệ thống. */
export function ConfigurationAdmin({children}:{children:ReactNode}){
  const gate=useConfigurationGate(),path=usePathname();
  const denied=gate.error instanceof ConnectedError&&[401,403].includes(gate.error.status);
  if(gate.isPending)return <p role="status">Đang kiểm tra quyền quản trị…</p>;
  if(denied||gate.data&&!gate.data.systemAdmin)return <StateView kind="forbidden" title="Chỉ quản trị viên hệ thống được cấu hình danh mục"/>;
  if(!gate.data)return <ReadError error={gate.error} retry={()=>void gate.refetch()}/>;
  return <div className="space-y-6"><PageHeading title="Cấu hình hệ thống" description="Danh mục và quy tắc chuyển trạng thái dùng chung cho tất cả dự án."/>
    <nav aria-label="Cấu hình hệ thống" className="flex flex-wrap gap-5 border-b border-[#dfe1e6]">{[['users','Người dùng'],['roles','Vai trò & quyền'],['issue-types','Loại công việc'],['statuses','Trạng thái'],['workflows','Workflow'],['audit','Nhật ký']].map(([key,label])=><Link key={key} href={'/app/admin/'+key} aria-current={path.endsWith('/'+key)?'page':undefined} className={'pb-3 text-sm '+(path.endsWith('/'+key)?'border-b-2 border-[#0052cc] font-semibold text-[#0052cc]':'text-[#42526e]')}>{label}</Link>)}</nav>
    <ReadError error={gate.error} retry={()=>void gate.refetch()}/>{children}</div>;
}

/** Form dùng đúng trường API. Category bị khóa khi sửa; tên trùng hoặc liên kết sử dụng trả lỗi ngay trong modal. */
export function CatalogScreen({kind}:{kind:'types'|'statuses'}){
  const data=useConfiguration(kind),gate=useConfigurationGate(),write=useConfigurationWrite();
  const [draft,setDraft]=useState<{id?:number;name:string;category:Status['statusCategory']}|null>(null);
  const [removing,setRemoving]=useState<{id:number;name:string}|null>(null),[saved,setSaved]=useState('');
  const status=kind==='statuses',base=status?'issue-statuses':'issue-types',title=status?'Trạng thái':'Loại công việc';
  const blocked=write.busy||write.uncertain||gate.isError||data.isError||!gate.data?.systemAdmin;
  const close=()=>{if(!write.busy){setDraft(null);setRemoving(null);write.clearError();}};
  const rows=(data.data||[]).map(row=>status?{id:(row as Status).statusId,name:(row as Status).statusName,category:(row as Status).statusCategory}:{id:(row as IssueType).issueTypeId,name:(row as IssueType).typeName,category:'TO_DO' as const});
  return <div className="space-y-4"><PageHeading title={title} actions={<Btn variant="primary" disabled={blocked} onClick={()=>{write.clearError();setSaved('');setDraft({name:'',category:'TO_DO'});}}>Thêm {title.toLowerCase()}</Btn>}/>
    {saved&&<InlineAlert tone="success">{saved}</InlineAlert>}<ReadError error={data.error} retry={()=>void data.refetch()}/>
    {data.isPending?<p role="status">Đang tải danh mục…</p>:<div className="overflow-x-auto"><table className={tableClass}><thead><tr><th className={thClass}>Tên</th>{status&&<th className={thClass}>Nhóm cố định</th>}<th className={thClass}>Thao tác</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td className={tdClass}>{row.name}</td>{status&&<td className={tdClass}>{labels[row.category]}</td>}<td className={tdClass}><Btn variant="subtle" disabled={blocked} onClick={()=>{write.clearError();setDraft(row);}}>Sửa</Btn><Btn variant="subtle" disabled={blocked} onClick={()=>{write.clearError();setRemoving(row);}}>Xóa</Btn></td></tr>)}</tbody></table>{!rows.length&&!data.isError&&<p className="py-6 text-sm">Chưa có danh mục.</p>}</div>}
    {draft&&<Modal open title={(draft.id?'Sửa ':'Thêm ')+title.toLowerCase()} description="Cấu hình dùng chung cho mọi dự án." onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn type="submit" form="catalog-form" variant="primary" disabled={blocked||!draft.name.trim()}>Lưu</Btn></>}>
      <form id="catalog-form" className="space-y-4" onSubmit={event=>{event.preventDefault();if(blocked)return;void write.run(base+(draft.id?'/'+draft.id:''),{method:draft.id?'PUT':'POST',body:JSON.stringify(status?{statusName:draft.name,statusCategory:draft.category}:{typeName:draft.name})},()=>{setDraft(null);setSaved('Đã lưu '+title.toLowerCase()+'.');});}}>
        <ReadError error={gate.error||data.error} retry={()=>{void gate.refetch();void data.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
        <Field label="Tên" required>{p=><TextInput {...p} autoFocus required maxLength={50} disabled={write.busy||write.uncertain} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/>}</Field>
        {status&&<Field label="Nhóm trạng thái" required>{p=>draft.id?<><TextInput {...p} readOnly value={labels[draft.category]}/><p className="mt-2 text-xs text-[#6b778c]">Nhóm cố định sau khi tạo để bảo toàn ý nghĩa báo cáo Scrum.</p></>:<SelectInput {...p} value={draft.category} disabled={write.busy||write.uncertain} onChange={e=>setDraft({...draft,category:e.target.value as Status['statusCategory']})}>{categories.map(c=><option key={c} value={c}>{labels[c]}</option>)}</SelectInput>}</Field>}
      </form></Modal>}
    {removing&&<Modal open title={'Xóa '+title.toLowerCase()} onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn variant="danger" disabled={blocked} onClick={()=>void write.run(base+'/'+removing.id,{method:'DELETE'},()=>{setRemoving(null);setSaved('Đã xóa '+title.toLowerCase()+'.');})}>Xác nhận xóa</Btn></>}>
      <p className="mb-3 text-sm">Xóa “{removing.name}”? Chỉ xóa được khi không còn liên kết sử dụng.</p><ReadError error={gate.error||data.error} retry={()=>{void gate.refetch();void data.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    </Modal>}
  </div>;
}

/** Workflow là các cạnh có hướng, không đổi issue đang tồn tại. Project chỉ xem; admin sửa tại màn toàn hệ thống. */
export function WorkflowScreen({readOnly=false}:{readOnly?:boolean}){
  const rules=useConfiguration('rules'),statuses=useConfiguration('statuses'),gate=useConfigurationGate(),write=useConfigurationWrite();
  const [creating,setCreating]=useState(false),[from,setFrom]=useState(''),[to,setTo]=useState(''),[removing,setRemoving]=useState<Rule|null>(null),[saved,setSaved]=useState('');
  const blocked=readOnly||write.busy||write.uncertain||gate.isError||!gate.data?.systemAdmin||rules.isError||statuses.isError;
  const close=()=>{if(!write.busy){setCreating(false);setRemoving(null);write.clearError();}};
  return <div className="space-y-4"><PageHeading title="Workflow" description="Mỗi dòng cho phép chuyển từ trạng thái nguồn sang trạng thái đích. Các quy tắc dùng chung toàn hệ thống."
    actions={readOnly?(gate.data?.systemAdmin?<Link href="/app/admin/workflows" className="text-sm text-[#0052cc] underline">Quản trị workflow toàn hệ thống</Link>:undefined):<Btn variant="primary" disabled={blocked} onClick={()=>{write.clearError();setFrom('');setTo('');setCreating(true);}}>Thêm quy tắc</Btn>}/>
    {saved&&<InlineAlert tone="success">{saved}</InlineAlert>}<ReadError error={rules.error} retry={()=>void rules.refetch()}/><ReadError error={statuses.error} retry={()=>void statuses.refetch()}/>
    {rules.isPending?<p role="status">Đang tải workflow…</p>:<div className="overflow-x-auto"><table className={tableClass}><thead><tr><th className={thClass}>Từ trạng thái</th><th className={thClass}>Sang trạng thái</th>{!readOnly&&<th className={thClass}>Thao tác</th>}</tr></thead><tbody>{rules.data?.map(rule=><tr key={rule.ruleId}><td className={tdClass}>{rule.fromStatus.statusName}</td><td className={tdClass}>→ {rule.toStatus.statusName}</td>{!readOnly&&<td className={tdClass}><Btn variant="subtle" disabled={blocked} onClick={()=>{write.clearError();setRemoving(rule);}}>Xóa</Btn></td>}</tr>)}</tbody></table>{!rules.data?.length&&!rules.isError&&<p className="py-6 text-sm">Chưa có quy tắc chuyển trạng thái.</p>}</div>}
    {creating&&<Modal open title="Thêm quy tắc chuyển trạng thái" onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn type="submit" form="workflow-form" variant="primary" disabled={blocked||!from||!to||from===to}>Lưu quy tắc</Btn></>}>
      <form id="workflow-form" className="space-y-4" onSubmit={event=>{event.preventDefault();if(blocked||!from||!to||from===to)return;void write.run('workflows/rules',{method:'POST',body:JSON.stringify({fromStatusId:Number(from),toStatusId:Number(to)})},()=>{setCreating(false);setSaved('Đã thêm quy tắc.');});}}>
        <ReadError error={gate.error||rules.error||statuses.error} retry={()=>{void gate.refetch();void rules.refetch();void statuses.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
        {(['from','to'] as const).map(side=><Field key={side} label={side==='from'?'Từ trạng thái':'Sang trạng thái'} required>{p=><SelectInput {...p} required value={side==='from'?from:to} disabled={write.busy||write.uncertain} onChange={e=>side==='from'?setFrom(e.target.value):setTo(e.target.value)}><option value="">Chọn trạng thái</option>{statuses.data?.map(s=><option key={s.statusId} value={s.statusId} disabled={String(s.statusId)===(side==='from'?to:from)}>{s.statusName} · {labels[s.statusCategory]}</option>)}</SelectInput>}</Field>)}
        <p className="text-sm text-[#6b778c]">Quy tắc mới chỉ cho phép thao tác chuyển sau này, không tự chuyển công việc.</p>
      </form></Modal>}
    {removing&&<Modal open title="Xóa quy tắc chuyển trạng thái" onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn variant="danger" disabled={blocked} onClick={()=>void write.run('workflows/rules/'+removing.ruleId,{method:'DELETE'},()=>{setRemoving(null);setSaved('Đã xóa quy tắc.');})}>Xác nhận xóa</Btn></>}>
      <p className="mb-3 text-sm">{removing.fromStatus.statusName} → {removing.toStatus.statusName}. Xóa quy tắc không đổi trạng thái hoặc lịch sử công việc.</p><ReadError error={gate.error||rules.error||statuses.error} retry={()=>{void gate.refetch();void rules.refetch();void statuses.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    </Modal>}
  </div>;
}

/** Gán danh mục chung vào project từ URL. Gỡ/default chỉ tác động project này; issue đã tạo giữ nguyên loại cũ. */
export function ProjectTypeSettings({projectId}:{projectId:number}){
  const project=useConnectedProject(projectId),types=useConfiguration('types'),assigned=useConfiguration('project-types',projectId),write=useConfigurationWrite(projectId);
  const [adding,setAdding]=useState(false),[selected,setSelected]=useState(''),[removing,setRemoving]=useState<ProjectType|null>(null),[saved,setSaved]=useState('');
  const context=project.data?.context,canEdit=!!context&&(context.systemAdmin||context.projectPermissions.some(p=>p==='UPDATE_PROJECT'||p==='MANAGE_BOARD'));
  const blocked=!canEdit||project.isError||types.isError||assigned.isError||write.busy||write.uncertain;
  const available=types.data?.filter(t=>!assigned.data?.some(a=>a.issueTypeId===t.issueTypeId))||[];
  const close=()=>{if(!write.busy){setAdding(false);setRemoving(null);write.clearError();}};
  return <div className="space-y-4"><PageHeading title="Loại công việc của dự án" description="Chọn loại được phép dùng khi tạo công việc và loại mặc định cho lần tạo tiếp theo." actions={canEdit?<Btn variant="primary" disabled={blocked||!available.length} onClick={()=>{write.clearError();setSelected('');setAdding(true);}}>Gán loại công việc</Btn>:undefined}/>
    {!canEdit&&<InlineAlert>Bạn chỉ được xem cấu hình loại công việc.</InlineAlert>}{saved&&<InlineAlert tone="success">{saved}</InlineAlert>}
    <ReadError error={types.error} retry={()=>void types.refetch()}/><ReadError error={assigned.error} retry={()=>void assigned.refetch()}/>
    {!adding&&!removing&&write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    {assigned.isPending?<p role="status">Đang tải cấu hình…</p>:<Card><table className={tableClass}><thead><tr><th className={thClass}>Loại công việc</th><th className={thClass}>Mặc định</th>{canEdit&&<th className={thClass}>Thao tác</th>}</tr></thead><tbody>{assigned.data?.map(t=><tr key={t.issueTypeId}><td className={tdClass}>{t.issueTypeName}</td><td className={tdClass}>{t.isDefault?'Mặc định':'—'}</td>{canEdit&&<td className={tdClass}>{!t.isDefault&&<Btn variant="subtle" disabled={blocked} onClick={()=>void write.run('projects/'+projectId+'/issue-types/'+t.issueTypeId+'/default',{method:'PUT'},()=>setSaved('Đã chọn loại mặc định: '+t.issueTypeName))}>Đặt mặc định</Btn>}<Btn variant="subtle" disabled={blocked||t.isDefault} onClick={()=>{write.clearError();setRemoving(t);}}>Gỡ</Btn></td>}</tr>)}</tbody></table>{!assigned.data?.length&&!assigned.isError&&<p className="py-6 text-sm">Chưa gán loại công việc. Gán ít nhất một loại để tạo công việc.</p>}</Card>}
    {adding&&<Modal open title="Gán loại công việc" onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn type="submit" form="assign-type-form" variant="primary" disabled={blocked||!selected}>Gán</Btn></>}>
      <form id="assign-type-form" className="space-y-4" onSubmit={e=>{e.preventDefault();if(blocked||!selected)return;void write.run('projects/'+projectId+'/issue-types/'+selected,{method:'POST'},()=>{setAdding(false);setSaved('Đã gán loại công việc.');});}}>
        <ReadError error={project.error||types.error||assigned.error} retry={()=>{void project.refetch();void types.refetch();void assigned.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
        <Field label="Loại công việc" required>{p=><SelectInput {...p} required value={selected} disabled={write.busy||write.uncertain} onChange={e=>setSelected(e.target.value)}><option value="">Chọn loại công việc</option>{available.map(t=><option key={t.issueTypeId} value={t.issueTypeId}>{t.typeName}</option>)}</SelectInput>}</Field>
      </form></Modal>}
    {removing&&<Modal open title="Gỡ loại công việc" onOpenChange={open=>{if(!open)close();}} footer={<><Btn disabled={write.busy} onClick={close}>Hủy</Btn><Btn variant="danger" disabled={blocked} onClick={()=>void write.run('projects/'+projectId+'/issue-types/'+removing.issueTypeId,{method:'DELETE'},()=>{setRemoving(null);setSaved('Đã gỡ loại công việc.');})}>Xác nhận gỡ</Btn></>}>
      <p className="mb-3 text-sm">Gỡ “{removing.issueTypeName}” khỏi dự án? Loại đang có công việc sử dụng không thể gỡ.</p><ReadError error={project.error||types.error||assigned.error} retry={()=>{void project.refetch();void types.refetch();void assigned.refetch();}}/>{write.error&&<InlineAlert tone="error">{write.error}</InlineAlert>}
    </Modal>}
  </div>;
}
