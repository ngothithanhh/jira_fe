'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  FolderKanban,
  History,
  Home,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Settings2,
  Shapes,
  ShieldCheck,
  Tags,
  UserCircle,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Btn, FONT, StateView, formatDate } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { routes } from '../common';
import { findIssue, findProject, findRole, inbox, isAdmin, markAllRead, markNotification, signOut, switchPersona, unreadCount, visibleProjects } from '../logic';
import { useDemo, type Scenario } from '../provider';
import { CreateIssueDialog } from '../screens/create-issue-dialog';

type NavItem = { href: string; label: string; icon: typeof Home; match?: (path: string) => boolean };

/** Lấy projectId từ URL /ui-review/projects/{id}/... ; sidebar dự án chỉ hiện khi project tồn tại. */
function projectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/ui-review\/projects\/(\d+)(\/|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * Khung chung: header 56px, sidebar 240px (drawer trên mobile), nội dung nền trắng.
 * Sidebar đổi theo ngữ cảnh: dự án, quản trị hoặc điều hướng chung. Shell không ghi dữ liệu ngoài các action demo.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, me } = useDemo();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const projectId = projectIdFromPath(pathname);
  const project = projectId ? findProject(state, projectId) : undefined;
  const inAdmin = pathname.startsWith('/ui-review/admin');

  // Chọn link trong drawer thì đóng drawer.
  useEffect(() => setDrawer(false), [pathname]);

  const projectNav: NavItem[] = project
    ? [
        { href: routes.project(project.id, 'overview'), label: 'Tổng quan', icon: LayoutDashboard },
        { href: routes.project(project.id, 'backlog'), label: 'Backlog', icon: ListTodo },
        { href: routes.project(project.id, 'board'), label: 'Bảng công việc', icon: KanbanSquare },
        { href: routes.project(project.id, 'issues'), label: 'Công việc', icon: ListChecks },
        { href: routes.project(project.id, 'reports'), label: 'Báo cáo', icon: BarChart3 },
      ]
    : [];
  const projectSettings: NavItem[] = project
    ? [
        { href: routes.project(project.id, 'members'), label: 'Thành viên', icon: Users },
        { href: routes.project(project.id, 'settings'), label: 'Cài đặt dự án', icon: Settings2 },
      ]
    : [];
  const adminNav: NavItem[] = [
    { href: routes.admin(), label: 'Tổng quan', icon: LayoutDashboard, match: (p) => p === '/ui-review/admin' },
    { href: routes.admin('users'), label: 'Người dùng', icon: Users },
    { href: routes.admin('roles'), label: 'Vai trò & quyền', icon: ShieldCheck },
    { href: routes.admin('issue-types'), label: 'Loại công việc', icon: Shapes },
    { href: routes.admin('statuses'), label: 'Trạng thái', icon: Tags },
    { href: routes.admin('workflows'), label: 'Workflow', icon: Workflow },
    { href: routes.admin('audit'), label: 'Nhật ký', icon: History },
  ];
  const globalNav: NavItem[] = [
    { href: routes.projects, label: 'Dự án', icon: FolderKanban, match: (p) => p === routes.projects },
    { href: routes.notifications, label: 'Thông báo', icon: Bell },
    { href: routes.account, label: 'Hồ sơ cá nhân', icon: UserCircle },
    ...(isAdmin(state, me?.id) ? [{ href: routes.admin(), label: 'Quản trị hệ thống', icon: ShieldCheck }] : []),
  ];

  const renderNav = (items: NavItem[], label: string) => (
    <nav aria-label={label} className="space-y-0.5">
      {items.map((item) => {
        const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm',
              active ? 'bg-[#e9f2ff] font-medium text-[#0052cc]' : 'text-[#42526e] hover:bg-[#091e420f]',
            )}
          >
            <Icon size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <>
      {project ? (
        <>
          <div className="mb-6 flex items-center gap-3 px-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-[3px] bg-[#0052cc] text-xs font-bold text-white">{project.key.slice(0, 2)}</div>
            <div className="min-w-0">
              <p title={project.name} className="truncate text-sm font-semibold text-[#172b4d]">
                {project.name}
              </p>
              <p className="text-xs text-[#6b778c]">Dự án phần mềm · {project.key}</p>
            </div>
          </div>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase text-[#6b778c]">Lập kế hoạch</p>
          {renderNav(projectNav, 'Điều hướng dự án')}
          <div className="mx-3 my-4 border-t border-[#dfe1e6]" />
          {renderNav(projectSettings, 'Quản lý dự án')}
          <div className="mx-3 my-4 border-t border-[#dfe1e6]" />
          <Link href={routes.projects} className="flex h-9 items-center gap-3 rounded-[3px] px-3 text-[13px] text-[#6b778c] hover:bg-[#091e420f]">
            <Home size={16} aria-hidden /> Tất cả dự án
          </Link>
        </>
      ) : inAdmin ? (
        <>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase text-[#6b778c]">Quản trị hệ thống</p>
          {renderNav(adminNav, 'Điều hướng quản trị')}
          <div className="mx-3 my-4 border-t border-[#dfe1e6]" />
          <Link href={routes.projects} className="flex h-9 items-center gap-3 rounded-[3px] px-3 text-[13px] text-[#6b778c] hover:bg-[#091e420f]">
            <Home size={16} aria-hidden /> Về danh sách dự án
          </Link>
        </>
      ) : (
        renderNav(globalNav, 'Điều hướng chung')
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-white text-[#172b4d]" style={FONT}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Bỏ qua tới nội dung
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[#dfe1e6] bg-white px-3 sm:gap-3 lg:px-4">
        <button aria-label="Mở menu" aria-expanded={drawer} onClick={() => setDrawer(true)} className="rounded-[3px] p-1.5 text-[#42526e] hover:bg-[#091e420f] lg:hidden">
          <Menu size={20} />
        </button>
        <Link href={routes.projects} className="flex shrink-0 items-center gap-2 text-[17px] font-semibold tracking-[-0.3px] text-[#172b4d]">
          <ClipboardList size={22} className="text-[#0052cc]" aria-hidden />
          <span className="hidden sm:inline">Quản lý dự án</span>
        </Link>
        <ProjectSwitcher />
        <Btn variant="primary" onClick={() => setCreating(true)} disabled={!me?.enabled} aria-label="Tạo công việc">
          <Plus /> <span className="hidden sm:inline">Tạo</span>
        </Btn>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden rounded-[3px] border border-[#dfe1e6] px-1.5 py-0.5 text-[11px] font-medium text-[#6b778c] md:inline">Dữ liệu mẫu</span>
          <DemoTools />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
      {drawer && <button className="fixed inset-0 z-40 bg-[#091e42]/40 lg:hidden" aria-label="Đóng menu" onClick={() => setDrawer(false)} />}
      <aside
        aria-label="Thanh bên"
        className={cn(
          'fixed bottom-0 left-0 top-14 z-40 w-[240px] overflow-y-auto border-r border-[#dfe1e6] bg-[#f4f5f7] px-2 py-5 transition-transform lg:z-20 lg:translate-x-0',
          drawer ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button className="absolute right-2 top-2 rounded p-1 text-[#42526e] lg:hidden" aria-label="Đóng menu" onClick={() => setDrawer(false)}>
          <X size={16} />
        </button>
        {sidebar}
      </aside>
      <main id="main" className="min-w-0 lg:ml-[240px]">
        <div className="mx-auto max-w-[1600px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
          {!me ? (
            <StateView kind="unauthenticated" action={<Link className="text-sm font-medium text-[#0052cc] hover:underline" href={routes.signIn}>Tới trang đăng nhập</Link>} />
          ) : !me.enabled ? (
            <StateView kind="forbidden" title="Tài khoản đã bị khóa" description="Persona này đang bị khóa. Đổi persona trong Công cụ demo hoặc nhờ quản trị viên mở khóa." />
          ) : (
            children
          )}
        </div>
      </main>
      <CreateIssueDialog open={creating} onOpenChange={setCreating} projectId={project && me ? project.id : undefined} />
    </div>
  );
}

/** Chọn dự án: chỉ liệt kê dự án persona được xem; điều hướng sang trang tổng quan của dự án. */
function ProjectSwitcher() {
  const { state, me } = useDemo();
  const router = useRouter();
  const projects = visibleProjects(state, me?.id);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="hidden h-8 items-center gap-1 rounded-[3px] px-2 text-sm font-medium text-[#42526e] hover:bg-[#091e420f] data-[state=open]:bg-[#e9f2ff] data-[state=open]:text-[#0052cc] md:flex">
          Dự án <ChevronDown size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-[3px]" style={FONT}>
        <DropdownMenuLabel className="text-xs text-[#6b778c]">Dự án của bạn</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => router.push(routes.project(p.id))} className="gap-2">
            <span className="grid size-6 place-items-center rounded-[3px] bg-[#0052cc] text-[10px] font-bold text-white">{p.key.slice(0, 2)}</span>
            <span className="truncate">{p.name}</span>
            <span className="ml-auto text-xs text-[#6b778c]">{p.key}</span>
          </DropdownMenuItem>
        ))}
        {!projects.length && <p className="px-2 py-2 text-xs text-[#6b778c]">Chưa có dự án.</p>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(routes.projects)}>Xem tất cả dự án</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const scenarios: { value: Scenario; label: string }[] = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'loading', label: 'Đang tải' },
  { value: 'empty', label: 'Rỗng' },
  { value: 'error', label: 'Lỗi tải' },
  { value: 'forbidden', label: 'Không có quyền (403)' },
  { value: 'not-found', label: 'Không tìm thấy (404)' },
];

/** Công cụ chỉ dành cho người duyệt: đổi persona, kịch bản hiển thị và reset về seed. */
function DemoTools() {
  const { state, me, exec, scenario, setScenario, reset } = useDemo();
  const roleSummary = (userId: number) =>
    state.userRoles
      .filter((a) => a.userId === userId)
      .map((a) => findRole(state, a.roleId)?.name)
      .join(', ') || 'Không có role hệ thống';
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button aria-label="Công cụ demo" className={cn('flex h-8 items-center gap-1 rounded-[3px] px-2 text-[13px] text-[#42526e] hover:bg-[#091e420f]', scenario !== 'normal' && 'bg-[#fffae6] text-[#974f0c]')}>
          <FlaskConical size={16} /> <span className="hidden lg:inline">Công cụ demo</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[80vh] w-80 overflow-y-auto rounded-[3px]" style={FONT}>
        <DropdownMenuLabel className="text-xs text-[#6b778c]">Đổi persona (không phải đăng nhập thật)</DropdownMenuLabel>
        {state.users.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => exec((s) => switchPersona(s, u.id))} className="gap-2">
            <Avatar name={u.fullName} src={u.avatarUrl} size={24} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">
                {u.fullName}
                {!u.enabled && <span className="ml-1 text-[11px] text-[#de350b]">(bị khóa)</span>}
              </span>
              <span className="block truncate text-[11px] text-[#6b778c]">{roleSummary(u.id)}</span>
            </span>
            {me?.id === u.id && <Check size={14} className="text-[#0052cc]" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-[#6b778c]">Kịch bản hiển thị trang</DropdownMenuLabel>
        {scenarios.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => setScenario(s.value)} className="justify-between text-[13px]">
            {s.label}
            {scenario === s.value && <Check size={14} className="text-[#0052cc]" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={reset} className="gap-2 text-[13px] text-[#de350b]">
          <RotateCcw size={14} /> Reset dữ liệu mẫu
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Chuông: số chưa đọc và 6 thông báo gần nhất của persona hiện tại. */
function NotificationBell() {
  const { state, me, act } = useDemo();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = inbox(state, me?.id).slice(0, 6);
  const unread = unreadCount(state, me?.id);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label={`Thông báo, ${unread} chưa đọc`} className="relative rounded-full p-1.5 text-[#42526e] hover:bg-[#091e420f]" disabled={!me?.enabled}>
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-[#de350b] px-1 text-[10px] font-bold leading-[18px] text-white">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-16px))] rounded-[3px] p-0" style={FONT}>
        <div className="flex items-center justify-between border-b border-[#ebecf0] px-4 py-3">
          <p className="text-sm font-semibold">Thông báo</p>
          <Btn variant="link" size="sm" disabled={!unread} onClick={() => act((s, c) => markAllRead(s, c), 'Đã đánh dấu tất cả là đã đọc')}>
            Đánh dấu đã đọc tất cả
          </Btn>
        </div>
        <ul className="max-h-[360px] overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <button
                className={cn('flex w-full gap-3 px-4 py-2.5 text-left hover:bg-[#f4f5f7]', !n.read && 'bg-[#e9f2ff]/60')}
                onClick={() => {
                  if (!n.read) act((s, c) => markNotification(s, c, n.id, true));
                  setOpen(false);
                  if (n.issueId && n.projectId && findIssue(state, n.issueId)) router.push(routes.issue(n.projectId, n.issueId, 'board'));
                  else router.push(routes.notifications);
                }}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-[#0052cc]')} aria-label={n.read ? 'Đã đọc' : 'Chưa đọc'} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[#172b4d]">{n.title}</span>
                  <span className="block truncate text-xs text-[#6b778c]">{n.body}</span>
                  <span className="block text-[11px] text-[#97a0af]">{formatDate(n.createdAt, true)}</span>
                </span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-4 py-8 text-center text-sm text-[#6b778c]">Không có thông báo.</li>}
        </ul>
        <div className="border-t border-[#ebecf0] px-4 py-2 text-center">
          <Link href={routes.notifications} onClick={() => setOpen(false)} className="text-[13px] font-medium text-[#0052cc] hover:underline">
            Xem tất cả trong hộp thư
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const { state, me, exec } = useDemo();
  const router = useRouter();
  if (!me)
    return (
      <Link href={routes.signIn} className="text-sm font-medium text-[#0052cc] hover:underline">
        Đăng nhập
      </Link>
    );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button aria-label={`Tài khoản ${me.fullName}`} className="rounded-full p-0.5 hover:ring-2 hover:ring-[#dfe1e6]">
          <Avatar name={me.fullName} src={me.avatarUrl} size={30} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-[3px]" style={FONT}>
        <div className="px-2 py-2">
          <p className="truncate text-sm font-semibold">{me.fullName}</p>
          <p className="truncate text-xs text-[#6b778c]">{me.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(routes.account)} className="gap-2">
          <UserCircle size={15} /> Hồ sơ và mật khẩu
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(routes.notifications)} className="gap-2">
          <Bell size={15} /> Hộp thư thông báo
        </DropdownMenuItem>
        {isAdmin(state, me.id) && (
          <DropdownMenuItem onSelect={() => router.push(routes.admin())} className="gap-2">
            <ShieldCheck size={15} /> Quản trị hệ thống
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => {
            exec((s) => ({ ok: true, state: signOut(s) }));
            router.push(routes.signIn);
          }}
        >
          <LogOut size={15} /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
