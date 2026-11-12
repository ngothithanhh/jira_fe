'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Btn, Field, InlineAlert, Modal, TextInput } from '@/components/project-ui/kit';
import { ProjectFields, suggestProjectKey, type ProjectDraft, type ProjectListItem } from '@/components/project-ui/project-views';
import { completeConnectedMutation, connectedMutation } from '../client';
import { useSession } from '../session';
import { projectErrors, projectPayload, type ProjectDto } from './model';
import { useProjectMutationScope, useRefreshProjects } from './queries';

/** Form hiện có nhận callback API thật; giữ bản nháp khi trùng/lỗi mạng, chỉ điều hướng sau server xác nhận. */
export function CreateConnectedProject({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [draft, setDraft] = useState<ProjectDraft>({ name: '', key: '', description: '' });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshProjects();
  const { data: session } = useSession();
  const captureScope = useProjectMutationScope();
  const router = useRouter();
  const create = useMutation({ mutationFn: (current: () => boolean) => connectedMutation<ProjectDto>('projects/create', session!.user.userId, { method: 'POST', body: JSON.stringify(projectPayload(draft, true)) }, current), retry: false });

  /** Tên/key từ form, lead từ JWT ở BE; khóa submit trong lúc ghi để không tạo hai dự án do double-click. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const invalid = projectErrors(draft, true); setErrors(invalid);
    if (Object.keys(invalid).length) return;
    // Giữ khóa cả lúc invalidate cache, không chỉ thời gian fetch để double-click không tạo thêm project.
    submitting.current = true; setBusy(true);
    const current = captureScope();
    try {
      const project = await create.mutateAsync(current);
      if (!current()) return;
      await refresh();
      if (!current()) return;
      await completeConnectedMutation(session!.user.userId, current, () => {
        onOpenChange(false); toast.success(`Đã tạo dự án ${project.projectKey}`);
        router.push(`/app/projects/${project.projectId}/overview`);
      });
    } catch { /* Mutation giữ lỗi để form hiển thị và không mất nội dung người dùng đã nhập. */ }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Modal open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }} title="Tạo dự án" description="Tạo dự án rỗng để bắt đầu thiết lập nhóm và lập kế hoạch."
    footer={<><Btn variant="subtle" disabled={busy} onClick={() => onOpenChange(false)}>Hủy</Btn><Btn variant="primary" type="submit" form="connected-create-project" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo dự án'}</Btn></>}>
    <form id="connected-create-project" className="space-y-4" onSubmit={submit}>
      {create.isError && <InlineAlert tone="error">{create.error.message}</InlineAlert>}
      <ProjectFields draft={draft} errors={errors} disabled={busy} onChange={(field, value) => {
        if (field === 'key') setKeyTouched(true);
        setDraft((f) => ({ ...f, [field]: value, ...(field === 'name' && !keyTouched ? { key: suggestProjectKey(value) } : {}) }));
      }} />
    </form>
  </Modal>;
}

/** Xác nhận key trước DELETE đúng projectId; FK409 giữ dialog và dữ liệu, không giả xóa dây chuyền như fixture. */
export function DeleteConnectedProject({ project, onClose, onDeleted }: { project: ProjectListItem; onClose: () => void; onDeleted?: () => void }) {
  const [typed, setTyped] = useState('');
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshProjects();
  const { data: session } = useSession();
  const captureScope = useProjectMutationScope();
  const remove = useMutation({ mutationFn: (current: () => boolean) => connectedMutation<void>(`projects/${project.id}`, session!.user.userId, { method: 'DELETE' }, current), retry: false });

  /** Thành công mới xóa cache và rời trang; lỗi mạng không tự replay vì BE có thể đã xử lý DELETE. */
  async function confirm() {
    if (submitting.current || typed.trim() !== project.key) return;
    submitting.current = true; setBusy(true);
    const current = captureScope();
    try { await remove.mutateAsync(current); if (!current()) return; await refresh(project.id, true); if (!current()) return;
      await completeConnectedMutation(session!.user.userId, current, () => { onClose(); onDeleted?.(); toast.success(`Đã xóa dự án ${project.key}`); }); }
    catch { /* Giữ dialog và hiển thị lỗi BE, bao gồm project đang còn liên kết. */ }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Modal open onOpenChange={(v) => { if (!v && !busy) onClose(); }} title={`Xóa dự án ${project.key}?`} width={460}
    footer={<><Btn variant="subtle" disabled={busy} onClick={onClose}>Hủy</Btn><Btn variant="danger" disabled={busy || typed.trim() !== project.key} onClick={() => void confirm()}>{busy ? 'Đang xóa…' : 'Xóa dự án'}</Btn></>}>
    <div className="space-y-4"><p className="text-sm">Dự án còn công việc, thành viên khác chủ dự án, sprint hoặc bảng liên kết sẽ không xóa được. Thao tác không xóa dây chuyền các dữ liệu này.</p>
      {remove.isError && <InlineAlert tone="error">{remove.error.message}</InlineAlert>}
      <Field label={`Nhập ${project.key} để xác nhận`} required>{(p) => <TextInput {...p} autoFocus value={typed} disabled={busy} onChange={(e) => setTyped(e.target.value)} />}</Field>
    </div>
  </Modal>;
}
