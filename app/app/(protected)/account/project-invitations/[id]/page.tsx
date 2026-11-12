import { InvitationPreview } from '@/features/connected/invitations/recipient';

export default function Page({ params }: { params: { id: string } }) {
  return <InvitationPreview id={params.id} fromEmail={false} />;
}
