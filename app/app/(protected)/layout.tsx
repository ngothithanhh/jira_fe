import type { ReactNode } from 'react';
import { ConnectedShell } from '@/features/connected/shell';
export default function Layout({ children }: { children: ReactNode }) { return <ConnectedShell>{children}</ConnectedShell>; }
