export type VerificationState = 'PENDING' | 'LOCKED' | 'CONSUMED' | 'EXPIRED' | 'VERIFIED' | 'UNVERIFIED';
export type DeliveryState = 'QUEUED' | 'SENDING' | 'RETRY_WAIT' | 'PROVIDER_ACCEPTED' | 'UNKNOWN' | 'FAILED' | 'SUPERSEDED';
export type VerificationView = {
  challengeId?: string;
  emailMasked: string;
  state: VerificationState;
  expiresAt?: string;
  resendAvailableAt?: string;
  proofExpiresAt?: string;
  deliveryState?: DeliveryState;
  verifiedAt?: string;
};

const routes = {
  'auth/register': 'POST',
  'auth/registration/status': 'GET',
  'auth/registration/resend': 'POST',
  'auth/registration/verify': 'POST',
  'account/email-verification/status': 'GET',
  'account/email-verification/request': 'POST',
  'account/email-verification/verify': 'POST',
} as const;

export type VerificationRoute = keyof typeof routes;

export function verificationRoute(path: string, method: string): VerificationRoute | null {
  return Object.hasOwn(routes, path) && routes[path as VerificationRoute] === method ? path as VerificationRoute : null;
}

export function challengeId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

export function proofToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function otpCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value);
}

const states: readonly string[] = ['PENDING', 'LOCKED', 'CONSUMED', 'EXPIRED', 'VERIFIED', 'UNVERIFIED'];
const deliveries: readonly string[] = ['QUEUED', 'SENDING', 'RETRY_WAIT', 'PROVIDER_ACCEPTED', 'UNKNOWN', 'FAILED', 'SUPERSEDED'];

function timestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Chỉ chọn trường cho UI. Proof từ BE có contract riêng và không nằm trong view browser. */
export function verificationView(value: unknown): VerificationView | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (typeof data.emailMasked !== 'string' || typeof data.state !== 'string' || !states.includes(data.state)) return;
  const id = challengeId(data.challengeId) ? data.challengeId : undefined;
  const expiresAt = timestamp(data.expiresAt);
  const proofExpiresAt = timestamp(data.proofExpiresAt);
  const resendAvailableAt = timestamp(data.resendAvailableAt);
  if (data.state !== 'VERIFIED' && data.state !== 'UNVERIFIED' && !(id && expiresAt && proofExpiresAt && resendAvailableAt)) return;
  return {
    challengeId: id, emailMasked: data.emailMasked, state: data.state as VerificationState, expiresAt, proofExpiresAt, resendAvailableAt,
    deliveryState: typeof data.deliveryState === 'string' && deliveries.includes(data.deliveryState) ? data.deliveryState as DeliveryState : undefined,
    verifiedAt: timestamp(data.verifiedAt),
  };
}
