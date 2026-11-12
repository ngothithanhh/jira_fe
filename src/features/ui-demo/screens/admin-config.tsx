'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, ConfirmDialog, Field, InlineAlert, Modal, PageHeading, SelectInput, StatusLozenge, TextInput, TypeIcon, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { routes } from '../common';
import {
  CATEGORY_LABEL,
  addWorkflowRule,
  createIssueType,
  createRole,
  createStatus,
  deleteIssueType,
  deleteRole,
  deleteStatus,
  findStatus,
  removeWorkflowRule,
  setRolePermissions,
  updateIssueType,
  updateRole,
  updateStatus,
  type IssueTypeInput,
  type StatusInput,
} from '../logic';
import { useDemo } from '../provider';
import type { ActionResult, DemoRole, IssueTypeIcon, PermissionCode, RoleScope, StatusCategory } from '../types';
import { AdminGuard } from './admin-screens';

/** Ma trận role × quyền: sửa trên bản nháp, Lưu ghi từng role đã đổi; SYSTEM_ADMIN dành riêng luôn đủ quyền. */
export function AdminRolesScreen() {
  const { state, act } = useDemo();
  const saved = () => Object.fromEntries(state.roles.map((r) => [r.id, state.rolePermissions.filter((rp) => rp.roleId === r.id).map((rp) => rp.code)]));
  const [draft, setDraft] = useState<Record<number, PermissionCode[]>>(saved);
  const [editing, setEditing] = useState<DemoRole | 'new' | null>(null);
  const [removing, setRemoving] = useState<DemoRole | null>(null);
  const base = saved();
  const changed = state.roles.filter((r) => {
    const a = draft[r.id] ?? [];
    const b = base[r.id] ?? [];
    return a.length !== b.length || a.some((c) => !b.includes(c));
  });
  const toggle = (roleId: number, code: PermissionCode) =>
    setDraft((d) => {
      const list = d[roleId] ?? [];
      return { ...d, [roleId]: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] };
    });
  const used = (id: number) => state.userRoles.filter((a) => a.roleId === id).length + state.memberships.filter((m) => m.roleId === id).length;
  return (
    <AdminGuard perm="MANAGE_CONFIG">
      <PageHeading
        title="Vai trò & quyền"
        breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Vai trò & quyền' }]}
        description="Role HỆ THỐNG gán ở trang Người dùng; role DỰ ÁN gán ở trang Thành viên của từng dự án."
        actions={
          <Btn variant="primary" onClick={() => setEditing('new')}>
            <Plus /> Tạo role
          </Btn>
        }
      />
      <div className="relative mb-6 overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Role</th>
              <th className={thClass}>Phạm vi</th>
              <th className={thClass}>Mô tả</th>
              <th className={thClass}>Lượt gán</th>
              <th className={thClass}>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {state.roles.map((r) => (
              <tr key={r.id}>
                <td className={tdClass}>
                  <span className="font-medium">{r.name}</span>
                  {r.reserved && <span className="ml-2 text-[11px] text-[#974f0c]">dành riêng</span>}
                </td>
                <td className={tdClass}>{r.scope === 'GLOBAL' ? 'Hệ thống' : 'Dự án'}</td>
                <td className={tdClass}>{r.description}</td>
                <td className={tdClass}>{used(r.id)}</td>
                <td className={tdClass}>
                  <span className="flex gap-1">
                    <Btn size="icon" variant="subtle" aria-label={`Sửa ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Btn>
                    <Btn size="icon" variant="subtle" aria-label={`Xóa ${r.name}`} onClick={() => setRemoving(r)}>
                      <Trash2 />
                    </Btn>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 text-sm font-semibold">Ma trận quyền</h2>
      <div className="relative overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Quyền</th>
              {state.roles.map((r) => (
                <th key={r.id} className={`${thClass} text-center`}>
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.permissions.map((p) => (
              <tr key={p.code}>
                <td className={tdClass}>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-[#6b778c]">{p.description}</span>
                </td>
                {state.roles.map((r) => (
                  <td key={r.id} className={`${tdClass} text-center`}>
                    <input
                      type="checkbox"
                      aria-label={`${r.name}: ${p.name}`}
                      disabled={r.reserved}
                      checked={(draft[r.id] ?? []).includes(p.code)}
                      onChange={() => toggle(r.id, p.code)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-[#ebecf0] bg-white py-3">
        <span className="mr-auto text-xs text-[#6b778c]">{changed.length ? `${changed.length} role có thay đổi chưa lưu` : 'Không có thay đổi'}</span>
        <Btn variant="subtle" disabled={!changed.length} onClick={() => setDraft(base)}>
          Hủy
        </Btn>
        <Btn
          variant="primary"
          disabled={!changed.length}
          onClick={() => {
            const failed = changed.map((r) => act((s, c) => setRolePermissions(s, c, r.id, draft[r.id] ?? []))).filter((x) => !x.ok);
            if (!failed.length) toast.success('Đã lưu ma trận quyền');
          }}
        >
          Lưu quyền
        </Btn>
      </div>
      {editing && <RoleDialog role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(id, isNew) => isNew && setDraft((d) => ({ ...d, [id]: [] }))} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Xóa role ${removing?.name ?? ''}?`}
        description="Chỉ xóa được role chưa gán cho ai và không phải role hệ thống cố định."
        confirmLabel="Xóa role"
        onConfirm={() => (removing ? act((s, c) => deleteRole(s, c, removing.id), 'Đã xóa role').ok : false)}
      />
    </AdminGuard>
  );
}

function RoleDialog({ role, onClose, onSaved }: { role: DemoRole | null; onClose: () => void; onSaved: (id: number, isNew: boolean) => void }) {
  const { exec } = useDemo();
  const [form, setForm] = useState({ name: role?.name ?? '', description: role?.description ?? '', scope: (role?.scope ?? 'PROJECT') as RoleScope });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const save = () => {
    const r = exec((s, c) => (role ? updateRole(s, c, role.id, form) : createRole(s, c, form)));
    if (!r.ok) return (setErrors(r.fieldErrors ?? {}), setError(r.fieldErrors ? '' : r.message));
    onSaved(r.entityId ?? 0, !role);
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={role ? `Sửa ${role.name}` : 'Tạo role'} width={460} footer={<><Btn variant="subtle" onClick={onClose}>Hủy</Btn><Btn variant="primary" onClick={save}>Lưu</Btn></>}>
      <div className="space-y-4">
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <Field label="Tên role" required error={errors.name} hint="IN HOA, số hoặc gạch dưới, ví dụ QA_LEAD.">
          {(p) => <TextInput {...p} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} />}
        </Field>
        <Field label="Phạm vi">
          {(p) => (
            <SelectInput {...p} disabled={!!role} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as RoleScope }))}>
              <option value="PROJECT">Dự án (gán ở trang Thành viên)</option>
              <option value="GLOBAL">Hệ thống (gán ở trang Người dùng)</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Mô tả">{(p) => <TextInput {...p} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}</Field>
      </div>
    </Modal>
  );
}

