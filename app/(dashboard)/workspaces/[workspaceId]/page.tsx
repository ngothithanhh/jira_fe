import { redirect } from 'next/navigation';

import { getCurrent } from '@/features/auth/queries';

const WorkspaceIdPage = async ({ params }: { params: { workspaceId: string } }) => {
  const user = await getCurrent();

  if (!user) redirect('/sign-in');

  // Legacy workspace routes resolve to the selected backend project.
  redirect(`/workspaces/${params.workspaceId}/projects/${params.workspaceId}`);
};
export default WorkspaceIdPage;
