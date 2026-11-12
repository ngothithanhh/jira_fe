'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { AlertTriangle, MoreHorizontal, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Btn, EmptyState, FONT, InlineAlert, LinkBtn, Modal, PageHeading, PointsBadge, SearchInput, SelectInput, formatDate } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { IssuePriority, IssueTypeIcon, Screen, UserAvatar, routes, useCan, useIssueParam, useProject } from '../common';
import { boardView, canTransition, findIssue, findStatus, findUser, isDone, moveCard, projectBoards, projectMembers, projectSprints, projectTypes } from '../logic';
import { useDemo } from '../provider';
import type { DemoIssue } from '../types';

const lower = (t: string) => t.toLocaleLowerCase('vi');

type PendingMove = { issue: DemoIssue; columnId: number; position: number; statusIds: number[] };

/**
 * Bảng Scrum: cột lấy từ status hiện tại của issue, phạm vi là sprint đang chọn (mặc định ACTIVE).
 * Kéo thả hoặc menu "Chuyển tới" đều đi qua moveCard (kiểm mapping, workflow, WIP, version).
 * Bộ lọc bật hoặc sprint đã đóng thì khóa kéo vì vị trí trong cột đầy đủ không xác định/không được đổi.
 */
export function BoardScreen() {
  const project = useProject();
  const params = useSearchParams();
  const { state, act } = useDemo();
  const { open } = useIssueParam();
  const canEdit = useCan('EDIT_ISSUE', project.id);
  const canBoard = useCan('MANAGE_BOARD', project.id);
  const boards = projectBoards(state, project.id);
  const sprints = projectSprints(state, project.id).filter((s) => s.state !== 'FUTURE');
  const active = sprints.find((s) => s.state === 'ACTIVE');

  const [boardId, setBoardId] = useState<number | null>(() => Number(params.get('boardId')) || boards[0]?.id || null);
  const [sprintId, setSprintId] = useState<number | null>(() => Number(params.get('sprintId')) || active?.id || null);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<(number | 'none')[]>([]);
  const [typeId, setTypeId] = useState(0);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [menuMove, setMenuMove] = useState<DemoIssue | null>(null);

  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const sprint = sprints.find((s) => s.id === sprintId) ?? active;
  const filtered = !!query.trim() || people.length > 0 || typeId > 0;
  const historical = sprint?.state === 'CLOSED';
  const dragDisabled = filtered || historical || !canEdit;
  const visible = (i: DemoIssue) =>
    (!query.trim() || lower(`${i.key} ${i.title}`).includes(lower(query.trim()))) &&
    (!people.length || people.includes(i.assigneeId ?? 'none')) &&
    (!typeId || i.typeId === typeId);

  if (!boards.length)
    return (
      <Screen>
        <PageHeading title="Bảng công việc" breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Bảng' }]} />
        <EmptyState
          title="Dự án chưa có bảng"
          description="Tạo bảng và cấu hình cột để theo dõi công việc trong sprint."
          action={canBoard ? <LinkBtn variant="primary" href={`${routes.project(project.id, 'settings')}?tab=boards`}>Tạo bảng</LinkBtn> : undefined}
        />
      </Screen>
    );

  const view = sprint && board ? boardView(state, board.id, sprint.id) : null;

  /** Gọi moveCard với version hiện tại; lỗi giữ nguyên state và hiện lý do (WIP, workflow, version). */
  function commitMove(issue: DemoIssue, columnId: number, statusId: number, position: number) {
    if (!board || !sprint) return;
    const current = findIssue(state, issue.id);
    act(
      (s, c) => moveCard(s, c, { boardId: board.id, sprintId: sprint.id, issueId: issue.id, columnId, statusId, position, expectedVersion: current?.version ?? -1 }),
      `Đã chuyển ${issue.key}`,
    );
  }

  /** Cột nhiều status: giữ status nếu đã thuộc cột, có đúng một status hợp lệ thì dùng luôn, còn lại hỏi người dùng. */
  function requestMove(issue: DemoIssue, columnId: number, position: number) {
    const column = view?.columns.find((c) => c.column.id === columnId);
    if (!column) return;
    if (column.statusIds.includes(issue.statusId)) return commitMove(issue, columnId, issue.statusId, position);
    const valid = column.statusIds.filter((id) => canTransition(state, issue.statusId, id));
    if (column.statusIds.length === 1 || valid.length === 1) return commitMove(issue, columnId, valid[0] ?? column.statusIds[0], position);
    setPending({ issue, columnId, position, statusIds: column.statusIds });
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination || dragDisabled || !view) return;
    const issue = findIssue(state, Number(result.draggableId));
    if (!issue) return;
    const columnId = Number(result.destination.droppableId.replace('col-', ''));
    if (result.source.droppableId === result.destination.droppableId && result.source.index === result.destination.index) return;
    requestMove(issue, columnId, result.destination.index);
  }

  const members = projectMembers(state, project.id);
  return (
    <Screen empty={<EmptyState title="Bảng chưa có công việc" description="Thêm công việc vào sprint trong Backlog." />}>
      <PageHeading
        title={board ? board.name : 'Bảng công việc'}
        breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Bảng' }]}
        description={sprint ? `${sprint.name}${sprint.goal ? ` · ${sprint.goal}` : ''}${sprint.endDate ? ` · kết thúc ${formatDate(sprint.endDate)}` : ''}` : undefined}
        actions={
          canBoard && board ? (
            <LinkBtn href={`${routes.project(project.id, 'settings')}?tab=columns&boardId=${board.id}`}>
              <Settings2 size={16} /> Cấu hình bảng
            </LinkBtn>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SelectInput aria-label="Chọn bảng" value={board?.id ?? ''} onChange={(e) => setBoardId(Number(e.target.value))} className="w-auto">
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput aria-label="Chọn sprint" value={sprint?.id ?? ''} onChange={(e) => setSprintId(Number(e.target.value))} className="w-auto">
          {!sprints.length && <option value="">Chưa có sprint</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.state === 'ACTIVE' ? ' (đang diễn ra)' : ' (lịch sử)'}
            </option>
          ))}
        </SelectInput>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm trên bảng" label="Tìm trên bảng" />
        <div className="flex -space-x-1" role="group" aria-label="Lọc theo người phụ trách">
          {members.map((m) => {
            const user = findUser(state, m.userId);
            const on = people.includes(m.userId);
            return (
              <button key={m.userId} aria-pressed={on} aria-label={`Lọc theo ${user?.fullName}`} onClick={() => setPeople((p) => (on ? p.filter((x) => x !== m.userId) : [...p, m.userId]))} className={cn('rounded-full border-2', on ? 'z-10 border-[#0052cc]' : 'border-white')}>
                <Avatar name={user?.fullName ?? '?'} src={user?.avatarUrl} size={30} />
              </button>
            );
          })}
        </div>
        <SelectInput aria-label="Lọc theo loại" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} className="w-auto">
          <option value={0}>Mọi loại</option>
          {projectTypes(state, project.id).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
        {filtered && (
          <Btn variant="link" onClick={() => (setQuery(''), setPeople([]), setTypeId(0))}>
            Xóa bộ lọc
          </Btn>
        )}
      </div>

      {!sprint ? (
        <EmptyState
          title="Chưa có sprint đang diễn ra"
          description="Bắt đầu một sprint trong Backlog để theo dõi công việc trên bảng."
          action={<LinkBtn variant="primary" href={routes.project(project.id, 'backlog')}>Mở Backlog</LinkBtn>}
        />
      ) : (
        <>
          {historical && (
            <div className="mb-3">
              <InlineAlert tone="info">Đang xem lịch sử {sprint.name} (đã đóng). Bảng chỉ đọc; trạng thái hiển thị là trạng thái hiện tại của công việc.</InlineAlert>
            </div>
          )}
          {filtered && !historical && (
            <div className="mb-3">
              <InlineAlert tone="info">Đang lọc: kéo thả bị khóa để vị trí trong cột không bị sai. Dùng menu “Chuyển tới” trên thẻ hoặc bỏ lọc.</InlineAlert>
            </div>
          )}
          {view && !view.columns.length && (
            <EmptyState title="Bảng chưa có cột" description="Thêm cột và ánh xạ trạng thái trong cấu hình bảng." action={canBoard ? <LinkBtn variant="primary" href={`${routes.project(project.id, 'settings')}?tab=columns&boardId=${board?.id}`}>Cấu hình cột</LinkBtn> : undefined} />
          )}
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="relative flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Các cột của bảng">
              {view?.columns.map((col) => {
                const cards = col.issues.filter(visible);
                return (
                  <section key={col.column.id} role="listitem" aria-label={`Cột ${col.column.name}`} className="flex w-[272px] shrink-0 flex-col rounded-[3px] bg-[#f4f5f7]">
                    <header className={cn('flex items-center gap-2 px-3 pb-1 pt-3', col.full && 'text-[#de350b]')}>
                      <h2 className="truncate text-xs font-semibold uppercase text-[#5e6c84]" title={col.column.name}>
                        {col.column.name}
                      </h2>
                      <span className="text-xs text-[#6b778c]">{filtered ? `${cards.length}/${col.issues.length}` : col.issues.length}</span>
                      {col.column.wipLimit > 0 && (
                        <span
                          title={`Giới hạn WIP tính trên toàn dự án: ${col.load}/${col.column.wipLimit}`}
                          className={cn('ml-auto flex items-center gap-1 rounded-[3px] px-1.5 text-[11px] font-semibold', col.full ? 'bg-[#ffebe6] text-[#bf2600]' : 'bg-[#dfe1e6] text-[#42526e]')}
                        >
                          {col.full && <AlertTriangle size={11} aria-hidden />}
                          WIP {col.load}/{col.column.wipLimit}
                        </span>
                      )}
                    </header>
                    <p className="px-3 pb-2 text-[11px] text-[#6b778c]">{col.statusIds.map((id) => findStatus(state, id)?.name).join(' · ') || 'Chưa map trạng thái'}</p>
                    <Droppable droppableId={`col-${col.column.id}`} isDropDisabled={dragDisabled}>
                      {(drop, snap) => (
                        <div ref={drop.innerRef} {...drop.droppableProps} className={cn('flex min-h-[120px] flex-1 flex-col gap-1.5 px-1.5 pb-2', snap.isDraggingOver && (col.full ? 'bg-[#ffebe6]' : 'bg-[#e9f2ff]'))}>
                          {cards.map((issue, index) => (
                            <Draggable key={issue.id} draggableId={String(issue.id)} index={index} isDragDisabled={dragDisabled}>
                              {(drag, dragSnap) => (
                                <article
                                  ref={drag.innerRef}
                                  {...drag.draggableProps}
                                  {...drag.dragHandleProps}
                                  aria-label={`${issue.key}: ${issue.title}`}
                                  className={cn('group rounded-[3px] bg-white p-2.5 text-[13px] shadow-[0_1px_1px_rgba(9,30,66,0.25)] hover:bg-[#fafbfc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff]', dragSnap.isDragging && 'rotate-1 shadow-[0_8px_16px_rgba(9,30,66,0.25)]')}
                                >
                                  <div className="flex items-start gap-1">
                                    <button onClick={() => open(issue.id)} className="line-clamp-3 min-w-0 flex-1 text-left leading-5 text-[#172b4d] hover:text-[#0052cc] hover:underline" title={issue.title}>
                                      {issue.title}
                                    </button>
                                    {canEdit && !historical && (
                                      <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger asChild>
                                          <Btn size="icon" variant="subtle" className="size-6 shrink-0 opacity-60 group-hover:opacity-100" aria-label={`Thao tác ${issue.key}`}>
                                            <MoreHorizontal />
                                          </Btn>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" style={FONT}>
                                          <DropdownMenuItem onSelect={() => open(issue.id)}>Xem chi tiết</DropdownMenuItem>
                                          <DropdownMenuItem onSelect={() => setMenuMove(issue)}>Chuyển tới…</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <IssueTypeIcon typeId={issue.typeId} />
                                    <button onClick={() => open(issue.id)} className={cn('text-xs font-medium text-[#6b778c] hover:underline', isDone(state, issue) && 'line-through')}>
                                      {issue.key}
                                    </button>
                                    <span className="ml-auto flex items-center gap-1.5">
                                      <IssuePriority issue={issue} />
                                      <PointsBadge points={issue.points} />
                                      <UserAvatar userId={issue.assigneeId} />
                                    </span>
                                  </div>
                                </article>
                              )}
                            </Draggable>
                          ))}
                          {drop.placeholder}
                          {!cards.length && <p className="px-2 py-4 text-center text-xs text-[#6b778c]">{filtered ? 'Không có thẻ khớp bộ lọc' : 'Kéo thẻ vào đây'}</p>}
                        </div>
                      )}
                    </Droppable>
                  </section>
                );
              })}
            </div>
          </DragDropContext>
          {view && view.unmapped.length > 0 && (
            <section aria-label="Chưa phân cột" className="mt-4 rounded-[3px] border border-dashed border-[#ffab00] p-3">
              <h2 className="text-sm font-semibold text-[#974f0c]">Chưa phân cột ({view.unmapped.filter(visible).length})</h2>
              <p className="mb-2 text-xs text-[#6b778c]">
                Trạng thái của các công việc này chưa được ánh xạ vào cột nào của bảng.{' '}
                {canBoard && (
                  <Link className="text-[#0052cc] underline" href={`${routes.project(project.id, 'settings')}?tab=columns&boardId=${board?.id}`}>
                    Ánh xạ trạng thái
                  </Link>
                )}
              </p>
              <ul className="flex flex-wrap gap-2">
                {view.unmapped.filter(visible).map((i) => (
                  <li key={i.id} className="flex max-w-full flex-wrap items-center gap-2 rounded-[3px] bg-white px-2 py-1.5 text-[13px] shadow-[0_1px_1px_rgba(9,30,66,0.25)]">
                    <IssueTypeIcon typeId={i.typeId} />
                    <button className="text-[#6b778c] hover:underline" onClick={() => open(i.id)}>
                      {i.key}
                    </button>
                    <span className="max-w-[220px] truncate">{i.title}</span>
                    <span className="text-[11px] text-[#974f0c]">{findStatus(state, i.statusId)?.name}</span>
                    {canEdit && !historical && (
                      <Btn size="sm" variant="subtle" onClick={() => setMenuMove(i)}>
                        Chuyển tới…
                      </Btn>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {pending && (
        <StatusChooser
          issue={pending.issue}
          statusIds={pending.statusIds}
          onCancel={() => setPending(null)}
          onChoose={(statusId) => {
            commitMove(pending.issue, pending.columnId, statusId, pending.position);
            setPending(null);
          }}
        />
      )}
      {menuMove && view && (
        <MoveDialog
          issue={menuMove}
          columns={view.columns.map((c) => ({ id: c.column.id, name: c.column.name, statusIds: c.statusIds, full: c.full, size: c.issues.filter((i) => i.id !== menuMove.id).length }))}
          onCancel={() => setMenuMove(null)}
          onChoose={(columnId, statusId, size) => {
            commitMove(menuMove, columnId, statusId, size);
            setMenuMove(null);
          }}
        />
      )}
    </Screen>
  );
}

/** Cột có nhiều status: người dùng chọn status đích; status không có cạnh workflow bị vô hiệu kèm lý do. */
function StatusChooser({ issue, statusIds, onCancel, onChoose }: { issue: DemoIssue; statusIds: number[]; onCancel: () => void; onChoose: (statusId: number) => void }) {
  const { state } = useDemo();
  return (
    <Modal open onOpenChange={(v) => !v && onCancel()} title="Chọn trạng thái" description={`Cột đích có nhiều trạng thái. Chọn trạng thái cho ${issue.key}.`} width={420}>
      <ul className="space-y-1 pb-2">
        {statusIds.map((id) => {
          const ok = canTransition(state, issue.statusId, id);
          return (
            <li key={id}>
              <button disabled={!ok} onClick={() => onChoose(id)} className="flex w-full items-center justify-between rounded-[3px] border border-[#dfe1e6] px-3 py-2 text-left text-sm hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-50">
                {findStatus(state, id)?.name}
                {!ok && <span className="text-xs text-[#6b778c]">Workflow không cho phép</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Phương án thay thế kéo thả: chọn cột + status đích, thẻ được đặt cuối cột. */
function MoveDialog({
  issue,
  columns,
  onCancel,
  onChoose,
}: {
  issue: DemoIssue;
  columns: { id: number; name: string; statusIds: number[]; full: boolean; size: number }[];
  onCancel: () => void;
  onChoose: (columnId: number, statusId: number, position: number) => void;
}) {
  const { state } = useDemo();
  return (
    <Modal open onOpenChange={(v) => !v && onCancel()} title={`Chuyển ${issue.key}`} description={`Hiện tại: ${findStatus(state, issue.statusId)?.name}. Thẻ sẽ được đặt cuối cột đích.`} width={480}>
      <div className="space-y-3 pb-2">
        {columns.map((col) => (
          <div key={col.id}>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-[#5e6c84]">
              {col.name}
              {col.full && <span className="normal-case text-[#bf2600]">· đã đạt WIP</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {col.statusIds.map((id) => {
                const current = id === issue.statusId;
                const ok = canTransition(state, issue.statusId, id);
                return (
                  <Btn key={id} variant={current ? 'primary' : 'secondary'} disabled={!ok} title={!ok ? 'Workflow không cho phép chuyển' : undefined} onClick={() => onChoose(col.id, id, col.size)}>
                    {findStatus(state, id)?.name}
                    {current ? ' (hiện tại)' : ''}
                  </Btn>
                );
              })}
              {!col.statusIds.length && <span className="text-xs text-[#6b778c]">Cột chưa map trạng thái</span>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
