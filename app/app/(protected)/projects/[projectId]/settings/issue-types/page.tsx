import { ConnectedProjectTypes } from '@/features/connected/configuration/project-types';
import { projectIdFromRoute } from '@/features/connected/projects/model';

export default function Page({ params }: { params: { projectId: string } }) {
  const projectId = projectIdFromRoute(params.projectId);
  return projectId === null ? null : <ConnectedProjectTypes projectId={projectId} />;
}
