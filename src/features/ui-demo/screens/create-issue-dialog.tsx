'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Btn, Field, InlineAlert, Modal, SelectInput, TextArea, TextInput } from '@/components/project-ui/kit';
import { can, createIssue, findProject, PRIORITIES, PRIORITY_LABEL, projectIssues, projectMembers, projectSprints, projectTypes, userLabel, visibleProjects } from '../logic';
import { useDemo } from '../provider';
import type { Priority } from '../types';

/**
 * Form tạo công việc dùng chung cho nút "Tạo" ở header, Backlog và Board.
 * projectId cố định khi mở trong trang dự án; ngoài dự án thì cho chọn project mà persona có CREATE_ISSUE.
 * Lỗi validation hiện tại trường và giữ nguyên bản nháp; chỉ đóng khi tạo thành công.
 */
export function CreateIssueDialog({
  open,
  onOpenChange,
  projectId,
  sprintId = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: number;
  sprintId?: number | null;
  onCreated?: (issueId: number) => void;
}) {
  const { state, me, exec } = useDemo();
  const choices = useMemo(() => visibleProjects(state, me?.id).filter((p) => can(state, me?.id, 'CREATE_ISSUE', p.id)), [state, me]);
  const [pid, setPid] = useState<number | null>(projectId ?? null);
  const [draft, setDraft] = useState({ title: '', typeId: 0, priority: 'MEDIUM' as Priority, assigneeId: '', points: '', description: '', sprintId: '', parentId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  // Mở mới thì khởi tạo bản nháp theo project/sprint truyền vào và loại mặc định của project.
  useEffect(() => {
    if (!open) return;
    const initial = projectId ?? choices[0]?.id ?? null;
    setPid(initial);
    setDraft({
      title: '',
      typeId: initial ? (projectTypes(state, initial)[0]?.id ?? 0) : 0,
      priority: 'MEDIUM',
      assigneeId: '',
      points: '',
      description: '',
      sprintId: sprintId ? String(sprintId) : '',
      parentId: '',
    });
    setErrors({});
    setFormError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const project = pid ? findProject(state, pid) : undefined;
  const types = pid ? projectTypes(state, pid) : [];
  const members = pid ? projectMembers(state, pid) : [];
  const sprints = pid ? projectSprints(state, pid).filter((s) => s.state !== 'CLOSED') : [];
  const parents = pid ? projectIssues(state, pid) : [];
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    if (!pid) return;
    const points = draft.points.trim() === '' ? null : Number(draft.points);
    const result = exec((s, ctx) =>
      createIssue(s, ctx, pid, {
        title: draft.title,
        typeId: draft.typeId,
        priority: draft.priority,
        description: draft.description,
        assigneeId: draft.assigneeId ? Number(draft.assigneeId) : null,
        points: points !== null && Number.isNaN(points) ? -1 : points,
        sprintId: draft.sprintId ? Number(draft.sprintId) : null,
        parentId: draft.parentId ? Number(draft.parentId) : null,
      }),
    );
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setFormError(result.fieldErrors ? '' : result.message);
      return;
    }
    const created = result.state.issues.find((i) => i.id === result.entityId);
    toast.success(`Đã tạo ${created?.key ?? 'công việc'}`);
    onOpenChange(false);
    if (result.entityId) onCreated?.(result.entityId);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Tạo công việc"
      description={project ? `Dự án ${project.name} (${project.key})` : undefined}
      width={600}
      footer={
        <>
          <Btn variant="subtle" onClick={() => onOpenChange(false)}>
            Hủy
          </Btn>
          <Btn variant="primary" form="create-issue-form" type="submit" disabled={!pid || !types.length}>
            Tạo
          </Btn>
        </>
      }
    >
      <form
        id="create-issue-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {!choices.length && !projectId && <InlineAlert tone="warning">Bạn chưa có dự án nào được phép tạo công việc.</InlineAlert>}
        {projectId === undefined && choices.length > 0 && (
          <Field label="Dự án" required>
            {(p) => (
              <SelectInput
                {...p}
                value={pid ?? ''}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPid(next);
                  set({ typeId: projectTypes(state, next)[0]?.id ?? 0, assigneeId: '', sprintId: '', parentId: '' });
                }}
              >
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.key})
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        {pid && !types.length && <InlineAlert tone="warning">Dự án chưa có loại công việc. Vào Cài đặt dự án → Loại công việc để gán trước.</InlineAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loại công việc" required error={errors.typeId}>
            {(p) => (
              <SelectInput {...p} value={draft.typeId} onChange={(e) => set({ typeId: Number(e.target.value) })}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? ' (mặc định)' : ''}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Ưu tiên" error={errors.priority}>
            {(p) => (
              <SelectInput {...p} value={draft.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABEL[value]}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
        <Field label="Tiêu đề" required error={errors.title}>
          {(p) => <TextInput {...p} autoFocus maxLength={255} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Cần hoàn thành điều gì?" />}
        </Field>
        <Field label="Mô tả" error={errors.description}>
          {(p) => <TextArea {...p} rows={4} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Người phụ trách" error={errors.assigneeId}>
            {(p) => (
              <SelectInput {...p} value={draft.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
                <option value="">Chưa phân công</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {userLabel(state, m.userId)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Story points" error={errors.points} hint="Để trống nếu chưa ước lượng.">
            {(p) => <TextInput {...p} inputMode="numeric" value={draft.points} onChange={(e) => set({ points: e.target.value })} />}
          </Field>
          <Field label="Sprint">
            {(p) => (
              <SelectInput {...p} value={draft.sprintId} onChange={(e) => set({ sprintId: e.target.value })}>
                <option value="">Product backlog</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.state === 'ACTIVE' ? ' (đang diễn ra)' : ''}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Công việc cha" error={errors.parentId}>
            {(p) => (
              <SelectInput {...p} value={draft.parentId} onChange={(e) => set({ parentId: e.target.value })}>
                <option value="">Không có</option>
                {parents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.key} · {i.title.slice(0, 60)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </form>
    </Modal>
  );
}
