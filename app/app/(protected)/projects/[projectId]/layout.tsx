import type { ReactNode } from 'react';
import { ConnectedProjectGate } from '@/features/connected/projects/screens';
/** Route project dùng gate API thật; layout này cũng là nơi các domain con nhận đúng phạm vi project. */
export default function Layout({ children }: { children: ReactNode }) { return <ConnectedProjectGate>{children}</ConnectedProjectGate>; }
