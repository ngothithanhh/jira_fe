import { notFound, redirect } from 'next/navigation';
import { getCurrent } from '@/features/auth/queries';
import { BacklogConnected } from '@/features/backlog/components/backlog-connected';

/** projectId từ URL là ID projects; giữ kiểm đăng nhập server hiện có trước khi render trang dùng API thật. */
export default async function ProjectBacklogPage({ params }: { params: { projectId: string } }) {
  const projectId = Number(params.projectId);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  if (!(await getCurrent())) redirect('/sign-in');
  return <BacklogConnected projectId={projectId} />;
}
