import type { ReactNode } from 'react';
import { ProjectGate } from '@/features/ui-demo/common';

/** projectId trên URL quyết định phạm vi; cổng kiểm tồn tại/quyền trước khi render trang con. */
export default function ProjectLayout({ children, params }: { children: ReactNode; params: { projectId: string } }) {
  return <ProjectGate projectId={params.projectId}>{children}</ProjectGate>;
}
