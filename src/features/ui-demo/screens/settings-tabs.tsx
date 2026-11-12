'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Btn, ConfirmDialog, EmptyState, Field, InlineAlert, Modal, SelectInput, StatusLozenge, TextInput, TypeIcon, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { routes, useCan, useProject } from '../common';
import {
  assignTypeToProject,
  boardColumns,
  columnForStatus,
  columnLoad,
  columnStatusIds,
  createBoard,
  createColumn,
  deleteBoard,
  deleteColumn,
  findStatus,
  mapStatus,
  projectBoards,
  projectIssues,
  projectTypes,
  removeTypeFromProject,
  renameBoard,
  reorderColumns,
  setDefaultType,
  unmapStatus,
  updateColumn,
} from '../logic';
import { useDemo } from '../provider';
import type { DemoBoard, DemoColumn } from '../types';

/** Gán loại từ danh mục chung; không gỡ được loại mặc định hoặc đang được công việc sử dụng. */
export function TypesTab() {
  const project = useProject();
  const { state, act } = useDemo();
  const canEdit = useCan('EDIT_PROJECT', project.id);
  const canConfig = useCan('MANAGE_CONFIG');
  const assigned = projectTypes(state, project.id);
  const available = state.issueTypes.filter((t) => !assigned.some((a) => a.id === t.id));
  const [adding, setAdding] = useState(available[0]?.id ?? 0);
  const used = (typeId: number) => projectIssues(state, project.id).filter((i) => i.typeId === typeId).length;
  return (
    <div className="relative max-w-3xl space-y-4 overflow-x-auto">
      <p className="text-sm text-[#6b778c]">
        Danh mục loại công việc dùng chung toàn hệ thống.{' '}
        {canConfig && (
          <Link className="text-[#0052cc] hover:underline" href={routes.admin('issue-types')}>
            Quản lý danh mục
          </Link>
        )}
      </p>
      {!assigned.length && <InlineAlert tone="warning">Dự án chưa có loại công việc, chưa tạo được công việc.</InlineAlert>}
      {assigned.length > 0 && (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Loại</th>
              <th className={thClass}>Đang dùng</th>
              <th className={thClass}>Mặc định</th>
              <th className={thClass}>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {assigned.map((t) => (
              <tr key={t.id}>
                <td className={tdClass}>
                  <span className="flex items-center gap-2">
                    <TypeIcon icon={t.icon} name={t.name} color={t.color} /> {t.name}
                  </span>
                </td>
                <td className={tdClass}>{used(t.id)} công việc</td>
                <td className={tdClass}>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="default-type" checked={t.isDefault} disabled={!canEdit} onChange={() => act((s, c) => setDefaultType(s, c, project.id, t.id), `Loại mặc định: ${t.name}`)} />
                    <span className="sr-only">Đặt {t.name} làm mặc định</span>
                    {t.isDefault && <span className="text-xs text-[#6b778c]">Mặc định</span>}
                  </label>
                </td>
                <td className={tdClass}>
                  {canEdit && (
                    <Btn variant="subtle" disabled={t.isDefault || used(t.id) > 0} title={t.isDefault ? 'Chọn loại mặc định khác trước' : used(t.id) ? 'Còn công việc thuộc loại này' : undefined} onClick={() => act((s, c) => removeTypeFromProject(s, c, project.id, t.id), `Đã gỡ ${t.name}`)}>
                      Gỡ
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && available.length > 0 && (
        <div className="flex items-end gap-2">
          <Field label="Thêm loại vào dự án">
            {(p) => (
              <SelectInput {...p} value={adding} onChange={(e) => setAdding(Number(e.target.value))} className="w-56">
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Btn variant="primary" size="md" onClick={() => act((s, c) => assignTypeToProject(s, c, project.id, adding || available[0].id), 'Đã gán loại công việc')}>
            <Plus /> Thêm
          </Btn>
        </div>
      )}
    </div>
  );
}

/** Danh sách bảng của dự án: tạo (kèm 3 cột theo nhóm trạng thái), đổi tên, xóa (giữ issue). */
export function BoardsTab({ onConfigure }: { onConfigure: (boardId: number) => void }) {
  const project = useProject();
  const { state, act } = useDemo();
  const canBoard = useCan('MANAGE_BOARD', project.id);
  const boards = projectBoards(state, project.id);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<DemoBoard | null>(null);
  const [removing, setRemoving] = useState<DemoBoard | null>(null);
  return (
    <div className="relative max-w-3xl space-y-4 overflow-x-auto">
      {!canBoard && <InlineAlert tone="info">Bạn chỉ được xem cấu hình bảng.</InlineAlert>}
      {!boards.length ? (
        <EmptyState title="Chưa có bảng" description="Tạo bảng để theo dõi công việc trong sprint." />
      ) : (
        <ul className="divide-y divide-[#ebecf0] rounded-[3px] border border-[#dfe1e6]">
          {boards.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-[#6b778c]">{boardColumns(state, b.id).length} cột</span>
              <span className="ml-auto flex gap-1">
                <Btn variant="subtle" onClick={() => onConfigure(b.id)}>
                  Cột & trạng thái
                </Btn>
                {canBoard && (
                  <>
                    <Btn size="icon" variant="subtle" aria-label={`Đổi tên ${b.name}`} onClick={() => setRenaming(b)}>
                      <Pencil />
                    </Btn>
                    <Btn size="icon" variant="subtle" aria-label={`Xóa ${b.name}`} onClick={() => setRemoving(b)}>
                      <Trash2 />
                    </Btn>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canBoard && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (act((s, c) => createBoard(s, c, project.id, name), 'Đã tạo bảng').ok) setName('');
          }}
        >
          <Field label="Tạo bảng mới">
            {(p) => <TextInput {...p} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Tên bảng" className="w-64" />}
          </Field>
          <Btn type="submit" variant="primary" size="md" disabled={!name.trim()}>
            <Plus /> Tạo bảng
          </Btn>
        </form>
      )}
      {renaming && <RenameDialog title="Đổi tên bảng" initial={renaming.name} onClose={() => setRenaming(null)} onSave={(v) => act((s, c) => renameBoard(s, c, renaming.id, v), 'Đã đổi tên bảng').ok} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Xóa bảng ${removing?.name ?? ''}?`}
        description="Chỉ xóa cột, ánh xạ trạng thái và thứ tự thẻ của bảng này. Công việc và dự án giữ nguyên."
        confirmLabel="Xóa bảng"
        onConfirm={() => (removing ? act((s, c) => deleteBoard(s, c, removing.id), 'Đã xóa bảng').ok : false)}
      />
    </div>
  );
}

function RenameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (v: string) => boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={title}
      width={420}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" disabled={!value.trim()} onClick={() => onSave(value) && onClose()}>
            Lưu
          </Btn>
        </>
      }
    >
      <Field label="Tên" required>
        {(p) => <TextInput {...p} autoFocus maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
    </Modal>
  );
}

/**
 * Cột của một bảng: thứ tự (nút lên/xuống, gửi đủ danh sách cột), WIP, ánh xạ trạng thái.
 * Một trạng thái chỉ thuộc một cột trong cùng bảng; trạng thái chưa map hiện ở danh sách riêng.
 */
export function ColumnsTab({ initialBoardId }: { initialBoardId: number | null }) {
  const project = useProject();
  const { state, act } = useDemo();
  const canBoard = useCan('MANAGE_BOARD', project.id);
  const boards = projectBoards(state, project.id);
  const [boardId, setBoardId] = useState(initialBoardId ?? boards[0]?.id ?? 0);
  const [editing, setEditing] = useState<DemoColumn | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<DemoColumn | null>(null);
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  if (!board) return <EmptyState title="Chưa có bảng" description="Tạo bảng ở tab Bảng trước khi cấu hình cột." />;
  const columns = boardColumns(state, board.id);
  const unmapped = state.statuses.filter((st) => !columnForStatus(state, board.id, st.id));
  const move = (index: number, delta: number) => {
    const ids = columns.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    act((s, c) => reorderColumns(s, c, board.id, ids), 'Đã sắp xếp cột');
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Bảng">
          {(p) => (
            <SelectInput {...p} value={board.id} onChange={(e) => setBoardId(Number(e.target.value))} className="w-64">
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {canBoard && (
          <Btn variant="primary" size="md" onClick={() => setCreating(true)}>
            <Plus /> Thêm cột
          </Btn>
        )}
        <Link className="ml-auto text-[13px] text-[#0052cc] hover:underline" href={`${routes.project(project.id, 'board')}?boardId=${board.id}`}>
          Mở bảng
        </Link>
      </div>
      {!canBoard && <InlineAlert tone="info">Bạn chỉ được xem cấu hình cột.</InlineAlert>}
      {!columns.length && <EmptyState title="Bảng chưa có cột" description="Thêm cột rồi ánh xạ trạng thái vào cột." />}
      <div className="relative overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Thứ tự</th>
              <th className={thClass}>Cột</th>
              <th className={thClass}>WIP</th>
              <th className={thClass}>Trạng thái được ánh xạ</th>
              <th className={thClass}>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, index) => {
              const load = columnLoad(state, col.id);
              const full = col.wipLimit > 0 && load >= col.wipLimit;
              return (
                <tr key={col.id}>
                  <td className={tdClass}>
                    <span className="flex gap-1">
                      <Btn size="icon" variant="subtle" aria-label={`Đưa ${col.name} sang trái`} disabled={!canBoard || index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp />
                      </Btn>
                      <Btn size="icon" variant="subtle" aria-label={`Đưa ${col.name} sang phải`} disabled={!canBoard || index === columns.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown />
                      </Btn>
                    </span>
                  </td>
                  <td className={tdClass}>
                    <span className="font-medium">{col.name}</span>
                    <span className="block text-xs text-[#6b778c]">{load} công việc theo ánh xạ</span>
                  </td>
                  <td className={tdClass}>
                    <span className={full ? 'font-semibold text-[#bf2600]' : ''}>{col.wipLimit ? `${load}/${col.wipLimit}${full ? ' · đầy' : ''}` : 'Không giới hạn'}</span>
                  </td>
                  <td className={tdClass}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {columnStatusIds(state, col.id).map((id) => {
                        const st = findStatus(state, id);
                        return (
                          <span key={id} className="inline-flex items-center gap-0.5">
                            <StatusLozenge name={st?.name ?? '?'} category={st?.category ?? 'TO_DO'} />
                            {canBoard && (
                              <button aria-label={`Gỡ ${st?.name} khỏi ${col.name}`} className="rounded p-0.5 text-[#6b778c] hover:bg-[#091e420f]" onClick={() => act((s, c) => unmapStatus(s, c, col.id, id), `Đã gỡ ${st?.name}`)}>
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        );
                      })}
                      {canBoard && unmapped.length > 0 && (
                        <SelectInput
                          aria-label={`Ánh xạ trạng thái vào ${col.name}`}
                          value=""
                          className="h-7 w-auto py-0 text-xs"
                          onChange={(e) => e.target.value && act((s, c) => mapStatus(s, c, col.id, Number(e.target.value)), 'Đã ánh xạ trạng thái')}
                        >
                          <option value="">+ Ánh xạ</option>
                          {unmapped.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </SelectInput>
                      )}
                    </span>
                  </td>
                  <td className={tdClass}>
                    {canBoard && (
                      <span className="flex gap-1">
                        <Btn size="icon" variant="subtle" aria-label={`Sửa ${col.name}`} onClick={() => setEditing(col)}>
                          <Pencil />
                        </Btn>
                        <Btn size="icon" variant="subtle" aria-label={`Xóa ${col.name}`} onClick={() => setRemoving(col)}>
                          <Trash2 />
                        </Btn>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="rounded-[3px] border border-dashed border-[#dfe1e6] p-3">
        <h3 className="mb-1 text-sm font-semibold">Trạng thái chưa ánh xạ ({unmapped.length})</h3>
        <p className="mb-2 text-xs text-[#6b778c]">Công việc ở các trạng thái này hiện trong nhóm “Chưa phân cột” trên bảng.</p>
        <div className="flex flex-wrap gap-1.5">
          {unmapped.map((st) => (
            <StatusLozenge key={st.id} name={st.name} category={st.category} />
          ))}
          {!unmapped.length && <span className="text-xs text-[#6b778c]">Mọi trạng thái đều đã có cột.</span>}
        </div>
      </section>
      {(editing || creating) && (
        <ColumnDialog
          column={editing}
          onClose={() => (setEditing(null), setCreating(false))}
          onSave={(input) =>
            editing ? act((s, c) => updateColumn(s, c, editing.id, input), 'Đã lưu cột') : act((s, c) => createColumn(s, c, board.id, input), 'Đã thêm cột')
          }
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Xóa cột ${removing?.name ?? ''}?`}
        description="Chỉ xóa được cột không còn công việc theo ánh xạ. Ánh xạ trạng thái của cột cũng bị gỡ."
        confirmLabel="Xóa cột"
        onConfirm={() => (removing ? act((s, c) => deleteColumn(s, c, removing.id), 'Đã xóa cột').ok : false)}
      />
    </div>
  );
}

/** Sửa/thêm cột; WIP thấp hơn tải hiện tại bị chặn ở logic và hiện lỗi ngay tại trường. */
function ColumnDialog({
  column,
  onClose,
  onSave,
}: {
  column: DemoColumn | null;
  onClose: () => void;
  onSave: (input: { name: string; wipLimit: number }) => { ok: boolean; fieldErrors?: Record<string, string> };
}) {
  const [name, setName] = useState(column?.name ?? '');
  const [wip, setWip] = useState(String(column?.wipLimit ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={column ? `Sửa cột ${column.name}` : 'Thêm cột'}
      width={440}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              const value = wip.trim() === '' ? 0 : Number(wip);
              const r = onSave({ name, wipLimit: Number.isNaN(value) ? -1 : value });
              if (r.ok) onClose();
              else setErrors(r.fieldErrors ?? {});
            }}
          >
            Lưu
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tên cột" required error={errors.name}>
          {(p) => <TextInput {...p} autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Giới hạn WIP" error={errors.wipLimit} hint="0 là không giới hạn. Tính trên mọi công việc của dự án ở trạng thái thuộc cột.">
          {(p) => <TextInput {...p} inputMode="numeric" value={wip} onChange={(e) => setWip(e.target.value)} className="w-32" />}
        </Field>
      </div>
    </Modal>
  );
}

/** Workflow dùng chung toàn hệ thống; dự án chỉ xem, chỉnh ở khu quản trị nếu có quyền. */
export function WorkflowTab() {
  const { state } = useDemo();
  const canConfig = useCan('MANAGE_CONFIG');
  return (
    <div className="relative max-w-3xl space-y-4 overflow-x-auto">
      <InlineAlert tone="info">
        Workflow áp dụng cho mọi dự án, không riêng {useProject().key}.{' '}
        {canConfig ? (
          <Link className="font-semibold underline" href={routes.admin('workflows')}>
            Chỉnh trong Quản trị → Workflow
          </Link>
        ) : (
          'Liên hệ quản trị viên nếu cần thay đổi.'
        )}
      </InlineAlert>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Từ trạng thái</th>
            <th className={thClass}>Được chuyển sang</th>
          </tr>
        </thead>
        <tbody>
          {state.statuses.map((st) => {
            const targets = state.workflowRules.filter((r) => r.fromStatusId === st.id).map((r) => findStatus(state, r.toStatusId));
            return (
              <tr key={st.id}>
                <td className={tdClass}>
                  <StatusLozenge name={st.name} category={st.category} />
                </td>
                <td className={tdClass}>
                  <span className="flex flex-wrap gap-1.5">
                    {targets.map((t) => t && <StatusLozenge key={t.id} name={t.name} category={t.category} />)}
                    {!targets.length && <span className="text-xs text-[#6b778c]">Không có chuyển tiếp</span>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
