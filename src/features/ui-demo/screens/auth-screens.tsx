'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ClipboardList, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Btn, FONT, Field, InlineAlert, TextInput } from '@/components/project-ui/kit';
import { routes } from '../common';
import { findRole, signIn, signUp } from '../logic';
import { useDemo } from '../provider';

/** Layout xác thực: nền đơn giản, form giữa màn hình, không có sidebar dự án. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f5f7] px-4 py-10 text-[#172b4d]" style={FONT}>
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2 text-[22px] font-semibold tracking-[-0.3px]">
          <ClipboardList size={28} className="text-[#0052cc]" aria-hidden /> Quản lý dự án
        </div>
        <div className="rounded-[3px] bg-white px-6 py-8 shadow-[0_0_10px_rgba(9,30,66,0.1)] sm:px-10">{children}</div>
        <p className="mt-4 text-center text-xs text-[#6b778c]">Bản xem trước · Dữ liệu mẫu, không gửi tới máy chủ.</p>
      </div>
    </div>
  );
}

function PasswordInput(props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  const { onChange, ...rest } = props;
  return (
    <div className="relative">
      <TextInput {...rest} type={show ? 'text' : 'password'} onChange={(e) => onChange(e.target.value)} className="pr-10" />
      <button type="button" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show} onClick={() => setShow((v) => !v)} className="absolute right-2 top-2 text-[#6b778c] hover:text-[#172b4d]">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

/** Đăng nhập demo: chọn persona hoặc nhập email mẫu; mật khẩu chỉ kiểm không trống, không lưu. */
export function SignInScreen() {
  const { state, exec } = useDemo();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);

  function submit(withEmail = email, withPassword = password) {
    const result = exec((s) => signIn(s, { email: withEmail, password: withPassword }));
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setError(result.fieldErrors ? '' : result.message);
      return;
    }
    toast.success('Đã vào phiên demo');
    router.push(routes.projects);
  }
  const personas = [1, 2, 3, 6].map((id) => state.users.find((u) => u.id === id)).filter((u) => !!u);
  return (
    <AuthFrame>
      <h1 className="mb-6 text-center text-base font-semibold">Đăng nhập để tiếp tục</h1>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <Field label="Email" required error={errors.email}>
          {(p) => <TextInput {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" />}
        </Field>
        <Field label="Mật khẩu" required error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={setPassword} />}
        </Field>
        <Btn type="submit" variant="primary" size="md" className="w-full">
          Đăng nhập
        </Btn>
      </form>
      <div className="mt-4 flex justify-between text-[13px]">
        <button className="text-[#0052cc] hover:underline" onClick={() => setForgot((v) => !v)} aria-expanded={forgot}>
          Quên mật khẩu?
        </button>
        <Link href={routes.signUp} className="text-[#0052cc] hover:underline">
          Tạo tài khoản
        </Link>
      </div>
      {forgot && (
        <div className="mt-3">
          <InlineAlert tone="info">Khôi phục mật khẩu qua email chưa có trong bản này. Liên hệ quản trị viên để được hỗ trợ.</InlineAlert>
        </div>
      )}
      <div className="mt-6 border-t border-[#ebecf0] pt-4">
        <p className="mb-2 text-xs font-semibold text-[#6b778c]">Vào nhanh bằng persona mẫu</p>
        <ul className="space-y-1">
          {personas.map((u) => (
            <li key={u.id}>
              <button
                className="flex w-full items-center gap-3 rounded-[3px] px-2 py-1.5 text-left hover:bg-[#f4f5f7]"
                onClick={() => {
                  setEmail(u.email);
                  setPassword('demo-password');
                  submit(u.email, 'demo-password');
                }}
              >
                <Avatar name={u.fullName} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{u.fullName}</span>
                  <span className="block truncate text-[11px] text-[#6b778c]">
                    {u.email} ·{' '}
                    {u.enabled
                      ? state.userRoles
                          .filter((a) => a.userId === u.id)
                          .map((a) => findRole(state, a.roleId)?.name)
                          .join(', ') || 'Thành viên dự án, không có role hệ thống'
                      : 'Tài khoản bị khóa'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AuthFrame>
  );
}

export function SignUpScreen() {
  const { exec } = useDemo();
  const router = useRouter();
  const [form, setForm] = useState({ userName: '', fullName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <AuthFrame>
      <h1 className="mb-6 text-center text-base font-semibold">Tạo tài khoản</h1>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const result = exec((s, ctx) => signUp(s, ctx.now, form));
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            if (!result.fieldErrors) toast.error(result.message);
            return;
          }
          toast.success('Đã tạo tài khoản mẫu và vào phiên demo');
          router.push(routes.projects);
        }}
      >
        <Field label="Tên đăng nhập" required error={errors.userName} hint="Chữ không dấu, số, dấu chấm hoặc gạch.">
          {(p) => <TextInput {...p} autoComplete="username" value={form.userName} onChange={(e) => set({ userName: e.target.value })} />}
        </Field>
        <Field label="Họ và tên" required error={errors.fullName}>
          {(p) => <TextInput {...p} autoComplete="name" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />}
        </Field>
        <Field label="Email" required error={errors.email}>
          {(p) => <TextInput {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />}
        </Field>
        <Field label="Mật khẩu" required error={errors.password} hint="Tối thiểu 8 ký tự.">
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={form.password} onChange={(v) => set({ password: v })} />}
        </Field>
        <Field label="Nhập lại mật khẩu" required error={errors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={form.confirm} onChange={(v) => set({ confirm: v })} />}
        </Field>
        <Btn type="submit" variant="primary" size="md" className="w-full">
          Đăng ký
        </Btn>
      </form>
      <p className="mt-4 text-center text-[13px]">
        Đã có tài khoản?{' '}
        <Link href={routes.signIn} className="text-[#0052cc] hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthFrame>
  );
}
