'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { FONT, InlineAlert } from '@/components/project-ui/kit';
import { ConnectedAuthScreen } from '../auth-screen';
import { ConnectedError, safeReturnTo } from '../client';
import { challengeId, type VerificationView } from './contract';
import { OtpForm } from './otp-form';
import { isUncertain, REGISTRATION, registrationWrite, useDeliveryPoll, verificationMessage, verificationStatus } from './queries';

const FLOW_KEY = 'jira-registration-challenge';
const EDITING = 'editing:';

export function ConnectedRegistrationScreen() {
  const router = useRouter();
  const target = safeReturnTo(useSearchParams().get('returnTo'));
  const signIn = '/app/sign-in?returnTo=' + encodeURIComponent(target);
  const [view, setView] = useState<VerificationView | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [otpVersion, setOtpVersion] = useState(0);

  /** Chỉ lưu ID công khai trong tab. Proof vẫn do BFF giữ để phát hiện flow đã đổi. */
  useEffect(() => {
    const controller = new AbortController();
    const stored = sessionStorage.getItem(FLOW_KEY);
    async function restore() {
      try {
        const abandoned = stored?.startsWith(EDITING) ? stored.slice(EDITING.length) : undefined;
        const next = await verificationStatus(REGISTRATION, challengeId(stored) ? stored : undefined, controller.signal);
        if (controller.signal.aborted) return;
        if (abandoned && next.challengeId === abandoned) return;
        if (next.state === 'CONSUMED') router.replace(signIn);
        else if (next.challengeId) {
          sessionStorage.setItem(FLOW_KEY, next.challengeId);
          setView(next);
        }
      } catch (cause) {
        if (controller.signal.aborted || !challengeId(stored)) return;
        setError(cause instanceof ConnectedError && [400, 409, 410].includes(cause.status)
          ? 'Lượt đăng ký không còn trong tab này. Nếu vừa xác minh, hãy thử đăng nhập. Bạn cũng có thể đăng ký lại.'
          : verificationMessage(cause));
      } finally {
        if (!controller.signal.aborted) setRestoring(false);
      }
    }
    void restore();
    return () => controller.abort();
  }, [router, signIn]);

  useDeliveryPoll(REGISTRATION, view, pending, setView);

  function open(next: VerificationView) {
    if (!next.challengeId) return;
    sessionStorage.setItem(FLOW_KEY, next.challengeId);
    setError('');
    setView(next);
  }

  async function read(id: string) {
    const next = await verificationStatus(REGISTRATION, id);
    if (next.state === 'CONSUMED') {
      router.replace(signIn);
    } else setView(next);
  }

  async function act(action: 'verify' | 'resend' | 'status', code?: string) {
    const id = view?.challengeId;
    if (!id || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      if (action === 'verify') {
        await registrationWrite(REGISTRATION + '/verify', { challengeId: id, code });
        sessionStorage.removeItem(FLOW_KEY);
        router.replace(signIn);
      } else if (action === 'resend') {
        setView(await registrationWrite<VerificationView>(REGISTRATION + '/resend', { challengeId: id }));
        setOtpVersion((version) => version + 1);
      } else await read(id);
    } catch (cause) {
      setError(verificationMessage(cause));
      if ((action === 'verify' || action === 'resend') && isUncertain(cause)) {
        try { await read(id); }
        catch { setError('Chưa xác nhận được kết quả. Nếu vừa xác minh, hãy thử đăng nhập bằng thông tin đã đăng ký.'); }
      } else if (action === 'verify' && cause instanceof ConnectedError && [410, 429].includes(cause.status)) {
        try { await read(id); } catch { /* Giữ thông báo lỗi xác minh. */ }
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (restoring) return <p className="p-8 text-center" role="status">Đang kiểm tra lượt đăng ký…</p>;
  if (!view) return <ConnectedAuthScreen register onRegistered={open} registrationNotice={error} />;
  return <div className="min-h-screen bg-[#f4f5f7] px-4 py-12 text-[#172b4d]" style={FONT}>
    <div className="mx-auto max-w-[420px]">
      <Link href="/app/projects" className="mb-6 flex items-center justify-center gap-2 text-[22px] font-semibold">
        <ClipboardList size={28} className="text-[#0052cc]" />Quản lý dự án
      </Link>
      <section className="space-y-5 rounded-[3px] bg-white px-8 py-8 shadow-[0_0_10px_rgba(9,30,66,0.1)]">
        <h1 className="text-center text-xl font-semibold">Xác minh email</h1>
        {view.state === 'CONSUMED' ? <InlineAlert tone="success">Email đã xác minh. Bạn có thể đăng nhập.</InlineAlert>
          : <OtpForm key={view.challengeId + ':' + otpVersion} view={view} pending={pending} error={error}
            verify={(code) => void act('verify', code)} resend={() => void act('resend')} refresh={() => void act('status')}
            edit={() => { sessionStorage.setItem(FLOW_KEY, EDITING + view.challengeId); setError(''); setView(null); }} />}
        <Link className="text-sm text-[#0052cc] hover:underline" href={signIn}>Đăng nhập</Link>
      </section>
    </div>
  </div>;
}
