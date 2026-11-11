'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  Menu,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Vỏ giao diện dùng chung cho preview và project thật; chỉ các đường dẫn hiện có mới được điều hướng. */
export function PlanningShell({
  projectName,
  projectKey,
  projectId,
  review = false,
  children,
}: {
  projectName: string;
  projectKey: string;
  projectId: number;
  review?: boolean;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = `/workspaces/${projectId}/projects/${projectId}`;
  return (
    <div className="min-h-screen bg-white text-[#172b4d]">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-[#dfe1e6] bg-white px-4 lg:px-6">
        <button
          aria-label="Mở menu"
          onClick={() => setMobileOpen(true)}
          className="rounded p-1.5 hover:bg-slate-100 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-[#0c66e4] text-white">
            <FolderKanban size={19} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">ProjectHub</span>
        </div>
        <span className="mx-1 hidden h-6 border-l border-slate-200 sm:block" />
        <span className="hidden items-center gap-2 text-[13px] font-medium sm:flex">
          Dự án <ChevronDown size={13} />
        </span>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-2 rounded-md bg-[#f7f8f9] px-3 py-1.5 text-xs text-[#626f86] md:flex">
            <Search size={14} /> Quản lý công việc, kết nối đội nhóm
          </span>
          <Bell className="hidden text-[#626f86] sm:block" size={18} aria-hidden="true" />
          <CircleHelp className="hidden text-[#626f86] sm:block" size={18} aria-hidden="true" />
          <span className="grid size-8 place-items-center rounded-full bg-[#dbeafe] text-xs font-semibold text-[#1d4ed8]">
            DA
          </span>
        </div>
      </header>
      {review && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 border-b border-blue-100 bg-[#f0f6ff] px-4 py-2 text-[11px] text-[#355987]">
          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold">XEM TRƯỚC</span> Dữ liệu mẫu để
          duyệt giao diện · Thao tác tại đây không thay đổi dữ liệu dự án
        </div>
      )}
      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed bottom-0 left-0 z-40 w-[232px] overflow-y-auto border-r border-[#dfe1e6] bg-[#f7f8f9] px-3 py-5 transition-transform lg:z-20',
          review ? 'top-[89px]' : 'top-14',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <button
          className="absolute right-3 top-3 rounded p-1 lg:hidden"
          aria-label="Đóng menu dự án"
          onClick={() => setMobileOpen(false)}
        >
          <X size={16} />
        </button>
        <div className="mb-6 flex gap-3 px-2 pt-1">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <LayoutGrid size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{projectName}</p>
            <p className="mt-1 text-[11px] text-[#626f86]">Dự án phần mềm · {projectKey}</p>
          </div>
        </div>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#758195]">
          Lập kế hoạch
        </p>
        <nav className="space-y-1 text-[13px]">
          <div
            className="flex items-center gap-3 rounded-md bg-[#e9f2ff] px-3 py-2.5 font-semibold text-[#0c66e4]"
            aria-current="page"
          >
            <ListTodo size={18} /> Backlog
          </div>
          {review ? (
            <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400">
              <LayoutGrid size={18} /> Bảng công việc
            </div>
          ) : (
            <Link
              href={root}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-200/60"
            >
              <LayoutGrid size={18} /> Bảng công việc
            </Link>
          )}
          <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400">
            <BarChart3 size={18} /> Báo cáo
          </div>
        </nav>
        <div className="my-5 border-t border-[#dfe1e6]" />
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#758195]">
          Dự án
        </p>
        <nav className="space-y-1 text-[13px]">
          {review ? (
            <>
              <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400">
                <Users size={18} /> Thành viên
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400">
                <Settings2 size={18} /> Cài đặt dự án
              </div>
            </>
          ) : (
            <>
              <Link
                href={root}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-200/60"
              >
                <Users size={18} /> Thành viên
              </Link>
              <Link
                href={`${root}/settings`}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-200/60"
              >
                <Settings2 size={18} /> Cài đặt dự án
              </Link>
            </>
          )}
        </nav>
        <div className="mt-20 rounded-lg border border-[#e1e5eb] bg-white p-3">
          <p className="mb-1 text-xs font-medium">Cùng nhau tạo nên điều tốt hơn</p>
          <p className="text-[11px] leading-5 text-[#758195]">
            Chia nhỏ công việc. Giữ đúng mục tiêu. Tiến bộ qua từng sprint.
          </p>
          <div className="mt-3 flex gap-1">
            <span className="h-1 flex-1 rounded bg-blue-500" />
            <span className="h-1 flex-1 rounded bg-blue-200" />
            <span className="h-1 flex-1 rounded bg-slate-100" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 lg:ml-[232px]">
        <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-8 lg:px-9">
          <div className="mb-5 flex items-center gap-2 text-[11px] text-[#626f86]">
            <span>Dự án</span>
            <ChevronRight size={12} />
            <span className="truncate">{projectName}</span>
            <ChevronRight size={12} />
            <span className="font-medium text-[#172b4d]">Backlog</span>
          </div>
          {children}
          {!review && (
            <Button variant="ghost" size="sm" asChild className="mt-8 text-slate-500">
              <Link href={root}>
                <ArrowLeft size={14} /> Về trang dự án
              </Link>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
