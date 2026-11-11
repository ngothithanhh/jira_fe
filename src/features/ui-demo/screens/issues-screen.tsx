'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Btn, ConfirmDialog, EmptyState, FONT, PageHeading, Pagination, PointsBadge, SearchInput, SelectInput, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { IssuePriority, IssueStatus, IssueTypeIcon, Screen, UserAvatar, routes, useCan, useIssueParam, useProject } from '../common';
import { deleteIssue, openSprintOf, PRIORITIES, PRIORITY_LABEL, projectMembers, projectSprints, projectTypes, searchIssues, userLabel, type IssueFilters, type IssueSort } from '../logic';
import { useDemo } from '../provider';
import { CreateIssueDialog } from './create-issue-dialog';
import type { DemoIssue, Priority } from '../types';

const EMPTY_FILTERS: IssueFilters = { keyword: '', statusId: null, typeId: null, assignee: null, priority: null, sprint: null };

/**
 * Bảng công việc của đúng project trên URL: lọc AND, sắp xếp ổn định (tie-break ID), phân trang 10/20/50.
 * Đổi bộ lọc đưa về trang 1; xóa làm trang vượt tổng thì selector kẹp về trang cuối.
 */
export function IssuesScreen() {
  const project = useProject();
  const { state, act } = useDemo();
  const { open } = useIssueParam();
  const canCreate = useCan('CREATE_ISSUE', project.id);
  const canDelete = useCan('DELETE_ISSUE', project.id);
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<IssueSort>('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<DemoIssue | null>(null);

  const result = searchIssues(state, project.id, filters, sort, direction, page, size);
  const total = searchIssues(state, project.id, {}, 'number', 'asc', 1, 1).totalItems;
  const active = Object.values(filters).some((v) => v !== null && v !== '');
  const setFilter = (patch: IssueFilters) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const sortBy = (key: IssueSort) => {
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDirection(key === 'title' || key === 'number' ? 'asc' : 'desc');
    }
    setPage(1);
  };
  const header = (key: IssueSort | null, label: string, className?: string) => (
    <th className={cn(thClass, className)} aria-sort={key && sort === key ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
      {key ? (
        <button onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-[#172b4d]">
          {label}
          {sort === key ? direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
        </button>
      ) : (
        label
      )}
    </th>
  );
  const createButton = canCreate ? (
    <Btn variant="primary" onClick={() => setCreating(true)} disabled={!projectTypes(state, project.id).length}>
      <Plus /> Tạo công việc
    </Btn>
  ) : null;

  return (
    <Screen empty={<EmptyState title="Chưa có công việc" description="Dự án chưa có công việc nào." action={createButton} />}>
      <PageHeading title="Công việc" breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Công việc' }]} actions={createButton} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={filters.keyword ?? ''} onChange={(v) => setFilter({ keyword: v })} placeholder="Mã, tiêu đề hoặc mô tả" label="Tìm công việc" />
        <SelectInput aria-label="Lọc trạng thái" className="w-auto" value={filters.statusId ?? ''} onChange={(e) => setFilter({ statusId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Mọi trạng thái</option>
          {state.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput aria-label="Lọc loại" className="w-auto" value={filters.typeId ?? ''} onChange={(e) => setFilter({ typeId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Mọi loại</option>
          {projectTypes(state, project.id).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          aria-label="Lọc người phụ trách"
          className="w-auto"
          value={filters.assignee ?? ''}
          onChange={(e) => setFilter({ assignee: e.target.value === '' ? null : e.target.value === 'none' ? 'none' : Number(e.target.value) })}
        >
          <option value="">Mọi người phụ trách</option>
          <option value="none">Chưa phân công</option>
          {projectMembers(state, project.id).map((m) => (
            <option key={m.userId} value={m.userId}>
              {userLabel(state, m.userId)}
            </option>
          ))}
        </SelectInput>
        <SelectInput aria-label="Lọc ưu tiên" className="w-auto" value={filters.priority ?? ''} onChange={(e) => setFilter({ priority: (e.target.value || null) as Priority | null })}>
          <option value="">Mọi ưu tiên</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          aria-label="Lọc sprint"
          className="w-auto"
          value={filters.sprint ?? ''}
          onChange={(e) => setFilter({ sprint: e.target.value === '' ? null : e.target.value === 'backlog' ? 'backlog' : Number(e.target.value) })}
        >
          <option value="">Mọi sprint</option>
          <option value="backlog">Chưa thuộc sprint mở</option>
          {projectSprints(state, project.id).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.state === 'CLOSED' ? ' (đã đóng)' : s.state === 'ACTIVE' ? ' (đang diễn ra)' : ''}
            </option>
          ))}
        </SelectInput>
        {active && (
          <Btn variant="link" onClick={() => setFilter(EMPTY_FILTERS)}>
            Xóa bộ lọc
          </Btn>
        )}
      </div>
      {!total ? (
        <EmptyState title="Dự án chưa có công việc" description="Tạo công việc đầu tiên để bắt đầu." action={createButton} />
      ) : !result.totalItems ? (
        <EmptyState title="Không có công việc khớp bộ lọc" description="Thử bỏ bớt điều kiện lọc." action={<Btn onClick={() => setFilter(EMPTY_FILTERS)}>Xóa bộ lọc</Btn>} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  {header('number', 'Mã')}
                  {header('title', 'Tiêu đề', 'min-w-[260px]')}
                  {header(null, 'Trạng thái')}
                  {header('priority', 'Ưu tiên')}
                  {header(null, 'Người phụ trách')}
                  {header(null, 'Điểm', 'text-right')}
                  {header(null, 'Sprint')}
                  {header('updatedAt', 'Cập nhật')}
                  <th className={thClass}>
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((issue) => (
                  <tr key={issue.id} className="h-10 hover:bg-[#f4f5f7]">
                    <td className={cn(tdClass, 'whitespace-nowrap')}>
                      <span className="flex items-center gap-2">
                        <IssueTypeIcon typeId={issue.typeId} />
                        <button className="text-[#0052cc] hover:underline" onClick={() => open(issue.id)}>
                          {issue.key}
                        </button>
                      </span>
                    </td>
                    <td className={tdClass}>
                      <button className="max-w-[420px] truncate text-left hover:text-[#0052cc] hover:underline" title={issue.title} onClick={() => open(issue.id)}>
                        {issue.title}
                      </button>
                    </td>
                    <td className={tdClass}>
                      <IssueStatus statusId={issue.statusId} />
                    </td>
                    <td className={tdClass}>
                      <span className="flex items-center gap-1">
                        <IssuePriority issue={issue} />
                        <span className="hidden xl:inline">{PRIORITY_LABEL[issue.priority]}</span>
                      </span>
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap')}>
                      <span className="flex items-center gap-2">
                        <UserAvatar userId={issue.assigneeId} />
                        {issue.assigneeId === null ? <span className="text-[#6b778c]">Chưa phân công</span> : userLabel(state, issue.assigneeId)}
                      </span>
                    </td>
                    <td className={cn(tdClass, 'text-right')}>
                      <PointsBadge points={issue.points} />
                    </td>
                    <td className={cn(tdClass, 'whitespace-nowrap')}>{openSprintOf(state, issue.id)?.name ?? <span className="text-[#6b778c]">—</span>}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap text-[#6b778c]')}>{formatDate(issue.updatedAt)}</td>
                    <td className={cn(tdClass, 'w-10')}>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Btn size="icon" variant="subtle" aria-label={`Thao tác ${issue.key}`}>
                            <MoreHorizontal />
                          </Btn>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" style={FONT}>
                          <DropdownMenuItem onSelect={() => open(issue.id)}>Xem chi tiết</DropdownMenuItem>
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-[#de350b]" onSelect={() => setRemoving(issue)}>
                                Xóa…
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            totalItems={result.totalItems}
            size={size}
            onPage={setPage}
            onSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </>
      )}
      <CreateIssueDialog open={creating} onOpenChange={setCreating} projectId={project.id} onCreated={open} />
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setRemoving(null)}
          title={`Xóa ${removing.key}?`}
          requireText={removing.key}
          confirmLabel="Xóa công việc"
          description="Công việc và bình luận của nó sẽ bị xóa khỏi dữ liệu mẫu. Còn việc con hoặc tệp đính kèm thì thao tác bị chặn."
          onConfirm={() => {
            const r = act((s, c) => deleteIssue(s, c, removing.id, removing.version), `Đã xóa ${removing.key}`);
            // Trang vượt tổng sau khi xóa: dùng trang đã được selector kẹp.
            if (r.ok) setPage(searchIssues(r.state, project.id, filters, sort, direction, page, size).page);
            return r.ok;
          }}
        />
      )}
    </Screen>
  );
}
