import { ConnectedMembers } from '@/features/connected/members/screen';
import { projectIdFromRoute } from '@/features/connected/projects/model';

export default function Page({ params }: { params: { projectId: string } }) {
  const id = projectIdFromRoute(params.projectId);
  return id === null ? null : <ConnectedMembers projectId={id} />;
}
