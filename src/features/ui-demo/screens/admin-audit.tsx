'use client';

import { useState } from 'react';
import { Btn, EmptyState, Field, Modal, PageHeading, Pagination, SelectInput, TextInput, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { routes } from '../common';
import { auditQuery, findProject, userLabel, type AuditFilters } from '../logic';
import { useDemo } from '../provider';
import type { AuditEvent } from '../types';
import { AdminGuard } from './admin-screens';

/** Nhật ký: lọc bằng selector (không nhập ID dạng chữ), sắp createdAt giảm dần + ID, phân trang; actor null là Hệ thống. */
export function AdminAuditScreen() {
  const { state } = useDemo();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [detail, setDetail] = useState<AuditEvent | null>(null);
  const result = auditQuery(state, filters, page, size);
  const entityTypes = [...new Set(state.auditEvents.map((e) => e.entityType))].sort();
  const actions = [...new Set(state.auditEvents.map((e) => e.action))].sort();
  const actors = [...new Set(state.auditEvents.map((e) => e.actorId).filter((x): x is number => x !== null))];
  const set = (patch: AuditFilters) => (setFilters((f) => ({ ...f, ...patch })), setPage(1));
  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  return (
    <AdminGuard perm="VIEW_AUDIT">
      <PageHeading title="Nhật ký" breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Nhật ký' }]} />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Loại đối tượng">{(p) => <SelectInput {...p} value={filters.entityType ?? ''} onChange={(e) => set({ entityType: e.target.value || undefined })} className="w-40"><option value="">Tất cả</option>{entityTypes.map((t) => <option key={t}>{t}</option>)}</SelectInput>}</Field>
        <Field label="Hành động">{(p) => <SelectInput {...p} value={filters.action ?? ''} onChange={(e) => set({ action: e.target.value || undefined })} className="w-56"><option value="">Tất cả</option>{actions.map((a) => <option key={a}>{a}</option>)}</SelectInput>}</Field>
        <Field label="Người thực hiện">
          {(p) => (
            <SelectInput {...p} value={filters.actor ?? ''} onChange={(e) => set({ actor: e.target.value === '' ? null : e.target.value === 'system' ? 'system' : Number(e.target.value) })} className="w-48">
              <option value="">Tất cả</option>
              <option value="system">Hệ thống</option>
              {actors.map((id) => <option key={id} value={id}>{userLabel(state, id)}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Từ ngày">{(p) => <TextInput {...p} type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="w-40" />}</Field>
        <Field label="Đến ngày" error={invalidRange ? 'Phải sau ngày bắt đầu.' : undefined}>{(p) => <TextInput {...p} type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="w-40" />}</Field>
        {Object.values(filters).some((v) => v !== undefined && v !== null) && <Btn variant="link" onClick={() => set({ entityType: undefined, action: undefined, actor: null, from: undefined, to: undefined })}>Xóa bộ lọc</Btn>}
      </div>
      {invalidRange ? (
        <EmptyState title="Khoảng ngày không hợp lệ" description="Ngày kết thúc phải sau hoặc bằng ngày bắt đầu." />
      ) : !result.totalItems ? (
        <EmptyState title="Không có bản ghi khớp bộ lọc" />
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className={tableClass}>
              <thead><tr><th className={thClass}>Thời điểm</th><th className={thClass}>Người thực hiện</th><th className={thClass}>Hành động</th><th className={thClass}>Đối tượng</th><th className={thClass}>Chi tiết</th></tr></thead>
              <tbody>
                {result.items.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-[#f4f5f7]" onClick={() => setDetail(e)}>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDate(e.createdAt, true)}</td>
                    <td className={tdClass}>{e.actorId === null ? <span className="text-[#6b778c]">Hệ thống</span> : userLabel(state, e.actorId)}</td>
                    <td className={tdClass}><span className="rounded-[3px] bg-[#f4f5f7] px-1.5 text-[11px] font-semibold">{e.action}</span></td>
                    <td className={tdClass}>{e.entityType} #{e.entityId}</td>
                    <td className={tdClass}><button className="text-left hover:text-[#0052cc] hover:underline" onClick={() => setDetail(e)}>{e.detail}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} totalItems={result.totalItems} size={size} onPage={setPage} onSize={(s) => (setSize(s), setPage(1))} />
        </>
      )}
      {detail && (
        <Modal open onOpenChange={(v) => !v && setDetail(null)} title={`Bản ghi #${detail.id}`} width={480}>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 pb-2 text-sm">
            <dt className="text-[#6b778c]">Thời điểm</dt><dd>{formatDate(detail.createdAt, true)}</dd>
            <dt className="text-[#6b778c]">Người thực hiện</dt><dd>{detail.actorId === null ? 'Hệ thống' : userLabel(state, detail.actorId)}</dd>
            <dt className="text-[#6b778c]">Hành động</dt><dd>{detail.action}</dd>
            <dt className="text-[#6b778c]">Đối tượng</dt><dd>{detail.entityType} #{detail.entityId}</dd>
            <dt className="text-[#6b778c]">Dự án</dt><dd>{detail.projectId ? (findProject(state, detail.projectId)?.name ?? `#${detail.projectId} (đã xóa)`) : '—'}</dd>
            <dt className="text-[#6b778c]">Nội dung</dt><dd>{detail.detail}</dd>
          </dl>
        </Modal>
      )}
    </AdminGuard>
  );
}
