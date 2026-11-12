'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Grid2X2,
  LayoutGrid,
  ListTodo,
  ListChecks,
  Menu,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlanningPage = 'backlog' | 'board' | 'issues' | 'members' | 'settings';

/**
 * Vẽ khung Backlog cho project thật hoặc preview, chỉ đọc tên/mã/ID dự án từ props.
 * Giao diện theo bố cục Jira: header phẳng, sidebar cố định và nội dung dạng danh sách.
 * Chỉ đổi presentation; giữ đường dẫn project cũ và không gọi API hoặc ghi dữ liệu ở shell.
 */
export function PlanningShell({
  projectName,
  projectKey,
  projectId,
  review = false,
  page = 'backlog',
  children,
}: {
  projectName: string;
  projectKey: string;
  projectId: number;
  review?: boolean;
  page?: PlanningPage;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = `/workspaces/${projectId}/projects/${projectId}`;
  const navClass = 'flex items-center gap-3 rounded-[3px] px-3 py-2 text-[14px]';
  // Review dùng Link thật và provider chung; production vẫn trỏ tới các trang/API có sẵn.
  const planningLinks = [
    { page: 'backlog' as const, name: 'Backlog', icon: ListTodo, href: review ? '/ui-review/backlog' : `/projects/${projectId}/backlog` },
    { page: 'board' as const, name: 'Bảng công việc', icon: LayoutGrid, href: review ? '/ui-review/board' : `${root}?task-view=kanban` },
    { page: 'issues' as const, name: 'Công việc', icon: ListChecks, href: review ? '/ui-review/issues' : `${root}?task-view=table` },
  ];
  const projectLinks = [
    { page: 'members' as const, name: 'Thành viên', icon: Users, href: review ? '/ui-review/members' : root },
    { page: 'settings' as const, name: 'Cài đặt dự án', icon: Settings2, href: review ? '/ui-review/settings' : `${root}/settings` },
  ];
  const navigation = (items: typeof planningLinks | typeof projectLinks) => items.map(item => {
    const Icon = item.icon;
    return <Link key={item.page} href={item.href} aria-current={page === item.page ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={cn(navClass,page === item.page ? 'bg-[#e4e8f0] font-medium text-[#0052cc]' : 'hover:bg-[#ebecf0]')}><Icon size={20}/>{item.name}</Link>;
  });
  return (
    <div
      className="jira-planning min-h-screen bg-white text-[#172b4d]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <header className="sticky top-0 z-30 flex h-14 items-center gap-5 border-b border-[#dfe1e6] bg-white px-4 lg:px-5">
        <button
          aria-label="Mở menu"
          onClick={() => setMobileOpen(true)}
          className="p-1 text-[#42526e] lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Grid2X2 size={19} className="hidden text-[#42526e] lg:block" aria-hidden="true" />
        <div className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.4px]">
          <FolderKanban size={24} className="text-[#0052cc]" />
          <span>Quản lý dự án</span>
        </div>
        <span className="hidden items-center gap-1 text-[14px] text-[#42526e] sm:flex">
          Dự án <ChevronDown size={14} />
        </span>
        <div className="ml-auto flex items-center gap-4">
          {review && (
            <span className="border-l border-[#dfe1e6] pl-3 text-[11px] text-[#6b778c]">
              <span className="hidden sm:inline">Bản xem trước · </span>Dữ liệu mẫu
            </span>
          )}
          <span className="hidden text-[12px] text-[#6b778c] sm:block">{projectKey}</span>
        </div>
      </header>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-[#091e42]/30 lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-14 z-40 w-[240px] overflow-y-auto border-r border-[#dfe1e6] bg-[#f4f5f7] px-3 py-6 transition-transform lg:z-20',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <button
          className="absolute right-3 top-3 p-1 lg:hidden"
          aria-label="Đóng menu dự án"
          onClick={() => setMobileOpen(false)}
        >
          <X size={16} />
        </button>
        <div className="mb-7 flex items-center gap-3 px-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-[3px] bg-[#0052cc] text-white">
            <LayoutGrid size={20} />
          </div>
          <div className="min-w-0">
            <p title={projectName} className="truncate text-[14px] font-semibold">
              {projectName}
            </p>
            <p className="mt-0.5 text-[12px] text-[#6b778c]">Dự án phần mềm</p>
          </div>
        </div>
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase text-[#6b778c]">Lập kế hoạch</p>
        <nav className="space-y-0.5" aria-label="Điều hướng lập kế hoạch">
          {navigation(planningLinks)}
          <div aria-disabled="true" className={cn(navClass, 'text-[#8993a4]')}>
            <BarChart3 size={20} />
            Báo cáo
          </div>
        </nav>
        <div className="mx-3 my-5 border-t border-[#dfe1e6]" />
        <nav className="space-y-0.5" aria-label="Cài đặt dự án">
          {navigation(projectLinks)}
        </nav>
      </aside>
      <main className="min-w-0 lg:ml-[240px]">
        <div className="px-4 pb-10 pt-6 sm:px-8">
          <div className="mb-3 flex items-center gap-2 text-[12px] text-[#6b778c]">
            <span>Dự án</span>
            <ChevronRight size={12} />
            <span className="truncate">{projectName}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