/** Dialog chung cho CRUD danh mục; onSave trả ActionResult để hiện lỗi đúng trường và giữ bản nháp. */
function CatalogDialog<T extends Record<string, string>>({
  title,
  initial,
  fields,
  onClose,
  onSave,
}: {
  title: string;
  initial: T;
  fields: { key: keyof T & string; label: string; options?: { value: string; label: string }[]; type?: string }[];
  onClose: () => void;
  onSave: (value: T) => ActionResult;
}) {
  const [form, setForm] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const r = onSave(form);
    if (r.ok) onClose();
    else setErrors(r.fieldErrors ?? { [fields[0].key]: r.message });
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={title} width={460} footer={<><Btn variant="subtle" onClick={onClose}>Hủy</Btn><Btn variant="primary" onClick={save}>Lưu</Btn></>}>
      <div className="space-y-4">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} error={errors[f.key]}>
            {(p) =>
              f.options ? (
                <SelectInput {...p} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <TextInput {...p} type={f.type ?? 'text'} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} className={f.type === 'color' ? 'h-9 w-20 p-1' : undefined} />
              )
            }
          </Field>
        ))}
      </div>
    </Modal>
  );
}

const ICONS: { value: IssueTypeIcon; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'subtask', label: 'Sub-task' },
];

/** Danh mục loại công việc toàn hệ thống; xóa bị chặn khi còn công việc hoặc dự án đang dùng. */
export function AdminIssueTypesScreen() {
  const { state, act } = useDemo();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const target = typeof editing === 'number' ? state.issueTypes.find((t) => t.id === editing) : undefined;
  return (
    <AdminGuard perm="MANAGE_CONFIG">
      <PageHeading title="Loại công việc" breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Loại công việc' }]} actions={<Btn variant="primary" onClick={() => setEditing('new')}><Plus /> Tạo loại</Btn>} />
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Loại</th>
            <th className={thClass}>Mô tả</th>
            <th className={thClass}>Công việc</th>
            <th className={thClass}>Dự án dùng</th>
            <th className={thClass}><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {state.issueTypes.map((t) => (
            <tr key={t.id}>
              <td className={tdClass}><span className="flex items-center gap-2"><TypeIcon icon={t.icon} name={t.name} color={t.color} /> <span className="font-medium">{t.name}</span></span></td>
              <td className={tdClass}>{t.description}</td>
              <td className={tdClass}>{state.issues.filter((i) => i.typeId === t.id).length}</td>
              <td className={tdClass}>{state.projectIssueTypes.filter((pt) => pt.typeId === t.id).length}</td>
              <td className={tdClass}>
                <span className="flex gap-1">
                  <Btn size="icon" variant="subtle" aria-label={`Sửa ${t.name}`} onClick={() => setEditing(t.id)}><Pencil /></Btn>
                  <Btn size="icon" variant="subtle" aria-label={`Xóa ${t.name}`} onClick={() => setRemoving(t.id)}><Trash2 /></Btn>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing !== null && (
        <CatalogDialog<IssueTypeInput & Record<string, string>>
          title={target ? `Sửa ${target.name}` : 'Tạo loại công việc'}
          initial={{ name: target?.name ?? '', description: target?.description ?? '', icon: target?.icon ?? 'task', color: target?.color ?? '#4c9aff' }}
          fields={[{ key: 'name', label: 'Tên' }, { key: 'description', label: 'Mô tả' }, { key: 'icon', label: 'Biểu tượng', options: ICONS }, { key: 'color', label: 'Màu', type: 'color' }]}
          onClose={() => setEditing(null)}
          onSave={(v) => act((s, c) => (target ? updateIssueType(s, c, target.id, v) : createIssueType(s, c, v)), 'Đã lưu loại công việc')}
        />
      )}
      <ConfirmDialog open={removing !== null} onOpenChange={(v) => !v && setRemoving(null)} title="Xóa loại công việc?" description="Chỉ xóa được loại chưa gán cho dự án và chưa có công việc." confirmLabel="Xóa" onConfirm={() => (removing !== null ? act((s, c) => deleteIssueType(s, c, removing), 'Đã xóa loại').ok : false)} />
    </AdminGuard>
  );
}

const CATEGORIES = (['TO_DO', 'IN_PROGRESS', 'DONE'] as StatusCategory[]).map((v) => ({ value: v, label: CATEGORY_LABEL[v] }));

/** Trạng thái: nhóm (category) quyết định "hoàn thành", không dựa vào tên. Xóa bị chặn khi còn công việc dùng. */
export function AdminStatusesScreen() {
  const { state, act } = useDemo();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const target = typeof editing === 'number' ? state.statuses.find((s) => s.id === editing) : undefined;
  return (
    <AdminGuard perm="MANAGE_CONFIG">
      <PageHeading title="Trạng thái" breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Trạng thái' }]} actions={<Btn variant="primary" onClick={() => setEditing('new')}><Plus /> Tạo trạng thái</Btn>} />
      <InlineAlert tone="info">Đổi nhóm trạng thái ảnh hưởng ngay tới backlog và báo cáo, vì “hoàn thành” được xác định bằng nhóm Hoàn thành.</InlineAlert>
      <table className={`${tableClass} mt-3`}>
        <thead>
          <tr>
            <th className={thClass}>Trạng thái</th>
            <th className={thClass}>Nhóm</th>
            <th className={thClass}>Công việc</th>
            <th className={thClass}>Cột đang map</th>
            <th className={thClass}><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {state.statuses.map((st) => (
            <tr key={st.id}>
              <td className={tdClass}><StatusLozenge name={st.name} category={st.category} /></td>
              <td className={tdClass}>{CATEGORY_LABEL[st.category]}</td>
              <td className={tdClass}>{state.issues.filter((i) => i.statusId === st.id).length}</td>
              <td className={tdClass}>{state.columnStatuses.filter((m) => m.statusId === st.id).length}</td>
              <td className={tdClass}>
                <span className="flex gap-1">
                  <Btn size="icon" variant="subtle" aria-label={`Sửa ${st.name}`} onClick={() => setEditing(st.id)}><Pencil /></Btn>
                  <Btn size="icon" variant="subtle" aria-label={`Xóa ${st.name}`} onClick={() => setRemoving(st.id)}><Trash2 /></Btn>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing !== null && (
        <CatalogDialog<StatusInput & Record<string, string>>
          title={target ? `Sửa ${target.name}` : 'Tạo trạng thái'}
          initial={{ name: target?.name ?? '', category: target?.category ?? 'TO_DO', color: target?.color ?? '#42526e' }}
          fields={[{ key: 'name', label: 'Tên' }, { key: 'category', label: 'Nhóm', options: CATEGORIES }, { key: 'color', label: 'Màu', type: 'color' }]}
          onClose={() => setEditing(null)}
          onSave={(v) => act((s, c) => (target ? updateStatus(s, c, target.id, v) : createStatus(s, c, v)), 'Đã lưu trạng thái')}
        />
      )}
      <ConfirmDialog open={removing !== null} onOpenChange={(v) => !v && setRemoving(null)} title="Xóa trạng thái?" description="Chỉ xóa được trạng thái không còn công việc. Ánh xạ cột và cạnh workflow liên quan sẽ bị gỡ." confirmLabel="Xóa" onConfirm={() => (removing !== null ? act((s, c) => deleteStatus(s, c, removing), 'Đã xóa trạng thái').ok : false)} />
    </AdminGuard>
  );
}

/** Workflow: thêm/xóa cạnh from→to, không trùng; xem trước các chuyển hợp lệ theo từng trạng thái. */
export function AdminWorkflowsScreen() {
  const { state, act } = useDemo();
  const [from, setFrom] = useState(state.statuses[0]?.id ?? 0);
  const [to, setTo] = useState(state.statuses[1]?.id ?? 0);
  return (
    <AdminGuard perm="MANAGE_CONFIG">
      <PageHeading title="Workflow" breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Workflow' }]} description="Áp dụng cho mọi dự án. Chuyển trạng thái chỉ hợp lệ khi có cạnh tương ứng." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Từ trạng thái">{(p) => <SelectInput {...p} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="w-48">{state.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>}</Field>
        <Field label="Sang trạng thái">{(p) => <SelectInput {...p} value={to} onChange={(e) => setTo(Number(e.target.value))} className="w-48">{state.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>}</Field>
        <Btn variant="primary" size="md" onClick={() => act((s, c) => addWorkflowRule(s, c, from, to), 'Đã thêm cạnh chuyển')}><Plus /> Thêm cạnh</Btn>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <table className={tableClass}>
          <thead><tr><th className={thClass}>Từ</th><th className={thClass}>Sang</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>
            {state.workflowRules.map((r) => {
              const a = findStatus(state, r.fromStatusId), b = findStatus(state, r.toStatusId);
              return (
                <tr key={r.id}>
                  <td className={tdClass}>{a && <StatusLozenge name={a.name} category={a.category} />}</td>
                  <td className={tdClass}>{b && <StatusLozenge name={b.name} category={b.category} />}</td>
                  <td className={tdClass}><Btn size="icon" variant="subtle" aria-label={`Xóa cạnh ${a?.name} sang ${b?.name}`} onClick={() => act((s, c) => removeWorkflowRule(s, c, r.id), 'Đã xóa cạnh')}><Trash2 /></Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="space-y-2 rounded-[3px] border border-[#dfe1e6] p-3">
          <h2 className="text-sm font-semibold">Xem trước</h2>
          {state.statuses.map((st) => (
            <div key={st.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusLozenge name={st.name} category={st.category} /> <span className="text-[#6b778c]">→</span>
              {state.workflowRules.filter((r) => r.fromStatusId === st.id).map((r) => { const t = findStatus(state, r.toStatusId); return t && <StatusLozenge key={r.id} name={t.name} category={t.category} />; })}
              {!state.workflowRules.some((r) => r.fromStatusId === st.id) && <span className="text-[#6b778c]">không chuyển được</span>}
            </div>
          ))}
        </div>
      </div>
    </AdminGuard>
  );
}
