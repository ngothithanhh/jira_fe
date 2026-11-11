import { Suspense, type ReactNode } from 'react';
import { ProjectGate } from '@/features/ui-demo/common';
import { IssuePanel } from '@/features/ui-demo/screens/issue-panel';

/**
 * projectId trên URL quyết định phạm vi; cổng kiểm tồn tại/quyền trước khi render trang con.
 * Panel chi tiết công việc dùng chung cho mọi trang dự án, mở bằng ?issueId=.
 */
export default function ProjectLayout({ children, params }: { children: ReactNode; params: { projectId: string } }) {
  return (
    <ProjectGate projectId={params.projectId}>
      {children}
      <Suspense>
        <IssuePanel />
      </Suspense>
    </ProjectGate>
  );
}
