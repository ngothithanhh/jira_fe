export const ACCOUNT_INVITES = 'account/project-invitations';
export const inviteStates = ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED'] as const;
export type InviteState = typeof inviteStates[number];
export type Invitation = {
  invitationId: string;
  projectId?: number;
  projectName: string;
  projectKey: string;
  inviterName?: string;
  email?: string;
  roleName: string;
  state: InviteState;
  expiresAt: string;
  resendAfter?: string;
  deliveryState?: string;
  deliveryError?: 'MAIL_REAUTH';
  canResend: boolean;
};
export type InvitationPage = { items: Invitation[]; hasMore: boolean };

export function invitationId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

export function validInviteToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function invitePath(id: string, fromEmail: boolean) {
  return fromEmail ? '/app/invitations/' + id : '/app/account/project-invitations/' + id;
}

export function projectInvites(projectId: number) { return 'projects/' + projectId + '/invitations'; }

export function validInviteEmail(value: string) {
  const email = value.trim();
  return email.length <= 100 && /^[!-~]+$/.test(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const stateLabel: Record<InviteState, string> = {
  PENDING: 'Đang chờ', ACCEPTED: 'Đã chấp nhận', DECLINED: 'Đã từ chối', REVOKED: 'Đã thu hồi', EXPIRED: 'Đã hết hạn',
};

export const deliveryLabel: Record<string, string> = {
  QUEUED: 'Đang chờ gửi', SENDING: 'Đang gửi', RETRY_WAIT: 'Chờ thử lại', PROVIDER_ACCEPTED: 'Brevo đã nhận yêu cầu',
  UNKNOWN: 'Chưa rõ kết quả gửi', FAILED: 'Gửi thất bại', SUPERSEDED: 'Đã thay thế',
};
