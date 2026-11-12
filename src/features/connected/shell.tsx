'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, FolderKanban, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, FONT, InlineAlert } from '@/components/project-ui/kit';
import { announceSession, connectedRequest, markLogoutPending, withSessionLock } from './client';
import { NotificationBell } from './notifications/notification-bell';
import { useSession } from './session';

/** Trang bảo vệ chỉ dựng children sau khi có context thật; lỗi mạng có nút thử lại, không chuyển thành trang rỗng. */
export function ConnectedShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const path = usePathname();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!session.switching && session.isSuccess && !session.data) router.replace(`/app/sign-in?returnTo=${encodeURIComponent(path)}`);
  }, [session.isSuccess, session.data, session.switching, router, path]);

  /** Logout chờ BE thu hồi; dù lỗi mạng vẫn đóng phiên local và thông báo rõ giới hạn xác nhận. */
  async function logout() {
    if (pending) return;
    setPending(true);
    // Ghi ý định trước request để refresh trang lúc offline cũng không làm phiên cũ tự sống lại.
    markLogoutPending();
    try { await withSessionLock(() => connectedRequest('auth/logout', { method: 'POST' }, false)); }
    catch (error) { toast.warning(error instanceof Error ? error.message : 'Chưa xác nhận thu hồi phiên trên máy chủ.'); }
    finally { announceSession('ended'); router.replace('/app/sign-in'); setPending(false); }
  }
  if (session.switching || session.isPending || (session.isSuccess && !session.data)) return <div className="p-8 text-sm text-[#6b778c]" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (session.isError) return <div className="mx-auto mt-16 max-w-lg space-y-4 p-6"><InlineAlert tone="error">{session.error.message}</InlineAlert><Btn onClick={() => void session.refetch()}>Thử lại</Btn></div>;
  if (!session.data) return null;
  const user = session.data.user;
  return <div className="min-h-screen bg-white text-[#172b4d]" style={FONT}>
    <header className="flex h-14 items-center justify-between border-b border-[#dfe1e6] px-4 sm:px-6">
      <Link href="/app/projects" className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="text-[#0052cc]" />Quản lý dự án</Link>
      <div className="flex items-center gap-3">
        <NotificationBell userId={user.userId} />
        <Link href="/app/account" className="hidden text-sm hover:underline sm:inline">{user.fullName || user.userName}</Link>
        <Btn variant="subtle" onClick={logout} disabled={pending}><LogOut />{pending ? 'Đang thoát…' : 'Đăng xuất'}</Btn>
      </div>
    </header>
    <div className="flex min-h-[calc(100vh-56px)] flex-col sm:flex-row">
      <nav aria-label="Điều hướng chính" className="flex shrink-0 gap-1 border-b border-[#dfe1e6] bg-[#fafbfc] p-3 sm:w-60 sm:flex-col sm:border-b-0 sm:border-r">
        {[{ href: '/app/projects', label: 'Dự án', Icon: FolderKanban }, { href: '/app/account', label: 'Tài khoản', Icon: UserRound }].map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={`flex items-center gap-2 rounded-[3px] px-3 py-2 text-sm ${path === href ? 'bg-[#e9f2ff] font-medium text-[#0052cc]' : 'hover:bg-[#ebecf0]'}`}><Icon size={18} />{label}</Link>)}
      </nav>
      <main className="min-w-0 flex-1 p-5 sm:p-8">{children}</main>
    </div>
  </div>;
}
