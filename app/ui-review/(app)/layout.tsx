import type { ReactNode } from 'react';
import { AppShell } from '@/features/ui-demo/shell/app-shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
