'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Btn, ConfirmDialog, InlineAlert, Modal, TextArea, formatBytes, formatDate } from '@/components/project-ui/kit';
import { addAttachment, addComment, can, canManageComment, deleteComment, editComment, findUser, MAX_ATTACHMENT_BYTES, removeAttachment, userLabel } from '../logic';
import { useDemo } from '../provider';
import type { DemoAttachment, DemoIssue } from '../types';

/** Bình luận dạng văn bản thuần; chủ comment hoặc người có EDIT_ISSUE mới thấy sửa/xóa. */
export function CommentsSection({ issue }: { issue: DemoIssue }) {
  const { state, me, act } = useDemo();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string; version: number } | null>(null);
  const [removing, setRemoving] = useState<{ id: number; version: number } | null>(null);
  const comments = state.comments.filter((c) => c.issueId === issue.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  return (
    <div className="space-y-4">
      <form
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (act((s, c) => addComment(s, c, issue.id, text), 'Đã thêm bình luận').ok) setText('');
        }}
      >
        <Avatar name={me?.fullName ?? null} src={me?.avatarUrl} size={32} />
        <div className="flex-1 space-y-2">
          <TextArea aria-label="Thêm bình luận" rows={2} maxLength={10000} placeholder="Thêm bình luận…" value={text} onChange={(e) => setText(e.target.value)} />
          {text && (
            <div className="flex gap-2">
              <Btn type="submit" variant="primary" disabled={!text.trim()}>
                Lưu
              </Btn>
              <Btn variant="subtle" onClick={() => setText('')}>
                Hủy
              </Btn>
            </div>
          )}
        </div>
      </form>
      {!comments.length && <p className="text-[13px] text-[#6b778c]">Chưa có bình luận.</p>}
      <ul className="space-y-4">
        {comments.map((c) => {
          const author = findUser(state, c.authorId);
          const mine = canManageComment(state, me?.id, c.authorId, issue.projectId);
          return (
            <li key={c.id} className="flex gap-3">
              <Avatar name={author?.fullName ?? '?'} src={author?.avatarUrl} size={32} title={author?.fullName ?? 'Người dùng không còn tồn tại'} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  <span className="font-semibold">{c.authorId === null ? 'Người dùng không còn tồn tại' : userLabel(state, c.authorId)}</span>
                  <span className="ml-2 text-xs text-[#6b778c]">{formatDate(c.createdAt, true)}</span>
                  {c.updatedAt && <span className="ml-1 text-xs text-[#6b778c]">· đã chỉnh sửa</span>}
                </p>
                {editing?.id === c.id ? (
                  <form
                    className="mt-1 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (act((s, ctx) => editComment(s, ctx, c.id, editing.text, editing.version), 'Đã sửa bình luận').ok) setEditing(null);
                    }}
                  >
                    <TextArea aria-label="Sửa bình luận" rows={3} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} autoFocus />
                    <div className="flex gap-2">
                      <Btn type="submit" variant="primary" disabled={!editing.text.trim()}>
                        Lưu
                      </Btn>
                      <Btn variant="subtle" onClick={() => setEditing(null)}>
                        Hủy
                      </Btn>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#172b4d]">{c.text}</p>
                    {mine && (
                      <div className="mt-1 flex gap-3 text-xs">
                        <button className="font-medium text-[#6b778c] hover:text-[#0052cc] hover:underline" onClick={() => setEditing({ id: c.id, text: c.text, version: c.version })}>
                          Sửa
                        </button>
                        <button className="font-medium text-[#6b778c] hover:text-[#de350b] hover:underline" onClick={() => setRemoving({ id: c.id, version: c.version })}>
                          Xóa
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Xóa bình luận?"
        description="Bình luận sẽ bị xóa khỏi công việc. Thao tác không thể hoàn tác."
        confirmLabel="Xóa"
        onConfirm={() => (removing ? act((s, c) => deleteComment(s, c, removing.id, removing.version), 'Đã xóa bình luận').ok : false)}
      />
    </div>
  );
}

// Chỉ xem trước ảnh raster; SVG/HTML do người dùng chọn hiển thị dạng văn bản, không thực thi.
const RASTER = /^image\/(png|jpe?g|gif|webp|bmp)$/;
const TEXTUAL = /^(text\/|application\/(json|xml)|image\/svg\+xml)/;

/** Tệp đính kèm cục bộ: Object URL tạo khi chọn, provider thu hồi khi xóa/reset; không tải lên máy chủ. */
export function AttachmentsSection({ issue }: { issue: DemoIssue }) {
  const { state, me, act } = useDemo();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DemoAttachment | null>(null);
  const [removing, setRemoving] = useState<DemoAttachment | null>(null);
  const files = state.attachments.filter((a) => a.issueId === issue.id);
  const canUpload = can(state, me?.id, 'EDIT_ISSUE', issue.projectId);

  function choose(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`"${file.name}" vượt quá giới hạn 10 MB của bản mẫu.`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const result = act((s, c) => addAttachment(s, c, issue.id, { name: file.name, size: file.size, mime: file.type || 'application/octet-stream', objectUrl: url, sampleText: null }), `Đã đính kèm ${file.name}`);
      // Không lưu vào state thì thu hồi ngay để không rò Object URL.
      if (!result.ok) URL.revokeObjectURL(url);
    }
    if (input.current) input.current.value = '';
  }

  function download(file: DemoAttachment) {
    const url = file.objectUrl ?? URL.createObjectURL(new Blob([file.sampleText ?? ''], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    if (!file.objectUrl) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple className="sr-only" aria-label="Chọn tệp đính kèm" onChange={(e) => choose(e.target.files)} tabIndex={-1} />
        <Btn onClick={() => input.current?.click()} disabled={!canUpload}>
          <Paperclip /> Chọn tệp
        </Btn>
        <span className="text-xs text-[#6b778c]">Tệp cục bộ của bản mẫu, tối đa 10 MB/tệp, không gửi lên máy chủ.</span>
      </div>
      {!files.length ? (
        <p className="text-[13px] text-[#6b778c]">Chưa có tệp đính kèm.</p>
      ) : (
        <ul className="divide-y divide-[#ebecf0] rounded-[3px] border border-[#dfe1e6]">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileText size={20} className="shrink-0 text-[#6b778c]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" title={f.name}>
                  {f.name}
                </p>
                <p className="text-[11px] text-[#6b778c]">
                  {formatBytes(f.size)} · {f.mime} · {userLabel(state, f.uploaderId)} · {formatDate(f.createdAt, true)}
                  {f.objectUrl ? ' · tệp cục bộ' : ' · nội dung mẫu'}
                </p>
              </div>
              <Btn size="icon" variant="subtle" aria-label={`Xem ${f.name}`} onClick={() => setPreview(f)}>
                <Eye />
              </Btn>
              <Btn size="icon" variant="subtle" aria-label={`Tải xuống ${f.name}`} onClick={() => download(f)} disabled={!f.objectUrl && f.sampleText === null}>
                <Download />
              </Btn>
              {(f.uploaderId === me?.id || canUpload) && (
                <Btn size="icon" variant="subtle" aria-label={`Xóa ${f.name}`} onClick={() => setRemoving(f)}>
                  <Trash2 />
                </Btn>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview && <AttachmentPreview file={preview} onClose={() => setPreview(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Xóa tệp ${removing?.name ?? ''}?`}
        description="Tệp sẽ bị gỡ khỏi công việc trong dữ liệu mẫu."
        confirmLabel="Xóa tệp"
        onConfirm={() => (removing ? act((s, c) => removeAttachment(s, c, removing.id), 'Đã xóa tệp').ok : false)}
      />
    </div>
  );
}

function AttachmentPreview({ file, onClose }: { file: DemoAttachment; onClose: () => void }) {
  const [text, setText] = useState<string | null>(file.sampleText);
  useEffect(() => {
    if (file.sampleText !== null || !file.objectUrl || !TEXTUAL.test(file.mime)) return;
    let alive = true;
    fetch(file.objectUrl)
      .then((r) => r.text())
      .then((t) => alive && setText(t.slice(0, 20000)))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [file]);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={file.name} description={`${formatBytes(file.size)} · ${file.mime}`} width={720}>
      {file.objectUrl && RASTER.test(file.mime) ? (
        <img src={file.objectUrl} alt={file.name} className="mx-auto max-h-[60vh] max-w-full object-contain" />
      ) : text !== null ? (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-[3px] bg-[#f4f5f7] p-3 text-xs leading-5">{text}</pre>
      ) : (
        <InlineAlert tone="info">Không xem trước được định dạng này trong bản mẫu. Dùng nút tải xuống để mở bằng ứng dụng trên máy.</InlineAlert>
      )}
    </Modal>
  );
}

/** Lịch sử lấy từ audit của đúng issue; xem tab không tạo thêm bản ghi. */
export function ActivitySection({ issue }: { issue: DemoIssue }) {
  const { state } = useDemo();
  const events = state.auditEvents.filter((e) => e.entityType === 'ISSUE' && e.entityId === issue.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  if (!events.length) return <p className="text-[13px] text-[#6b778c]">Chưa có lịch sử thay đổi trong dữ liệu mẫu.</p>;
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-[13px]">
          <Avatar name={e.actorId === null ? 'Hệ thống' : (findUser(state, e.actorId)?.fullName ?? '?')} size={28} />
          <div>
            <p>
              <span className="font-semibold">{e.actorId === null ? 'Hệ thống' : userLabel(state, e.actorId)}</span> <span className="text-[#42526e]">{e.detail}</span>
            </p>
            <p className="text-xs text-[#6b778c]">{formatDate(e.createdAt, true)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
