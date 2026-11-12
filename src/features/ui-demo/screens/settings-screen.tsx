'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Btn, Card, EmptyState, Field, InlineAlert, PageHeading, SelectInput, TabBar, TextArea, TextInput } from '@/components/project-ui/kit';
import { Screen, routes, useCan, useProject } from '../common';
import { projectMembers, updateProject, userLabel } from '../logic';
import { useDemo } from '../provider';
import { DeleteProjectDialog } from './project-screens';
import { BoardsTab, ColumnsTab, TypesTab, WorkflowTab } from './settings-tabs';

type Tab = 'info' | 'types' | 'boards' | 'columns' | 'workflow';
const TABS: { value: Tab; label: string }[] = [
  { value: 'info', label: 'Thông tin' },
  { value: 'types', label: 'Loại công việc' },
  { value: 'boards', label: 'Bảng' },
  { value: 'columns', label: 'Cột & trạng thái' },
  { value: 'workflow', label: 'Workflow' },
];

/** Cài đặt dự án; tab lưu trên query ?tab= để link từ Board/Tổng quan mở đúng phần. */
export function SettingsScreen() {
  const project = useProject();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('tab');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'info';
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', next);
    if (next !== 'columns') q.delete('boardId');
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <Screen empty={<EmptyState title="Chưa có cấu hình" />}>
      <PageHeading title="Cài đặt dự án" breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Cài đặt' }]} />
      <TabBar label="Phần cài đặt" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'info' && <InfoTab />}
      {tab === 'types' && <TypesTab />}
      {tab === 'boards' && <BoardsTab onConfigure={(id) => router.replace(`${pathname}?tab=columns&boardId=${id}`, { scroll: false })} />}
      {tab === 'columns' && <ColumnsTab initialBoardId={Number(params.get('boardId')) || null} />}
      {tab === 'workflow' && <WorkflowTab />}
    </Screen>
  );
}

/** Tên/mô tả/trưởng dự án; key chỉ đọc vì là tiền tố mã công việc. Xóa nằm trong vùng nguy hiểm. */
function InfoTab() {
  const project = useProject();
  const { state, exec } = useDemo();
  const router = useRouter();
  const canEdit = useCan('EDIT_PROJECT', project.id);
  const canDelete = useCan('DELETE_PROJECT', project.id);
  const [form, setForm] = useState({ name: project.name, description: project.description, leadId: project.leadId });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = form.name !== project.name || form.description !== project.description || form.leadId !== project.leadId;
  return (
    <div className="max-w-2xl space-y-6">
      {!canEdit && <InlineAlert tone="info">Bạn chỉ được xem thông tin dự án.</InlineAlert>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = exec((s, c) => updateProject(s, c, project.id, form));
          setErrors(r.ok ? {} : (r.fieldErrors ?? { name: r.message }));
          setSaved(r.ok);
        }}
      >
        {saved && !dirty && <InlineAlert tone="success">Đã lưu thông tin dự án.</InlineAlert>}
        <Field label="Tên dự án" required error={errors.name}>
          {(p) => <TextInput {...p} maxLength={100} disabled={!canEdit} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />}
        </Field>
        <Field label="Mã dự án" hint="Không đổi được vì là tiền tố của mã công việc.">
          {(p) => <TextInput {...p} value={project.key} readOnly disabled className="w-40" />}
        </Field>
        <Field label="Mô tả" error={errors.description}>
          {(p) => <TextArea {...p} rows={4} disabled={!canEdit} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}
        </Field>
        <Field label="Trưởng dự án" error={errors.leadId} hint="Chọn trong số thành viên hiện tại.">
          {(p) => (
            <SelectInput {...p} disabled={!canEdit} value={form.leadId} onChange={(e) => setForm((f) => ({ ...f, leadId: Number(e.target.value) }))}>
              {projectMembers(state, project.id).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {userLabel(state, m.userId)}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {canEdit && (
          <div className="flex gap-2">
            <Btn type="submit" variant="primary" disabled={!dirty}>
              Lưu
            </Btn>
            <Btn variant="subtle" disabled={!dirty} onClick={() => (setForm({ name: project.name, description: project.description, leadId: project.leadId }), setErrors({}))}>
              Hủy
            </Btn>
          </div>
        )}
      </form>
      {canDelete && (
        <Card title="Vùng nguy hiểm">
          <p className="mb-3 text-sm text-[#42526e]">Xóa dự án sẽ bỏ toàn bộ công việc, sprint, bảng và thành viên của dự án khỏi dữ liệu mẫu.</p>
          <Btn variant="danger" onClick={() => setDeleting(true)}>
            Xóa dự án
          </Btn>
        </Card>
      )}
      {deleting && <DeleteProjectDialog project={project} open onOpenChange={setDeleting} onDeleted={() => router.push(routes.projects)} />}
    </div>
  );
}
