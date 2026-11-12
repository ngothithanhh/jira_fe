'use client';

import { useState } from 'react';
import { Btn, Field, InlineAlert, Modal, TextInput, TextArea } from '@/components/project-ui/kit';
import type { PlanningSprint } from '@/features/backlog/types';
import { localSprintTime, sprintPatch, validateSprintDates, type SprintPatch } from './sprint-contract';

export type SprintDialogSelection = { sprint: PlanningSprint; operation: 'edit' | 'delete' };

function draftFrom(sprint: PlanningSprint) {
  return {
    sprintName: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate?.slice(0, 19) ?? '',
    endDate: sprint.endDate?.slice(0, 19) ?? '',
  };
}

export function SprintDialog({ selection, busy, blocked, uncertain, error, close, retry, save }: {
  selection: SprintDialogSelection;
  busy: boolean;
  blocked: boolean;
  uncertain: boolean;
  error: string;
  close: () => void;
  retry: () => void;
  save: (patch?: SprintPatch) => void;
}) {
  const { sprint, operation } = selection;
  const [draft, setDraft] = useState(() => draftFrom(sprint));
  const [validation, setValidation] = useState('');
  const deleting = operation === 'delete';
  const disabled = busy || blocked || uncertain;
  const change = (field: keyof typeof draft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setValidation('');
  };

  /** Gửi phần người dùng đã sửa. Giữ cả độ chính xác của ngày gốc khi người dùng chỉ sửa metadata khác. */
  function submit() {
    if (disabled) return;
    if (deleting) { save(); return; }
    const original = draftFrom(sprint);
    const changes: SprintPatch = {};
    try {
      if (!draft.sprintName.trim()) throw new Error('Nhập tên sprint.');
      if (draft.sprintName.trim() !== original.sprintName) changes.sprintName = draft.sprintName;
      if (draft.goal !== original.goal) changes.goal = draft.goal;
      if (sprint.state === 'FUTURE') {
        for (const field of ['startDate', 'endDate'] as const) {
          if (!draft[field] && original[field]) throw new Error('Chưa thể bỏ ngày đã lưu. Hãy giữ nguyên hoặc chọn ngày khác.');
          if (draft[field] && (!original[field] || localSprintTime(draft[field]) !== localSprintTime(original[field]))) changes[field] = draft[field];
        }
      }
      if (!Object.keys(changes).length) throw new Error('Chưa có thay đổi để lưu.');
      const patch = sprintPatch(changes);
      validateSprintDates(patch.startDate ?? sprint.startDate, patch.endDate ?? sprint.endDate);
      save(patch);
    } catch (failure) {
      setValidation(failure instanceof Error ? failure.message : 'Dữ liệu sprint không hợp lệ.');
    }
  }

  return (
    <Modal open title={deleting ? 'Xóa sprint' : 'Sửa sprint'} onOpenChange={(open) => { if (!open && !busy) close(); }}
      description={deleting ? `Xóa “${sprint.name}”? Công việc được giữ lại. Công việc đủ điều kiện sẽ trở về Backlog.` : undefined}
      footer={<>
        <Btn disabled={busy} onClick={close}>Hủy</Btn>
        <Btn type="submit" form="manage-sprint" disabled={disabled} variant={deleting ? 'danger' : 'primary'}>
          {busy ? 'Đang xử lý…' : deleting ? 'Xác nhận xóa sprint' : 'Lưu sprint'}
        </Btn>
      </>}>
      <form id="manage-sprint" className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {(error || validation) && <InlineAlert tone="error">{validation || error}</InlineAlert>}
        {blocked && !uncertain && <InlineAlert tone="warning">Kiểm tra lại quyền và trạng thái sprint trước khi tiếp tục.{' '}
          <Btn disabled={busy} onClick={retry}>Tải lại dữ liệu sprint</Btn>
        </InlineAlert>}
        {!deleting && <>
          <Field label="Tên sprint" required>{(props) => <TextInput {...props} required maxLength={100} disabled={busy || uncertain} value={draft.sprintName} onChange={(event) => change('sprintName', event.target.value)} />}</Field>
          <Field label="Mục tiêu sprint">{(props) => <TextArea {...props} maxLength={255} disabled={busy || uncertain} value={draft.goal} onChange={(event) => change('goal', event.target.value)} />}</Field>
          {sprint.state === 'FUTURE' && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngày bắt đầu">{(props) => <TextInput {...props} type="datetime-local" step="any" disabled={busy || uncertain} value={draft.startDate} onChange={(event) => change('startDate', event.target.value)} />}</Field>
            <Field label="Ngày kết thúc">{(props) => <TextInput {...props} type="datetime-local" step="any" disabled={busy || uncertain} value={draft.endDate} onChange={(event) => change('endDate', event.target.value)} />}</Field>
          </div>}
        </>}
      </form>
    </Modal>
  );
}
