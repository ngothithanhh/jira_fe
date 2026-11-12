'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Equal,
  GripVertical,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  SquareCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Person, Status, IssueType, IssueDetails, primaryAction, secondaryAction, done } from './planning-parts';
import type { PlanningActions, PlanningData, PlanningIssue, PlanningSprint } from '../types';

const fieldClass =
  'h-9 w-full rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] px-3 text-sm text-[#172b4d] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500';
// Nút chỉ đổi cách hiển thị ở màn lập kế hoạch; giữ trạng thái disabled/focus và callback sẵn có.
const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const points = (issues: PlanningIssue[]) => issues.reduce((total, issue) => total + issue.points, 0);
const groupKey = (id: number | null) => (id === null ? 'backlog' : `sprint-${id}`);
const groupId = (value: string) => (value === 'backlog' ? null : Number(value.replace('sprint-', '')));

/** Các thao tác gọi controller thật hoặc controller preview được truyền vào; view không tự gọi API hay fallback mock. */
export function BacklogView({
  data,
  actions,
  busy = false,
  permissions = { create: true, edit: true, sprint: true, rank: true },
  onOpenIssue,
  notify = true,
  writeDisabled = false,
  onManageSprint,
}: {
  data: PlanningData;
  actions: PlanningActions;
  busy?: boolean;
  permissions?: { create: boolean; edit: boolean; sprint: boolean; rank: boolean };
  onOpenIssue?: (id: number) => void;
  notify?: boolean;
  writeDisabled?: boolean;
  onManageSprint?: (sprintId: number, operation: 'edit' | 'delete') => void;
}) {
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('');
  const [unfinishedOnly, setUnfinishedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'issue' | 'sprint' | null>(null);
  const [complete, setComplete] = useState<PlanningSprint | null>(null);
  const allIssues = [...data.sprints.flatMap((sprint) => sprint.issues), ...data.backlog];
  const selected = allIssues.find((issue) => issue.id === selectedId);
  const people = useMemo(
    () =>
      [
        ...new Set(allIssues.map((issue) => issue.assignee).filter((value): value is string => !!value)),
      ].sort(),
    [data],
  );
  const filtered = !!search.trim() || !!person || unfinishedOnly;
  const visible = (issue: PlanningIssue) =>
    (!search.trim() || normalized(`${issue.key} ${issue.title}`).includes(normalized(search.trim()))) &&
    (!person || (person === '__none' ? !issue.assignee : issue.assignee === person)) &&
    (!unfinishedOnly || !done(issue));
  const groups = [
    ...data.sprints.map((sprint) => ({
      id: sprint.id as number | null,
      name: sprint.name,
      issues: sprint.issues,
      sprint,
    })),
    { id: null, name: 'Backlog', issues: data.backlog, sprint: null },
  ];
  // Controller chịu trách nhiệm rollback/refetch; view chỉ hiện lỗi để không báo thành công khi mutation thất bại.
  async function execute(action: () => Promise<void>, message?: string) {
    if (writeDisabled) return false;
    try {
      await action();
      if (message && notify) toast.success(message);
      return true;
    } catch (error) {
      if (notify) toast.error(error instanceof Error ? error.message : 'Không thể thực hiện thao tác. Vui lòng thử lại.');
      return false;
    }
  }
  function toggle(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  // Reorder chỉ dùng danh sách đầy đủ; khi lọc, thao tác kéo bị tắt để không vô tình gửi scope thiếu.
  async function dragEnd(result: DropResult) {
    if (!result.destination || filtered || busy) return;
    const from = groupId(result.source.droppableId),
      to = groupId(result.destination.droppableId);
    if (from !== to) {
      if (!permissions.sprint) return;
      await execute(() => actions.moveIssue(Number(result.draggableId), from, to), 'Đã chuyển công việc');
      return;
    }
    if (result.source.index === result.destination.index) return;
    if (from === null ? !permissions.rank : !permissions.sprint) return;
    const ids = [...(groups.find((group) => group.id === from)?.issues ?? [])].map((issue) => issue.id);
    const [id] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, id);
    await execute(() => actions.reorder(from, ids));
  }
  return (
    <>
      {/* Tiêu đề và hành động chính theo bố cục Jira; tạo sprint nằm sau nhóm backlog để không lặp CTA. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium leading-8 text-[#172b4d]">Backlog</h1>
        <div className="flex items-center gap-2">
          <Button
            className={primaryAction}
            size="sm"
            onClick={() => setDialog('issue')}
            disabled={busy || !permissions.create || !data.issueTypes.length}
          >
            <Plus /> Tạo công việc
          </Button>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[220px]">
          <Search size={15} className="absolute left-3 top-2.5 text-[#758195]" />
          <input
            aria-label="Tìm công việc"
            placeholder="Tìm mã hoặc tên công việc"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full rounded-[3px] border border-[#dfe1e6] bg-[#fafbfc] pl-9 pr-8 text-[13px] outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button
              aria-label="Xóa tìm kiếm"
              onClick={() => setSearch('')}
              className="absolute right-2 top-2.5 text-slate-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="ml-2 flex -space-x-2" aria-label="Thành viên được phân công">
          {people.slice(0, 4).map((name) => (
            <Person key={name} name={name} />
          ))}
          {people.length > 4 && (
            <span className="grid size-8 place-items-center rounded-full border-2 border-white bg-slate-100 text-[10px]">
              +{people.length - 4}
            </span>
          )}
        </div>
        <select
          aria-label="Lọc người phụ trách"
          value={person}
          onChange={(event) => setPerson(event.target.value)}
          className="h-8 max-w-[180px] rounded-[3px] border border-transparent bg-white px-2 text-[13px] outline-none hover:bg-[#ebecf0] focus:border-blue-400"
        >
          <option value="">Người phụ trách</option>
          <option value="__none">Chưa phân công</option>
          {people.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button
          onClick={() => setUnfinishedOnly((value) => !value)}
          aria-pressed={unfinishedOnly}
          className={cn(
            'flex h-8 items-center gap-2 rounded-[3px] px-2.5 text-[13px]',
            unfinishedOnly ? 'bg-blue-50 text-blue-700' : 'text-[#626f86] hover:bg-slate-50',
          )}
        >
          <ListFilter size={14} /> Chưa hoàn thành
        </button>
        {filtered && (
          <button
            className="text-[11px] text-blue-600 hover:underline"
            onClick={() => {
              setSearch('');
              setPerson('');
              setUnfinishedOnly(false);
            }}
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
      {!data.issueTypes.length && (
        <p
          role="status"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
        >
          Dự án chưa có loại công việc. Hãy cấu hình loại công việc trước khi tạo mới.
        </p>
      )}
      {filtered && (
        <p className="mb-3 text-[11px] text-slate-500">Bỏ bộ lọc để kéo và sắp xếp toàn bộ backlog.</p>
      )}
      <DragDropContext onDragEnd={dragEnd}>
        <div className="space-y-6">
          {groups.map((group) => {
            const key = groupKey(group.id),
              closed = collapsed.has(key),
              shown = group.issues.filter(visible);
            const sprint = group.sprint,
              completed = group.issues.filter(done).length;
            return (
              <section key={key} aria-label={group.name} className="bg-[#f4f5f7]">
                <div className="flex min-h-11 flex-wrap items-center gap-2 px-2 py-2 sm:px-3">
                  <button
                    onClick={() => toggle(key)}
                    aria-expanded={!closed}
                    aria-label={`${closed ? 'Mở' : 'Thu gọn'} ${group.name}`}
                    className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-blue-500"
                  >
                    {closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span className="text-[14px] font-semibold">{group.name}</span>
                  </button>
                  <span className="px-1 text-[12px] text-[#6b778c]">
                    {filtered ? `${shown.length}/${group.issues.length}` : group.issues.length} công việc
                  </span>
                  {sprint?.state === 'ACTIVE' && (
                    <span className="rounded-[3px] bg-[#dfe1e6] px-1.5 py-0.5 text-[10px] font-semibold text-[#42526e]">
                      ĐANG DIỄN RA
                    </span>
                  )}
                  {sprint?.startDate && (
                    <span className="hidden items-center gap-1.5 text-[11px] text-[#6b778c] xl:flex">
                      <CalendarDays size={12} />
                      {dateLabel(sprint.startDate)} – {dateLabel(sprint.endDate)}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <span
                      title="Tổng story points"
                      className="min-w-6 rounded-full bg-[#dfe1e6] px-1.5 py-0.5 text-center text-[11px] font-medium text-[#42526e]"
                    >
                      {points(group.issues)}
                    </span>
                    {sprint && onManageSprint && permissions.sprint && (
                      <>
                        <Button variant="secondary" className={secondaryAction} size="xs" disabled={busy || writeDisabled}
                          onClick={() => onManageSprint(sprint.id, 'edit')}>Sửa sprint</Button>
                        {sprint.state === 'FUTURE' && (
                          <Button variant="secondary" className={secondaryAction} size="xs" disabled={busy || writeDisabled}
                            onClick={() => onManageSprint(sprint.id, 'delete')}>Xóa sprint</Button>
                        )}
                      </>
                    )}
                    {sprint?.state === 'ACTIVE' && (
                      <Button
                        variant="secondary"
                        className={secondaryAction}
                        size="xs"
                        onClick={() => setComplete(sprint)}
                        disabled={busy || !permissions.sprint}
                      >
                        Hoàn tất sprint
                      </Button>
                    )}
                    {sprint?.state === 'FUTURE' && (
                      <Button
                        variant="secondary"
                        className={secondaryAction}
                        size="xs"
                        disabled={
                          busy || !permissions.sprint || !group.issues.length || data.sprints.some((item) => item.state === 'ACTIVE')
                        }
                        title={
                          data.sprints.some((item) => item.state === 'ACTIVE')
                            ? 'Hoàn tất sprint đang diễn ra trước khi bắt đầu sprint mới'
                            : undefined
                        }
                        onClick={() => execute(() => actions.startSprint(sprint.id), 'Đã bắt đầu sprint')}
                      >
                        Bắt đầu sprint
                      </Button>
                    )}
                  </div>
                </div>
                {!closed && (
                  <>
                    {sprint?.goal && (
                      <p className="px-8 pb-2 text-[12px] text-[#6b778c]">
                        <span className="font-medium">Mục tiêu: </span>
                        {sprint.goal}
                      </p>
                    )}
                    <Droppable droppableId={key} isDropDisabled={filtered || busy || (group.id === null ? !permissions.rank && !permissions.sprint : !permissions.sprint)}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            'mx-2 min-h-[38px] pb-2 transition-colors',
                            snapshot.isDraggingOver && 'bg-blue-50/70',
                          )}
                        >
                          {/* Handle là button để dùng được bàn phím; cho phép dnd nhận sự kiện từ đúng button handle này. */}
                          {shown.map((issue, index) => (
                            <Draggable
                              key={issue.id}
                              draggableId={String(issue.id)}
                              index={index}
                              isDragDisabled={filtered || busy || (group.id === null ? !permissions.rank && !permissions.sprint : !permissions.sprint)}
                              disableInteractiveElementBlocking
                            >
                              {(drag, dragSnapshot) => (
                                <div
                                  ref={drag.innerRef}
                                  {...drag.draggableProps}
                                  className={cn(
                                    'group flex min-h-[44px] items-center gap-2 border-b border-[#ebecf0] bg-white px-1.5 sm:min-h-[36px] sm:gap-2.5 sm:px-2',
                                    dragSnapshot.isDragging
                                      ? 'border border-blue-300 shadow-md'
                                      : 'hover:bg-[#ebf2f9]',
                                  )}
                                >
                                  <button
                                    type="button"
                                    {...drag.dragHandleProps}
                                    aria-label={`Sắp xếp ${issue.key}`}
                                    className={cn(
                                      'shrink-0 p-0.5 text-[#9aa4b2]',
                                      filtered || busy
                                        ? 'invisible'
                                        : 'opacity-30 group-hover:opacity-100 focus:opacity-100',
                                    )}
                                  >
                                    <GripVertical size={14} />
                                  </button>
                                  <IssueType type={issue.type} />
                                  <button
                                    className="min-w-0 flex-1 text-left sm:flex sm:items-center sm:gap-3"
                                    onClick={() => onOpenIssue ? onOpenIssue(issue.id) : setSelectedId(issue.id)}
                                  >
                                    <span
                                      className={cn(
                                        'mr-2 inline-block shrink-0 text-[12px] text-[#6b778c] sm:mr-0',
                                        done(issue) && 'line-through',
                                      )}
                                    >
                                      {issue.key}
                                    </span>
                                    <span
                                      className={cn(
                                        'text-[13px] leading-6 text-[#172b4d] hover:text-[#0052cc] sm:truncate',
                                        done(issue) && 'text-[#758195]',
                                      )}
                                    >
                                      {issue.title}
                                    </span>
                                  </button>
                                  <span className="hidden shrink-0 sm:block">
                                    <Status issue={issue} />
                                  </span>
                                  <span
                                    title={`Ưu tiên: ${issue.priority}`}
                                    className={cn(
                                      'hidden shrink-0 sm:block',
                                      /high/i.test(issue.priority)
                                        ? 'text-[#d54c42]'
                                        : /low/i.test(issue.priority)
                                          ? 'text-blue-500'
                                          : 'text-[#a2aab6]',
                                    )}
                                  >
                                    {/high/i.test(issue.priority) ? (
                                      <ArrowUp size={15} />
                                    ) : /low/i.test(issue.priority) ? (
                                      <ArrowDown size={15} />
                                    ) : (
                                      <Equal size={15} />
                                    )}
                                  </span>
                                  <span className="grid min-w-5 place-items-center rounded-full bg-[#dfe1e6] px-1 py-0.5 text-[10px] font-medium text-[#42526e]">
                                    {issue.points || '—'}
                                  </span>
                                  <Person name={issue.assignee} small />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="rounded p-1 text-[#758195] hover:bg-slate-200"
                                        aria-label={`Thao tác ${issue.key}`}
                                        disabled={busy}
                                      >
                                        <MoreHorizontal size={16} />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onSelect={() => onOpenIssue ? onOpenIssue(issue.id) : setSelectedId(issue.id)}>
                                        Xem chi tiết
                                      </DropdownMenuItem>
                                      {group.id !== null ? (
                                        <DropdownMenuItem
                                          disabled={!permissions.sprint || busy}
                                          onSelect={() =>
                                            execute(
                                              () => actions.moveIssue(issue.id, group.id, null),
                                              'Đã đưa công việc về backlog',
                                            )
                                          }
                                        >
                                          Đưa về backlog
                                        </DropdownMenuItem>
                                      ) : (
                                        data.sprints.map((target) => (
                                          <DropdownMenuItem
                                            disabled={!permissions.sprint || busy}
                                            key={target.id}
                                            onSelect={() =>
                                              execute(
                                                () => actions.moveIssue(issue.id, null, target.id),
                                                `Đã chuyển tới ${target.name}`,
                                              )
                                            }
                                          >
                                            Chuyển tới {target.name}
                                          </DropdownMenuItem>
                                        ))
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {!shown.length && (
                            <div className="px-6 py-8 text-center">
                              <p className="text-xs text-[#626f86]">
                                {filtered
                                  ? 'Không có công việc khớp bộ lọc.'
                                  : sprint
                                    ? 'Sprint chưa có công việc. Kéo từ backlog để bắt đầu lên kế hoạch.'
                                    : 'Backlog đang trống. Tạo công việc đầu tiên cho dự án.'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                    {group.id === null && (
                      <button
                        disabled={busy || !permissions.create || !data.issueTypes.length}
                        className="flex w-full items-center gap-2 px-8 pb-3 pt-1 text-[13px] text-[#6b778c] hover:text-[#0052cc] disabled:opacity-40"
                        onClick={() => setDialog('issue')}
                      >
                        <Plus size={15} /> Tạo công việc
                      </button>
                    )}
                    {sprint?.state === 'ACTIVE' && group.issues.length > 0 && (
                      <div className="flex items-center gap-3 px-4 pb-2 text-[#6b778c]">
                        <span className="text-[10px] text-[#758195]">
                          {completed}/{group.issues.length} hoàn thành
                        </span>
                        <div className="h-1 max-w-[160px] flex-1 overflow-hidden rounded-full bg-[#ebedf1]">
                          <div
                            style={{ width: `${(completed / group.issues.length) * 100}%` }}
                            className="h-full rounded-full bg-[#4baf83]"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </DragDropContext>
      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          className={secondaryAction}
          size="sm"
          onClick={() => setDialog('sprint')}
          disabled={busy || !permissions.sprint}
        >
          Tạo sprint
        </Button>
      </div>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent
          className="max-w-[480px] rounded-[3px] sm:rounded-[3px]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          <DialogHeader>
            <DialogTitle>{dialog === 'sprint' ? 'Tạo sprint mới' : 'Tạo công việc'}</DialogTitle>
            <DialogDescription>
              {writeDisabled ? 'Dữ liệu chưa tải được. Đóng hộp thoại và thử tải lại.' : dialog === 'sprint'
                ? 'Nhập tên, mục tiêu và thời gian của sprint.'
                : 'Công việc mới sẽ được thêm vào backlog của dự án.'}
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <PlanningForm
              key={dialog}
              mode={dialog}
              data={data}
              busy={busy}
              writeDisabled={writeDisabled}
              onCancel={() => setDialog(null)}
              onSubmit={async (form) => {
                const success =
                  dialog === 'sprint'
                    ? await execute(
                        () =>
                          actions.createSprint({
                            name: String(form.get('name')),
                            goal: String(form.get('goal')),
                            startDate: String(form.get('startDate')),
                            endDate: String(form.get('endDate')),
                          }),
                        'Đã tạo sprint',
                      )
                    : await execute(
                        () =>
                          actions.createIssue({
                            title: String(form.get('name')),
                            typeId: Number(form.get('typeId')),
                            priority: String(form.get('priority')),
                          }),
                        'Đã tạo công việc',
                      );
                if (success) setDialog(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!complete}
        onOpenChange={(open) => {
          if (!open && !busy) setComplete(null);
        }}
      >
        <DialogContent
          className="max-w-[480px] rounded-[3px] sm:rounded-[3px]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          <DialogHeader>
            <DialogTitle>Hoàn tất {complete?.name}</DialogTitle>
            <DialogDescription>{writeDisabled ? 'Dữ liệu chưa tải được. Đóng hộp thoại và thử tải lại.' : 'Công việc đã hoàn thành được giữ lại trong lịch sử sprint.'}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!complete) return;
              const target = new FormData(event.currentTarget).get('target');
              if (
                await execute(
                  () => actions.completeSprint(complete.id, target ? Number(target) : null),
                  'Đã hoàn tất sprint',
                )
              )
                setComplete(null);
            }}
          >
            <p className="mb-4 text-sm text-slate-600">
              Có <strong>{complete?.issues.filter((issue) => !done(issue)).length}</strong> công việc chưa
              hoàn thành. Bạn muốn chuyển chúng đến đâu?
            </p>
            <label className="text-xs font-medium">
              Chuyển công việc chưa hoàn thành
              <select name="target" className={`${fieldClass} mt-2`}>
                <option value="">Product backlog</option>
                {data.sprints
                  .filter((sprint) => sprint.id !== complete?.id && sprint.state === 'FUTURE')
                  .map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
              </select>
            </label>
            <DialogFooter className="mt-6">
              <Button
                className={secondaryAction}
                type="button"
                variant="secondary"
                onClick={() => setComplete(null)}
                disabled={busy}
              >
                Hủy
              </Button>
              <Button className={primaryAction} disabled={busy || writeDisabled}>
                Hoàn tất sprint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto px-6 sm:w-[540px] sm:max-w-[540px]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          <SheetHeader className="mb-7 text-left">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded bg-blue-50 p-1 text-blue-600">
                <SquareCheck size={15} />
              </span>
              <span className="text-xs font-medium text-slate-500">{selected?.key}</span>
            </div>
            <SheetTitle className="pr-5 text-xl leading-8 text-[#172b4d]">{selected?.title}</SheetTitle>
            <SheetDescription>Chi tiết công việc</SheetDescription>
          </SheetHeader>
          {selected && (
            <IssueDetails
              key={selected.id}
              issue={selected}
              busy={busy}
              save={(edit) => execute(() => actions.editIssue(selected.id, edit), 'Đã lưu thay đổi')}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Form dùng ID loại được cấu hình trong project; trình duyệt kiểm trường bắt buộc/ngày trước khi gửi controller. */
function PlanningForm({
  mode,
  data,
  busy,
  writeDisabled,
  onSubmit,
  onCancel,
}: {
  mode: 'sprint' | 'issue';
  data: PlanningData;
  busy: boolean;
  writeDisabled: boolean;
  onSubmit: (form: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const defaultType = data.issueTypes.find((type) => type.isDefault)?.id ?? data.issueTypes[0]?.id;
  return (
    <form
      className="mt-2 space-y-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <label className="block text-xs font-medium text-[#44546f]">
        {mode === 'sprint' ? 'Tên sprint' : 'Tên công việc'} <span className="text-red-500">*</span>
        <input
          name="name"
          required
          maxLength={mode === 'sprint' ? 100 : 255}
          placeholder={
            mode === 'sprint'
              ? `Sprint ${String(data.sprints.length + 1).padStart(2, '0')}`
              : 'Nhóm cần hoàn thành điều gì?'
          }
          className={`${fieldClass} mt-2`}
          autoFocus
        />
      </label>
      {mode === 'sprint' ? (
        <>
          <label className="block text-xs font-medium text-[#44546f]">
            Mục tiêu sprint
            <textarea
              name="goal"
              placeholder="Nhập mục tiêu sprint"
              rows={3}
              className={`${fieldClass} mt-2 h-auto py-3`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-[#44546f]">
              Ngày bắt đầu
              <input type="date" name="startDate" className={`${fieldClass} mt-2 px-2`} />
            </label>
            <label className="text-xs font-medium text-[#44546f]">
              Ngày kết thúc
              <input type="date" name="endDate" className={`${fieldClass} mt-2 px-2`} />
            </label>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-[#44546f]">
            Loại công việc
            <select name="typeId" defaultValue={defaultType} required className={`${fieldClass} mt-2`}>
              {data.issueTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-[#44546f]">
            Ưu tiên
            <select name="priority" defaultValue="MEDIUM" className={`${fieldClass} mt-2`}>
              <option value="HIGHEST">Cao nhất</option>
              <option value="HIGH">Cao</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="LOW">Thấp</option>
              <option value="LOWEST">Thấp nhất</option>
            </select>
          </label>
        </div>
      )}
      <DialogFooter className="!mt-6 border-t pt-4">
        <Button
          className={secondaryAction}
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Hủy
        </Button>
        <Button className={primaryAction} disabled={busy || writeDisabled || (mode === 'issue' && !data.issueTypes.length)}>
          {busy ? 'Đang lưu…' : mode === 'sprint' ? 'Tạo sprint' : 'Tạo công việc'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function dateLabel(value: string | null) {
  if (!value) return 'Chưa đặt ngày';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa đặt ngày'
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
}
