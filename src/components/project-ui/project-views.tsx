'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';
import { Avatar, Btn, EmptyState, Field, PageHeading, SearchInput, TextArea, TextInput, tableClass, tdClass, thClass } from './kit';
import { cn } from '@/lib/utils';

export type ProjectListItem = {
  id: number; name: string; key: string; description: string; leaderName: string | null;
  memberCount?: number; issueCount?: number; activeSprintName?: string | null;
};
export type ProjectDraft = { name: string; key: string; description: string };

/** Gợi ý mã theo cách form mẫu đang dùng; chỉ gợi ý khi người dùng chưa tự sửa mã. */
export function suggestProjectKey(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'D').split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 10);
}

/** Ba trường trình bày dùng chung giữa fixture và API; không gọi service hoặc tự gán lead/quyền. */
export function ProjectFields({ draft, onChange, errors = {}, disabled = false, keyReadOnly = false, descriptionLimit = 255 }: {
  draft: ProjectDraft; onChange: (field: keyof ProjectDraft, value: string) => void; errors?: Record<string, string>; disabled?: boolean; keyReadOnly?: boolean; descriptionLimit?: number;
}) {
  return <>
    <Field label="Tên dự án" required error={errors.name}>{(p) => <TextInput {...p} autoFocus required maxLength={100} disabled={disabled} value={draft.name} onChange={(e) => onChange('name', e.target.value)} />}</Field>
    <Field label="Mã dự án" required={!keyReadOnly} error={errors.key} hint="Tối đa 10 ký tự, dùng làm tiền tố mã công việc (vd. SCR-12). Không đổi được sau khi tạo.">{(p) => <TextInput {...p} required maxLength={10} disabled={disabled || keyReadOnly} readOnly={keyReadOnly} value={draft.key} onChange={(e) => onChange('key', e.target.value.toUpperCase())} className="w-40" />}</Field>
    <Field label="Mô tả" error={errors.description} hint={`Tối đa ${descriptionLimit} ký tự.`}>{(p) => <TextArea {...p} rows={4} maxLength={descriptionLimit} disabled={disabled} value={draft.description} onChange={(e) => onChange('description', e.target.value)} />}</Field>
  </>;
}

/**
 * Phần bảng/thẻ đã duyệt được tách khỏi DemoProvider. Caller cấp dữ liệu/quyền/link thật hoặc fixture.
 * Chỉ tìm/sort/đổi cách hiển thị tại đây; số liệu thiếu hiện dấu —, không bịa thành 0.
 */
export function ProjectsListView({ projects, onCreate, renderMenu, projectHref, extraLinks }: {
  projects: ProjectListItem[]; onCreate?: () => void; renderMenu: (project: ProjectListItem) => ReactNode;
  projectHref: (id: number) => string; extraLinks?: (project: ProjectListItem) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'table' | 'card'>('table');
  const q = query.trim().toLocaleLowerCase('vi');
  const visible = projects.filter((p) => !q || `${p.name} ${p.key}`.toLocaleLowerCase('vi').includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const create = onCreate ? <Btn variant="primary" onClick={onCreate}><Plus />Tạo dự án</Btn> : undefined;
  return <>
    <PageHeading title="Dự án" actions={create} />
    <div className="mb-4 flex flex-wrap items-center gap-2"><SearchInput value={query} onChange={setQuery} placeholder="Tìm theo tên hoặc mã" label="Tìm dự án" />
      <div className="ml-auto flex rounded-[3px] bg-[#091e420f] p-0.5" role="group" aria-label="Kiểu hiển thị">
        <Btn size="icon" variant={view === 'table' ? 'primary' : 'subtle'} aria-pressed={view === 'table'} aria-label="Dạng bảng" onClick={() => setView('table')}><List /></Btn>
        <Btn size="icon" variant={view === 'card' ? 'primary' : 'subtle'} aria-pressed={view === 'card'} aria-label="Dạng thẻ" onClick={() => setView('card')}><LayoutGrid /></Btn>
      </div>
    </div>
    {!projects.length ? <EmptyState title="Chưa có dự án" description={onCreate ? 'Tạo dự án mới hoặc nhờ trưởng dự án thêm bạn.' : 'Nhờ trưởng dự án thêm bạn vào dự án.'} action={create} />
      : !visible.length ? <EmptyState title="Không có dự án khớp" description={`Không tìm thấy dự án với "${query}".`} action={<Btn onClick={() => setQuery('')}>Xóa tìm kiếm</Btn>} />
        : view === 'table' ? <div className="relative overflow-x-auto"><table className={tableClass}><thead><tr>
          <th className={thClass}>Tên</th><th className={thClass}>Mã</th><th className={thClass}>Trưởng dự án</th><th className={cn(thClass, 'text-right')}>Thành viên</th><th className={cn(thClass, 'text-right')}>Công việc</th><th className={thClass}>Sprint đang chạy</th><th className={thClass}><span className="sr-only">Thao tác</span></th>
        </tr></thead><tbody>{visible.map((p) => <tr key={p.id} className="hover:bg-[#f4f5f7]">
          <td className={tdClass}><Link href={projectHref(p.id)} className="flex items-center gap-2 font-medium text-[#0052cc] hover:underline"><span className="grid size-6 shrink-0 place-items-center rounded-[3px] bg-[#0052cc] text-[10px] font-bold text-white">{p.key.slice(0, 2)}</span>{p.name}</Link></td>
          <td className={tdClass}>{p.key}</td><td className={tdClass}><span className="flex items-center gap-2"><Avatar name={p.leaderName} size={22} />{p.leaderName || 'Chưa có người phụ trách'}</span></td>
          <td className={cn(tdClass, 'text-right')}>{p.memberCount ?? '—'}</td><td className={cn(tdClass, 'text-right')}>{p.issueCount ?? '—'}</td><td className={tdClass}>{p.activeSprintName || <span className="text-[#6b778c]">—</span>}</td><td className={cn(tdClass, 'w-10')}>{renderMenu(p)}</td>
        </tr>)}</tbody></table></div>
          : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((p) => <div key={p.id} className="rounded-[3px] border border-[#dfe1e6] p-4 hover:shadow-[0_1px_2px_rgba(9,30,66,0.25)]">
            <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[3px] bg-[#0052cc] text-xs font-bold text-white">{p.key.slice(0, 2)}</span><div className="min-w-0 flex-1"><Link href={projectHref(p.id)} className="block truncate font-medium text-[#172b4d] hover:text-[#0052cc] hover:underline">{p.name}</Link><p className="text-xs text-[#6b778c]">{p.key} · {p.memberCount ?? '—'} thành viên · {p.issueCount ?? '—'} công việc</p></div>{renderMenu(p)}</div>
            <p className="mt-3 line-clamp-2 min-h-10 text-[13px] text-[#42526e]">{p.description || 'Chưa có mô tả.'}</p>{extraLinks && <div className="mt-3 flex gap-3 text-[13px]">{extraLinks(p)}</div>}
          </div>)}</div>}
  </>;
}
