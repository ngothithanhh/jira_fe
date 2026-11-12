'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ClipboardList, Eye, EyeOff } from 'lucide-react';
import { Btn, Field, FONT, InlineAlert, TextInput } from '@/components/project-ui/kit';
import { announceSession, connectedRequest, hasPendingLogout, safeReturnTo, withSessionLock } from './client';
import type { VerificationView } from './registration/contract';
import { startRegistration } from './registration/queries';

/** Form thật dùng cùng bộ giao diện đã duyệt; submit chỉ đổi trang sau khi BE đã xác nhận và Next đã cấp cookie. */
export function ConnectedAuthScreen({ register = false, onRegistered, registrationNotice }: {
  register?: boolean; onRegistered?: (view: VerificationView) => void; registrationNotice?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '', userName: '', fullName: '' });
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const target = safeReturnTo(params.get('returnTo'));

  /** Email/password thuộc người nhập; tên chỉ gửi khi đăng ký. Lỗi giữ bản nháp, không tạo phiên giả trong FE. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      if (register) {
        const verification = await startRegistration(form);
        setForm((value) => ({ ...value, password: '' }));
        onRegistered?.(verification);
        return;
      }
      await withSessionLock(async () => {
        // Nếu từng logout lúc offline, hoàn tất xóa cookie trước khi tạo phiên người dùng mới.
        if (hasPendingLogout()) await connectedRequest('auth/logout', { method: 'POST' }, false);
        return connectedRequest('auth/login', { method: 'POST', body: JSON.stringify(form) }, false);
      });
      announceSession('changed');
      router.replace(target);
    } catch (e) { setError(e instanceof Error ? e.message : register ? 'Không thể đăng ký.' : 'Không thể đăng nhập.'); }
    finally { setPending(false); }
  }

  return <div className="min-h-screen bg-[#f4f5f7] px-4 py-12 text-[#172b4d]" style={FONT}>
    <div className="mx-auto max-w-[420px]">
      <Link href="/app/projects" className="mb-6 flex items-center justify-center gap-2 text-[22px] font-semibold"><ClipboardList size={28} className="text-[#0052cc]" />Quản lý dự án</Link>
      <form onSubmit={submit} className="space-y-5 rounded-[3px] bg-white px-8 py-8 shadow-[0_0_10px_rgba(9,30,66,0.1)]">
        <h1 className="text-center text-xl font-semibold">{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        {(error || registrationNotice) && <InlineAlert tone="error">{error || registrationNotice}</InlineAlert>}
        {register && <><Field label="Họ và tên" required>{(p) => <TextInput {...p} required maxLength={100} autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}</Field>
          <Field label="Tên người dùng" required>{(p) => <TextInput {...p} required maxLength={50} autoComplete="username" value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />}</Field></>}
        <Field label="Email" required>{(p) => <TextInput {...p} type="email" required maxLength={100} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Mật khẩu" required hint={register ? 'Tối thiểu 8 ký tự, tối đa 72 byte UTF-8.' : undefined}>{(p) => <div className="relative"><TextInput {...p} type={visible ? 'text' : 'password'} required minLength={register ? 8 : 1} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} className="pr-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} className="absolute right-2 top-2 text-[#6b778c]" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}</Field>
        <Btn type="submit" variant="primary" size="md" className="w-full" disabled={pending}>{pending ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}</Btn>
        <p className="text-center text-sm text-[#6b778c]">{register ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}<Link className="text-[#0052cc] hover:underline" href={`/app/${register ? 'sign-in' : 'sign-up'}?returnTo=${encodeURIComponent(target)}`}>{register ? 'Đăng nhập' : 'Đăng ký'}</Link></p>
      </form>
    </div>
  </div>;
}
