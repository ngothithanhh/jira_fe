'use client';

import { useState } from 'react';
import { Bug, Check, Circle, SquareCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlanningIssue } from '../types';

export const primaryAction =
  'rounded-[3px] border-transparent bg-[#0052cc] bg-none font-medium shadow-none hover:bg-[#0065ff]';
export const secondaryAction =
  'rounded-[3px] border-transparent bg-[#ebecf0] font-medium text-[#42526e] shadow-none hover:bg-[#dfe1e6]';
export const done = (issue: PlanningIssue) => /^(done|completed|hoàn thành|đã hoàn thành)$/i.test(issue.status);

/** Avatar chữ dùng tên từ API; null hiển thị biểu tượng chưa phân công, không gán user giả cho issue thật. */
export function Person({ name, small = false }: { name: string | null; small?: boolean }) {
  const colors = [
    'bg-[#dceafe] text-blue-700',
    'bg-[#fce7d6] text-orange-800',
    'bg-[#e9defb] text-purple-800',
    'bg-[#d4f2e4] text-green-800',
  ];
  const index = name ? [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length : 0;
  return (
    <span
      title={name ?? 'Chưa phân công'}
      aria-label={name ?? 'Chưa phân công'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-semibold',
        small ? 'size-6 text-[9px]' : 'size-8 text-[10px]',
        name ? colors[index] : 'border-dashed !border-[#d3d9e2] bg-white text-slate-400',
      )}
    >
      {name ? (
        name
          .split(' ')
          .slice(-2)
          .map((part) => part[0])
          .join('')
      ) : (
        <Circle size={12} />
      )}
    </span>
  );
}

/** Badge chỉ hiển thị trạng thái backend; đợt này không tự suy ra cạnh workflow để đổi trạng thái. */
export function Status({ issue }: { issue: PlanningIssue }) {
  const completed = done(issue);
  const active = /progress|thực hiện|doing/i.test(issue.status);
  return (
    <span
      className={cn(
        'max-w-[150px] truncate rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        completed
          ? 'bg-[#e3fcef] text-[#006644]'
          : active
            ? 'bg-[#deebff] text-[#0747a6]'
            : 'bg-[#dfe1e6] text-[#42526e]',
      )}
    >
      {issue.status}
    </span>
  );
}

export function IssueType({ type }: { type: string }) {
  return /bug|lỗi/i.test(type) ? (
    <span title={type} className="rounded bg-[#fce7e7] p-0.5 text-[#c9372c]">
      <Bug size={13} />
    </span>
  ) : (
    <span
      title={type}
      className={cn('rounded p-0.5 text-white', /story/i.test(type) ? 'bg-[#4baf83]' : 'bg-[#4b93e8]')}
    >
      <SquareCheck size={13} />
    </span>
  );
}

/** Panel chỉ sửa mô tả/storyPoints qua controller; không hiển thị comment/attachment giả như dữ liệu thật. */
export function IssueDetails({
  issue,
  busy,
  save,
}: {
  issue: PlanningIssue;
  busy: boolean;
  save: (edit: { description: string; points: number }) => Promise<boolean>;
}) {
  const [description, setDescription] = useState(issue.description);
  const [estimate, setEstimate] = useState(issue.points);
  const changed = description !== issue.description || estimate !== issue.points;
  return (
    <div className="space-y-6">
      <Status issue={issue} />
      <div className="border-y border-[#dfe1e6]">
        <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-2 text-[13px]">
          <span className="text-slate-500">Người phụ trách</span>
          <span className="flex items-center gap-2">
            <Person name={issue.assignee} small />
            {issue.assignee ?? 'Chưa phân công'}
          </span>
        </div>
        <div className="grid grid-cols-[130px_1fr] items-center gap-3 py-2 text-[13px]">
          <span className="text-slate-500">Loại công việc</span>
          <span className="flex items-center gap-2">
            <IssueType type={issue.type} />
            {issue.type}
          </span>
        </div>
        <label className="grid grid-cols-[130px_1fr] items-center gap-3 py-2 text-[13px]">
          <span className="text-slate-500">Story points</span>
          <input
            aria-label="Story points"
            type="number"
            min={0}
            max={10000}
            step={1}
            value={estimate}
            onChange={(event) => setEstimate(Number(event.target.value))}
            className="h-8 w-20 rounded border border-slate-200 px-2 focus:border-blue-400 focus:outline-none"
          />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Mô tả
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={10}
          className="mt-3 w-full rounded-[3px] border border-[#dfe1e6] p-3 text-[13px] font-normal leading-6 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </label>
      <Button
        className={primaryAction}
        disabled={busy || !changed || !Number.isInteger(estimate) || estimate < 0 || estimate > 10000}
        onClick={() => save({ description, points: estimate })}
      >
        <Check size={15} />
        {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
      </Button>
    </div>
  );
}
