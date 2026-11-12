import type { ReactNode } from 'react';
import { ConnectedProvider } from '@/features/connected/session';

export const metadata = { title: 'Hệ thống quản lý dự án' };

/** Cache và phiên riêng cho các trang thật; không gắn DemoProvider vào tuyến production. */
export default function Layout({ children }: { children: ReactNode }) {
  return <ConnectedProvider>{children}</ConnectedProvider>;
}
