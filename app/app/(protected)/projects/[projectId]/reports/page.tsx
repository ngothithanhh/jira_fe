import { Suspense } from 'react';
import { ConnectedReports } from '@/features/connected/reports/reports';

export default function Page({ params }: { params: { projectId: string } }) {
  return (
    <Suspense fallback={<p role="status">Đang tải báo cáo…</p>}>
      <ConnectedReports projectId={params.projectId} />
    </Suspense>
  );
}
