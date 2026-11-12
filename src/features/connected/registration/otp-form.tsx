'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Btn, Field, InlineAlert, TextInput } from '@/components/project-ui/kit';
import { otpCode, type DeliveryState, type VerificationView } from './contract';

const deliveryCopy: Record<DeliveryState, string> = {
  QUEUED: 'Yêu cầu đang chờ gửi.',
  SENDING: 'Máy chủ đang gửi mã.',
  RETRY_WAIT: 'Máy chủ đang chờ thử gửi lại.',
  PROVIDER_ACCEPTED: 'Brevo đã nhận yêu cầu gửi. Kiểm tra Inbox hoặc Spam.',
  UNKNOWN: 'Chưa xác nhận được kết quả gửi. Kiểm tra hộp thư trước khi yêu cầu mã khác.',
  FAILED: 'Không gửi được mã. Bạn có thể yêu cầu mã mới khi đến hạn.',
  SUPERSEDED: 'Yêu cầu gửi mã này đã kết thúc.',
};

export function OtpForm({ view, pending, error, verify, resend, refresh, edit }: {
  view: VerificationView; pending: boolean; error: string; verify: (code: string) => void;
  resend: () => void; refresh: () => void; edit?: () => void;
}) {
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsLeft = (at?: string) => Math.max(0, Math.ceil((Date.parse(at ?? '') - now) / 1000) || 0);
  const remaining = secondsLeft(view.expiresAt);
  const cooldown = secondsLeft(view.resendAvailableAt);
  const proofActive = secondsLeft(view.proofExpiresAt) > 0;
  const locked = view.state === 'LOCKED';
  const canVerify = view.state === 'PENDING' && remaining > 0 && proofActive;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canVerify && otpCode(code) && !pending) verify(code);
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-[#42526e]">Email nhận mã <strong>{view.emailMasked}</strong></p>
    {view.deliveryState && <p className="text-sm" role="status">{deliveryCopy[view.deliveryState]}</p>}
    {locked && <InlineAlert tone="error">Lượt xác minh đã khóa do nhập sai quá số lần cho phép.</InlineAlert>}
    {!locked && !proofActive && <InlineAlert tone="error">Lượt xác minh đã hết hạn. Hãy bắt đầu lại.</InlineAlert>}
    {!locked && proofActive && !canVerify && <InlineAlert tone="error">Mã đã hết hạn. Hãy yêu cầu mã mới.</InlineAlert>}
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    {canVerify && <><Field label="Mã xác minh" required>{(props) => <TextInput {...props} required inputMode="numeric"
      autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code}
      onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />}</Field>
      <p className="text-sm text-[#42526e]">Mã hết hạn sau {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.</p>
      <Btn type="submit" variant="primary" disabled={pending || !otpCode(code)}>Xác minh</Btn></>}
    <div className="flex flex-wrap items-center gap-3">
      <Btn type="button" disabled={pending || (proofActive && (locked || cooldown > 0)) || (!proofActive && !!edit)} onClick={resend}>
        {proofActive && cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
      </Btn>
      <Btn type="button" disabled={pending} onClick={refresh}>Kiểm tra trạng thái</Btn>
      {edit && <Btn type="button" disabled={pending} onClick={edit}>Sửa email</Btn>}
    </div>
  </form>;
}
