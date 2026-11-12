'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Card, InlineAlert } from '@/components/project-ui/kit';
import { completeConnectedMutation, connectedMutation } from '../client';
import { useProjectMutationScope } from '../projects/queries';
import type { VerificationView } from './contract';
import { OtpForm } from './otp-form';
import { ACCOUNT_EMAIL, isUncertain, useDeliveryPoll, verificationMessage, verificationStatus } from './queries';

export function AccountEmailVerification({ userId }: { userId: number }) {
  const capture = useProjectMutationScope();
  const [view, setView] = useState<VerificationView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const live = useRef<() => boolean>(() => false);
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const current = useCallback(() => live.current(), []);

  useEffect(() => {
    const scope = captureRef.current();
    live.current = scope;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && !busy.current && scope();
    void verificationStatus(ACCOUNT_EMAIL, undefined, controller.signal).then(async (next) => {
      if (isCurrent()) await completeConnectedMutation(userId, isCurrent, () => setView(next));
    }).catch((cause) => {
      if (isCurrent()) setError(verificationMessage(cause));
    });
    return () => { controller.abort(); live.current = () => false; };
  }, [userId]);

  const updateDelivery = useCallback((next: VerificationView) => {
    const isCurrent = () => !busy.current && live.current();
    void completeConnectedMutation(userId, isCurrent, () => {
      setView((previous) => previous?.challengeId === next.challengeId ? next : previous);
    }).catch(() => { /* Người dùng có thể đọc lại sau khi phiên ổn định. */ });
  }, [userId]);
  useDeliveryPoll(ACCOUNT_EMAIL, view, pending, updateDelivery, current);

  /** Mutation và completion dùng cùng actor scope. Request ghi chỉ gửi một lượt sau khi xác nhận cookie. */
  async function act(action: 'request' | 'verify' | 'status', code?: string) {
    if (busy.current) return;
    const scope = capture();
    busy.current = true;
    setPending(true);
    setError('');
    try {
      let next: VerificationView;
      if (action === 'status') next = await verificationStatus(ACCOUNT_EMAIL, view?.challengeId);
      else if (action === 'request') {
        next = await connectedMutation<VerificationView>(ACCOUNT_EMAIL + '/request', userId, { method: 'POST' }, scope);
      } else {
        await connectedMutation<void>(ACCOUNT_EMAIL + '/verify', userId, {
          method: 'POST', body: JSON.stringify({ challengeId: view?.challengeId, code }),
        }, scope);
        next = { emailMasked: view?.emailMasked ?? '', state: 'VERIFIED' };
      }
      await completeConnectedMutation(userId, scope, () => setView(next));
    } catch (cause) {
      if (scope()) setError(verificationMessage(cause));
      if (isUncertain(cause) || action === 'verify') {
        try {
          const next = await verificationStatus(ACCOUNT_EMAIL);
          await completeConnectedMutation(userId, scope, () => setView(next));
        } catch { /* Giữ lỗi ban đầu và cho phép đọc trạng thái lại. */ }
      }
    } finally {
      busy.current = false;
      if (scope()) setPending(false);
    }
  }

  return <Card title="Xác minh email">
    {view?.state === 'VERIFIED' ? <InlineAlert tone="success">Email đã được xác minh.</InlineAlert>
      : view?.challengeId ? <OtpForm key={view.challengeId} view={view} pending={pending} error={error}
        verify={(code) => void act('verify', code)} resend={() => void act('request')} refresh={() => void act('status')} />
      : <div className="space-y-3">
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        {view ? <><p className="text-sm text-[#42526e]">Xác minh địa chỉ {view.emailMasked} của tài khoản này.</p>
          <Btn variant="primary" disabled={pending} onClick={() => void act('request')}>Gửi mã xác minh</Btn></>
          : <Btn disabled={pending} onClick={() => void act('status')}>Kiểm tra trạng thái email</Btn>}
      </div>}
  </Card>;
}
