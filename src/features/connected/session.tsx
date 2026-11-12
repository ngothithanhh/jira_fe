'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { completePendingLogout, ConnectedError, connectedRequest, hasPendingLogout, SESSION_SOURCE } from './client';

export type AccountContext = {
  user: { userId: number; userName: string; fullName: string | null; email: string; enabled: boolean; createdAt: string | null };
  systemAdmin: boolean;
  globalPermissions: string[];
  projectId: number | null;
  projectPermissions: string[];
};
const SessionContext = createContext<(ReturnType<typeof useAccount> & { switching: boolean }) | null>(null);
const SESSION_KEY = ['connected', 'session'] as const;

/** Đọc context thật; 401 sau một lần khôi phục là chưa đăng nhập, lỗi mạng vẫn giữ thành error để thử lại. */
function useAccount() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: async ({ signal }) => {
    // Logout khi offline chưa xóa được cookie: chỉ thử hoàn tất logout, tuyệt đối không khôi phục user cũ.
    if (hasPendingLogout()) {
      try { await completePendingLogout(signal); } catch { /* Ý định thoát còn nguyên khi Next chưa xác nhận. */ }
      return null;
    }
    try { return await connectedRequest<AccountContext>('account/context', { signal }); }
    catch (error) { if (error instanceof ConnectedError && error.status === 401) return null; throw error; }
  }, retry: false, staleTime: 15_000, refetchOnWindowFocus: true });
}

/** Đổi phiên thì hủy các request đọc trước, xóa dữ liệu tài khoản cũ rồi mới đọc context phiên mới. */
function SessionState({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const account = useAccount();
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let mounted = true;
    const changed = async (type: unknown) => {
      if (type !== 'changed' && type !== 'ended') return;
      setSwitching(true);
      await queryClient.cancelQueries({ queryKey: ['connected'] });
      if (!mounted) return;
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'connected' && q.queryKey[1] !== 'session' });
      if (type === 'ended') queryClient.setQueryData(SESSION_KEY, null);
      // Reset bỏ cả hồ sơ A trước khi đọc phiên B; invalidate đơn thuần vẫn để A hiện trong lúc tải.
      else await queryClient.resetQueries({ queryKey: SESSION_KEY });
      if (mounted) setSwitching(false);
    };
    const local = (event: Event) => { void changed((event as CustomEvent).detail); };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('jira-connected-session') : null;
    if (channel) channel.onmessage = (event) => {
      if (event.data?.source !== SESSION_SOURCE) void changed(event.data?.type);
    };
    window.addEventListener('jira-session', local);
    const online = () => { void queryClient.invalidateQueries({ queryKey: SESSION_KEY }); };
    window.addEventListener('online', online);
    return () => { mounted = false; window.removeEventListener('jira-session', local); window.removeEventListener('online', online); channel?.close(); };
  }, [queryClient]);
  return <SessionContext.Provider value={{ ...account, switching }}>{children}</SessionContext.Provider>;
}

/** Cache riêng cho ứng dụng thật; không chia sẻ query/session với các tuyến preview hoặc giao diện legacy. */
export function ConnectedProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><SessionState>{children}</SessionState></QueryClientProvider>;
}

/** Hook chỉ dùng trong /app; thiếu provider là lỗi lập trình, không fallback về persona mẫu. */
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('ConnectedProvider chưa được cấp.');
  return session;
}
