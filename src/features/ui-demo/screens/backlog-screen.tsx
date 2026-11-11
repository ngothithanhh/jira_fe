'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { CalendarDays, ChevronDown, ChevronRight, GripVertical, History, ListFilter, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Btn, ConfirmDialog, EmptyState, FONT, Field, InlineAlert, Modal, PageHeading, PointsBadge, SearchInput, SelectInput, TextArea, TextInput, formatDate } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { IssuePriority, IssueStatus, IssueTypeIcon, Screen, UserAvatar, routes, useCan, useIssueParam, useProject } from '../common';
import {
  completeSprint,
  createIssue,
  createSprint,
  deleteSprint,
  findIssue,
  findStatus,
  findUser,
  isDone,
  moveIssueToSprint,
  productBacklog,
  projectMembers,
  projectSprints,
  projectTypes,
  reorderBacklog,
  reorderSprint,
  snapshotOf,
  sprintIssueList,
  sprintMetrics,
  startSprint,
  updateSprint,
  type SprintInput,
} from '../logic';
import { useDemo } from '../provider';
import type { DemoIssue, DemoSprint } from '../types';

const lower = (t: string) => t.toLocaleLowerCase('vi');
const groupKey = (sprintId: number | null) => (sprintId === null ? 'backlog' : `sprint-${sprintId}`);
const parseGroup = (key: string) => (key === 'backlog' ? null : Number(key.slice(7)));

/**
 * Backlog dựng lại trên DemoState: nhóm sprint ACTIVE/FUTURE rồi product backlog, lịch sử CLOSED ở cuối.
 * Kéo thả và các nút sắp xếp gửi danh sách ĐẦY ĐỦ của nhóm; khi bộ lọc bật, kéo/sắp xếp bị khóa để không gửi tập con.
 */
