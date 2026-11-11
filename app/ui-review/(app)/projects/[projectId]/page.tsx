import { redirect } from 'next/navigation';

export default function Page({ params }: { params: { projectId: string } }) {
  redirect(`/ui-review/projects/${encodeURIComponent(params.projectId)}/overview`);
}