export function BacklogScreen() {
  const project = useProject();
  const { state, exec, act } = useDemo();
  const { open } = useIssueParam();
  const canSprint = useCan('MANAGE_SPRINT', project.id);
  const canCreate = useCan('CREATE_ISSUE', project.id);
  const canRank = useCan('EDIT_ISSUE', project.id) || canSprint;

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<(number | 'none')[]>([]);
  const [typeId, setTypeId] = useState(0);
  const [hideDone, setHideDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sprintDialog, setSprintDialog] = useState<{ mode: 'create' } | { mode: 'edit'; sprint: DemoSprint } | null>(null);
  const [starting, setStarting] = useState<DemoSprint | null>(null);
  const [completing, setCompleting] = useState<DemoSprint | null>(null);
  const [removing, setRemoving] = useState<DemoSprint | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const sprints = projectSprints(state, project.id);
  const open_ = sprints.filter((s) => s.state !== 'CLOSED').sort((a, b) => (a.state === 'ACTIVE' ? -1 : b.state === 'ACTIVE' ? 1 : a.id - b.id));
  const closed = sprints.filter((s) => s.state === 'CLOSED').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const hasActive = open_.some((s) => s.state === 'ACTIVE');
  const members = projectMembers(state, project.id);
  const types = projectTypes(state, project.id);
  const filtered = !!query.trim() || people.length > 0 || typeId > 0 || hideDone;

  const groups = useMemo(
    () => [
      ...open_.map((s) => ({ key: groupKey(s.id), sprint: s as DemoSprint | null, issues: sprintIssueList(state, s.id) })),
      { key: 'backlog', sprint: null, issues: productBacklog(state, project.id) },
    ],
    [state, project.id, open_],
  );

  const visible = (i: DemoIssue) =>
    (!query.trim() || lower(`${i.key} ${i.title}`).includes(lower(query.trim()))) &&
    (!people.length || people.includes(i.assigneeId === null ? 'none' : i.assigneeId)) &&
    (!typeId || i.typeId === typeId) &&
    (!hideDone || !isDone(state, i));

  /**
   * Thả card: khác nhóm thì chuyển nhóm trước, sau đó xếp vào đúng vị trí thả bằng danh sách đầy đủ của nhóm đích.
   * Kéo chỉ bật khi không lọc nên chỉ số thả trùng với vị trí trong danh sách đầy đủ.
   */
  function onDragEnd(result: DropResult) {
    if (!result.destination || filtered) return;
    const from = parseGroup(result.source.droppableId);
    const to = parseGroup(result.destination.droppableId);
    const issueId = Number(result.draggableId);
    if (from === to && result.source.index === result.destination.index) return;
    let current = state;
    if (from !== to) {
      const moved = act((s, c) => moveIssueToSprint(s, c, issueId, to));
      if (!moved.ok) return;
      current = moved.state;
      if (to === null && isDone(current, findIssue(current, issueId)!)) {
        toast.success('Đã gỡ khỏi sprint. Việc đã hoàn thành không hiển thị trong product backlog.');
        return;
      }
    }
    const list = (to === null ? productBacklog(current, project.id) : sprintIssueList(current, to)).map((i) => i.id).filter((id) => id !== issueId);
    list.splice(result.destination.index, 0, issueId);
    const placed = exec((s, c) => (to === null ? reorderBacklog(s, c, project.id, list) : reorderSprint(s, c, to, list)));
    if (!placed.ok) toast.error(placed.message);
    else if (from !== to) toast.success(to === null ? 'Đã đưa về product backlog' : `Đã chuyển vào ${open_.find((s) => s.id === to)?.name}`);
  }

  function rank(issueId: number, group: number | null, where: 'top' | 'bottom') {
    const list = (group === null ? productBacklog(state, project.id) : sprintIssueList(state, group)).map((i) => i.id).filter((id) => id !== issueId);
    if (where === 'top') list.unshift(issueId);
    else list.push(issueId);
    act((s, c) => (group === null ? reorderBacklog(s, c, project.id, list) : reorderSprint(s, c, group, list)), where === 'top' ? 'Đã đưa lên đầu' : 'Đã đưa xuống cuối');
  }

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Screen
      empty={<EmptyState title="Backlog trống" description="Chưa có sprint hay công việc. Dùng nút Tạo ở thanh trên cùng để thêm công việc đầu tiên." />}
    >
      <PageHeading
        title="Backlog"
        breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Backlog' }]}
        actions={
          canSprint && (
            <Btn onClick={() => setSprintDialog({ mode: 'create' })}>
              <Plus /> Tạo sprint
            </Btn>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã hoặc tiêu đề" label="Tìm trong backlog" />
        <div className="flex items-center -space-x-1" role="group" aria-label="Lọc theo người phụ trách">
          {members.map((m) => {
            const active = people.includes(m.userId);
            const user = findUser(state, m.userId);
            return (
              <button
                key={m.userId}
                aria-pressed={active}
                aria-label={`Lọc theo ${user?.fullName}`}
                onClick={() => setPeople((p) => (active ? p.filter((x) => x !== m.userId) : [...p, m.userId]))}
                className={cn('rounded-full border-2 transition', active ? 'z-10 border-[#0052cc]' : 'border-white hover:z-10 hover:-translate-y-0.5')}
              >
                <Avatar name={user?.fullName ?? '?'} src={user?.avatarUrl} size={30} />
              </button>
            );
          })}
          <button
            aria-pressed={people.includes('none')}
            aria-label="Lọc việc chưa phân công"
            onClick={() => setPeople((p) => (p.includes('none') ? p.filter((x) => x !== 'none') : [...p, 'none']))}
            className={cn('rounded-full border-2', people.includes('none') ? 'z-10 border-[#0052cc]' : 'border-white')}
          >
            <Avatar name={null} size={30} />
          </button>
        </div>
        <SelectInput aria-label="Lọc theo loại" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} className="w-auto">
          <option value={0}>Mọi loại</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
        <Btn variant={hideDone ? 'primary' : 'subtle'} aria-pressed={hideDone} onClick={() => setHideDone((v) => !v)}>
          <ListFilter /> Ẩn việc đã xong
        </Btn>
        {filtered && (
          <Btn
            variant="link"
            onClick={() => {
              setQuery('');
              setPeople([]);
              setTypeId(0);
              setHideDone(false);
            }}
          >
            Xóa bộ lọc
          </Btn>
        )}
      </div>
      {filtered && (
        <div className="mb-3">
          <InlineAlert tone="info">Đang lọc: kéo thả và sắp xếp bị khóa để không làm lệch thứ tự của các công việc bị ẩn. Bỏ lọc để sắp xếp.</InlineAlert>
        </div>
      )}
      {!types.length && (
        <div className="mb-3">
          <InlineAlert tone="warning">
            Dự án chưa có loại công việc nên chưa tạo được công việc.{' '}
            <Link className="font-semibold underline" href={`${routes.project(project.id, 'settings')}?tab=types`}>
              Gán loại công việc
            </Link>
          </InlineAlert>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="space-y-4">
          {groups.map((group) => {
            const shown = group.issues.filter(visible);
            const isClosed = collapsed.has(group.key);
            const sprint = group.sprint;
            const m = sprint ? sprintMetrics(state, sprint.id) : null;
            const byCategory = (cat: string) => group.issues.filter((i) => findStatus(state, i.statusId)?.category === cat).reduce((t, i) => t + (i.points ?? 0), 0);
            return (
              <section key={group.key} aria-label={sprint ? sprint.name : 'Product backlog'} className="rounded-[3px] bg-[#f4f5f7] p-2">
                <div className="flex flex-wrap items-center gap-2 px-1 py-1">
                  <button onClick={() => toggle(group.key)} aria-expanded={!isClosed} className="flex items-center gap-1.5 rounded-[3px] px-1 text-left hover:bg-[#091e420f]">
                    {isClosed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span className="text-sm font-semibold">{sprint ? sprint.name : 'Backlog'}</span>
                  </button>
                  {sprint && (
                    <span className="flex items-center gap-1 text-xs text-[#6b778c]">
                      <CalendarDays size={12} aria-hidden /> {sprint.startDate ? `${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}` : 'Chưa đặt ngày'}
                    </span>
                  )}
                  <span className="text-xs text-[#6b778c]">({filtered ? `${shown.length}/${group.issues.length}` : group.issues.length} công việc)</span>
                  {sprint?.state === 'ACTIVE' && <span className="rounded-[3px] bg-[#deebff] px-1.5 text-[11px] font-bold text-[#0747a6]">ĐANG DIỄN RA</span>}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="flex gap-1" aria-label="Story points theo nhóm trạng thái">
                      <span title="Cần làm" className="rounded-full bg-[#dfe1e6] px-1.5 text-[11px] font-semibold leading-5 text-[#42526e]">{byCategory('TO_DO')}</span>
                      <span title="Đang làm" className="rounded-full bg-[#deebff] px-1.5 text-[11px] font-semibold leading-5 text-[#0747a6]">{byCategory('IN_PROGRESS')}</span>
                      <span title="Hoàn thành" className="rounded-full bg-[#e3fcef] px-1.5 text-[11px] font-semibold leading-5 text-[#006644]">{byCategory('DONE')}</span>
                    </span>
                    {sprint?.state === 'FUTURE' && canSprint && (
                      <Btn
                        disabled={hasActive || !group.issues.length}
                        title={hasActive ? 'Hoàn tất sprint đang diễn ra trước' : !group.issues.length ? 'Thêm công việc trước khi bắt đầu' : undefined}
                        onClick={() => setStarting(sprint)}
                      >
                        Bắt đầu sprint
                      </Btn>
                    )}
                    {sprint?.state === 'ACTIVE' && canSprint && <Btn onClick={() => setCompleting(sprint)}>Hoàn tất sprint</Btn>}
                    {sprint && canSprint && (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Btn size="icon" variant="subtle" aria-label={`Thao tác ${sprint.name}`}>
                            <MoreHorizontal />
                          </Btn>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={FONT}>
                          <DropdownMenuItem onSelect={() => setSprintDialog({ mode: 'edit', sprint })}>Sửa sprint</DropdownMenuItem>
                          {sprint.state === 'FUTURE' && (
                            <DropdownMenuItem className="text-[#de350b]" onSelect={() => setRemoving(sprint)}>
                              Xóa sprint…
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                {!isClosed && (
                  <>
                    {sprint?.goal && <p className="px-8 pb-1 text-xs text-[#6b778c]">Mục tiêu: {sprint.goal}</p>}
                    <Droppable droppableId={group.key} isDropDisabled={filtered || !canRank}>
                      {(drop, snap) => (
                        <ul ref={drop.innerRef} {...drop.droppableProps} className={cn('min-h-10 rounded-[3px] bg-white', snap.isDraggingOver && 'bg-[#e9f2ff]', !shown.length && 'border border-dashed border-[#c1c7d0]')}>
                          {shown.map((issue, index) => (
                            <Draggable key={issue.id} draggableId={String(issue.id)} index={index} isDragDisabled={filtered || !canRank}>
                              {(drag, dragSnap) => (
                                <li
                                  ref={drag.innerRef}
                                  {...drag.draggableProps}
                                  className={cn('group flex min-h-[40px] items-center gap-2 border-b border-[#ebecf0] bg-white px-2 last:border-b-0 hover:bg-[#f4f5f7] sm:min-h-9', dragSnap.isDragging && 'rounded-[3px] shadow-[0_4px_8px_rgba(9,30,66,0.25)]')}
                                >
                                  <span
                                    {...drag.dragHandleProps}
                                    aria-label={`Kéo để sắp xếp ${issue.key}. Dùng phím cách rồi mũi tên để di chuyển.`}
                                    className={cn('shrink-0 rounded p-0.5 text-[#97a0af]', filtered || !canRank ? 'invisible' : 'opacity-40 group-hover:opacity-100 focus:opacity-100')}
                                  >
                                    <GripVertical size={14} />
                                  </span>
                                  <IssueTypeIcon typeId={issue.typeId} />
                                  <button onClick={() => open(issue.id)} className={cn('shrink-0 text-[13px] text-[#6b778c] hover:underline', isDone(state, issue) && 'line-through')}>
                                    {issue.key}
                                  </button>
                                  <button onClick={() => open(issue.id)} title={issue.title} className="min-w-0 flex-1 truncate text-left text-[13px] text-[#172b4d] hover:text-[#0052cc]">
                                    {issue.title}
                                  </button>
                                  {issue.parentId && <span className="hidden rounded-[3px] bg-[#eae6ff] px-1 text-[11px] text-[#403294] md:inline">{findIssue(state, issue.parentId)?.key}</span>}
                                  <span className="hidden sm:inline">
                                    <IssueStatus statusId={issue.statusId} />
                                  </span>
                                  <span className="hidden sm:inline-flex">
                                    <IssuePriority issue={issue} />
                                  </span>
                                  <PointsBadge points={issue.points} />
                                  <UserAvatar userId={issue.assigneeId} />
                                  <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                      <Btn size="icon" variant="subtle" aria-label={`Thao tác ${issue.key}`} className="size-7">
                                        <MoreHorizontal />
                                      </Btn>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" style={FONT}>
                                      <DropdownMenuItem onSelect={() => open(issue.id)}>Xem chi tiết</DropdownMenuItem>
                                      {canSprint && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuLabel className="text-xs text-[#6b778c]">Chuyển tới</DropdownMenuLabel>
                                          {open_
                                            .filter((s) => s.id !== sprint?.id)
                                            .map((s) => (
                                              <DropdownMenuItem key={s.id} onSelect={() => act((st, c) => moveIssueToSprint(st, c, issue.id, s.id), `Đã chuyển ${issue.key} vào ${s.name}`)}>
                                                {s.name}
                                              </DropdownMenuItem>
                                            ))}
                                          {sprint && <DropdownMenuItem onSelect={() => act((st, c) => moveIssueToSprint(st, c, issue.id, null), `Đã đưa ${issue.key} về backlog`)}>Product backlog</DropdownMenuItem>}
                                        </>
                                      )}
                                      {canRank && !filtered && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem disabled={index === 0} onSelect={() => rank(issue.id, sprint?.id ?? null, 'top')}>
                                            Đưa lên đầu
                                          </DropdownMenuItem>
                                          <DropdownMenuItem disabled={index === shown.length - 1} onSelect={() => rank(issue.id, sprint?.id ?? null, 'bottom')}>
                                            Đưa xuống cuối
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {drop.placeholder}
                          {!shown.length && (
                            <li className="px-4 py-5 text-center text-[13px] text-[#6b778c]">
                              {filtered ? 'Không có công việc khớp bộ lọc.' : sprint ? 'Kéo công việc từ backlog vào đây để lên kế hoạch sprint.' : 'Backlog đang trống.'}
                            </li>
                          )}
                        </ul>
                      )}
                    </Droppable>
                    {canCreate && types.length > 0 && <QuickCreate projectId={project.id} sprintId={sprint?.id ?? null} />}
                    {m && sprint?.state === 'ACTIVE' && m.issueCount > 0 && (
                      <div className="flex items-center gap-2 px-2 pt-2 text-[11px] text-[#6b778c]">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[#dfe1e6]">
                          <div className="h-full bg-[#36b37e]" style={{ width: `${(m.doneCount / m.issueCount) * 100}%` }} />
                        </div>
                        {m.doneCount}/{m.issueCount} việc hoàn thành
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </DragDropContext>

      <section className="mt-6">
        <button onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex items-center gap-2 text-sm font-semibold text-[#42526e] hover:text-[#0052cc]">
          <History size={16} /> Lịch sử sprint ({closed.length}) {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showHistory && (
          <div className="mt-2 space-y-2">
            {!closed.length && <p className="text-[13px] text-[#6b778c]">Chưa có sprint đã hoàn tất.</p>}
            {closed.map((s) => (
              <ClosedSprint key={s.id} sprint={s} onOpen={open} />
            ))}
          </div>
        )}
      </section>

      {sprintDialog && <SprintDialog projectId={project.id} sprint={sprintDialog.mode === 'edit' ? sprintDialog.sprint : null} onClose={() => setSprintDialog(null)} />}
      {starting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setStarting(null)}
          danger={false}
          title={`Bắt đầu ${starting.name}?`}
          confirmLabel="Bắt đầu"
          description={
            <div className="space-y-2">
              <p>
                Thời gian: {starting.startDate ? `${formatDate(starting.startDate)} – ${formatDate(starting.endDate)}` : 'chưa đặt; dùng hôm nay và 14 ngày'}.
              </p>
              <p>
                Commitment được chụp lúc bắt đầu: <strong>{sprintMetrics(state, starting.id).totalPoints}</strong> điểm, <strong>{sprintMetrics(state, starting.id).issueCount}</strong> công việc.
              </p>
            </div>
          }
          onConfirm={() => act((s, c) => startSprint(s, c, starting.id), `Đã bắt đầu ${starting.name}`).ok}
        />
      )}
      {completing && <CompleteSprintDialog sprint={completing} onClose={() => setCompleting(null)} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setRemoving(null)}
          title={`Xóa ${removing.name}?`}
          confirmLabel="Xóa sprint"
          description={`${sprintIssueList(state, removing.id).length} công việc trong sprint sẽ trở về product backlog. Công việc không bị xóa.`}
          onConfirm={() => act((s, c) => deleteSprint(s, c, removing.id), `Đã xóa ${removing.name}`).ok}
        />
      )}
    </Screen>
  );
}

/** Tạo nhanh trong nhóm: chỉ tiêu đề, loại mặc định của dự án, ưu tiên Trung bình. */
function QuickCreate({ projectId, sprintId }: { projectId: number; sprintId: number | null }) {
  const { state, act } = useDemo();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const type = projectTypes(state, projectId)[0];
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-1 flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px] text-[#42526e] hover:bg-[#091e420f]">
        <Plus size={15} /> Tạo công việc
      </button>
    );
  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s, c) => createIssue(s, c, projectId, { title, typeId: type.id, priority: 'MEDIUM', sprintId }), 'Đã tạo công việc').ok) setTitle('');
      }}
    >
      <TextInput autoFocus aria-label="Tiêu đề công việc mới" placeholder={`Cần làm gì? (${type?.name})`} value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <Btn type="submit" variant="primary" disabled={!title.trim()}>
        Tạo
      </Btn>
      <Btn variant="subtle" onClick={() => setOpen(false)}>
        Hủy
      </Btn>
    </form>
  );
}

function ClosedSprint({ sprint, onOpen }: { sprint: DemoSprint; onOpen: (id: number) => void }) {
  const { state } = useDemo();
  const [expanded, setExpanded] = useState(false);
  const snap = snapshotOf(state, sprint.id);
  const issues = sprintIssueList(state, sprint.id);
  return (
    <div className="rounded-[3px] border border-[#dfe1e6]">
      <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-[#f4f5f7]">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium">{sprint.name}</span>
        <span className="rounded-[3px] bg-[#dfe1e6] px-1.5 text-[11px] font-bold text-[#42526e]">ĐÃ ĐÓNG</span>
        <span className="text-xs text-[#6b778c]">
          {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)} · {issues.length} công việc
        </span>
        <span className="ml-auto text-xs text-[#6b778c]">
          {snap?.completionAvailable ? `Hoàn thành ${snap.completedPoints} điểm (${snap.completedCount} việc)` : 'Không có số liệu lịch sử'}
        </span>
      </button>
      {expanded && (
        <ul className="border-t border-[#ebecf0]">
          {issues.map((i) => (
            <li key={i.id} className="flex items-center gap-2 border-b border-[#ebecf0] px-3 py-1.5 last:border-b-0">
              <IssueTypeIcon typeId={i.typeId} />
              <button onClick={() => onOpen(i.id)} className="text-[13px] text-[#6b778c] hover:underline">
                {i.key}
              </button>
              <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
              <IssueStatus statusId={i.statusId} />
              {snap?.unfinishedIssueIds.includes(i.id) && <span className="text-[11px] text-[#974f0c]">chưa xong khi đóng</span>}
            </li>
          ))}
          <li className="px-3 py-2 text-xs">
            <Link className="text-[#0052cc] hover:underline" href={`${routes.project(sprint.projectId, 'reports')}?sprintId=${sprint.id}`}>
              Xem báo cáo sprint
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Tạo/sửa sprint: ACTIVE khóa ngày, FUTURE sửa tự do; lỗi hiện tại trường, giữ bản nháp. */
function SprintDialog({ projectId, sprint, onClose }: { projectId: number; sprint: DemoSprint | null; onClose: () => void }) {
  const { state, exec } = useDemo();
  const count = projectSprints(state, projectId).length;
  const [form, setForm] = useState<SprintInput>({
    name: sprint?.name ?? `Sprint ${String(count + 1).padStart(2, '0')}`,
    goal: sprint?.goal ?? '',
    startDate: sprint?.startDate ?? '',
    endDate: sprint?.endDate ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const datesLocked = sprint?.state === 'ACTIVE';
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={sprint ? `Sửa ${sprint.name}` : 'Tạo sprint'}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" type="submit" form="sprint-form">
            {sprint ? 'Lưu' : 'Tạo sprint'}
          </Btn>
        </>
      }
    >
      <form
        id="sprint-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const result = exec((s, c) => (sprint ? updateSprint(s, c, sprint.id, form) : createSprint(s, c, projectId, form)));
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            setError(result.fieldErrors ? '' : result.message);
            return;
          }
          toast.success(sprint ? 'Đã lưu sprint' : 'Đã tạo sprint');
          onClose();
        }}
      >
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        {datesLocked && <InlineAlert tone="info">Sprint đang diễn ra chỉ được sửa tên và mục tiêu.</InlineAlert>}
        <Field label="Tên sprint" required error={errors.name}>
          {(p) => <TextInput {...p} autoFocus maxLength={100} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />}
        </Field>
        <Field label="Mục tiêu" error={errors.goal}>
          {(p) => <TextArea {...p} rows={3} value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ngày bắt đầu" error={errors.startDate}>
            {(p) => <TextInput {...p} type="date" disabled={datesLocked} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />}
          </Field>
          <Field label="Ngày kết thúc" error={errors.endDate}>
            {(p) => <TextInput {...p} type="date" disabled={datesLocked} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/** Hoàn tất: hiện số việc xong/chưa xong; việc chưa xong chuyển về product backlog hoặc sprint FUTURE cùng dự án. */
function CompleteSprintDialog({ sprint, onClose }: { sprint: DemoSprint; onClose: () => void }) {
  const { state, act } = useDemo();
  const [target, setTarget] = useState('');
  const issues = sprintIssueList(state, sprint.id);
  const done = issues.filter((i) => isDone(state, i));
  const futures = projectSprints(state, sprint.projectId).filter((s) => s.state === 'FUTURE');
  const m = sprintMetrics(state, sprint.id);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Hoàn tất ${sprint.name}`}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              if (act((s, c) => completeSprint(s, c, sprint.id, target ? Number(target) : null), `Đã hoàn tất ${sprint.name}`).ok) onClose();
            }}
          >
            Hoàn tất sprint
          </Btn>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[3px] bg-[#e3fcef] p-3">
            <p className="text-2xl font-medium text-[#006644]">{done.length}</p>
            <p className="text-xs text-[#006644]">việc hoàn thành · {m.donePoints} điểm</p>
          </div>
          <div className="rounded-[3px] bg-[#fffae6] p-3">
            <p className="text-2xl font-medium text-[#974f0c]">{issues.length - done.length}</p>
            <p className="text-xs text-[#974f0c]">việc chưa xong · {m.remainingPoints} điểm</p>
          </div>
        </div>
        <p className="text-[#42526e]">Số liệu hoàn thành được chụp trước khi chuyển việc chưa xong. Sprint chuyển sang trạng thái đã đóng và vẫn xem được trong lịch sử.</p>
        {issues.length - done.length > 0 && (
          <Field label="Chuyển việc chưa xong tới">
            {(p) => (
              <SelectInput {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Product backlog</option>
                {futures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
