'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Btn, Card, Field, InlineAlert, PageHeading, TextInput } from '@/components/project-ui/kit';
import { Screen } from '../common';
import { changePassword, findProject, findRole, updateProfile } from '../logic';
import { useDemo } from '../provider';

/** Đổi persona thì dựng lại form để không giữ bản nháp của người trước. */
export function AccountScreen() {
  const { me } = useDemo();
  return <AccountForm key={me?.id ?? 0} />;
}

/** Hồ sơ của persona đang chọn: tên/ảnh lưu vào state mẫu; đổi mật khẩu chỉ mô phỏng validation, không lưu mật khẩu. */
function AccountForm() {
  const { state, me, exec } = useDemo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ userName: me?.userName ?? '', fullName: me?.fullName ?? '' });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  if (!me) return null;
  const dirty = profile.userName !== me.userName || profile.fullName !== me.fullName;
  const globalRoles = state.userRoles.filter((a) => a.userId === me.id).map((a) => findRole(state, a.roleId)?.name);
  const memberships = state.memberships.filter((m) => m.userId === me.id);

  function setAvatar(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return toast.error('Chỉ chọn ảnh PNG, JPG, GIF hoặc WEBP.');
    if (file.size > 2 * 1024 * 1024) return toast.error('Ảnh đại diện tối đa 2 MB trong bản mẫu.');
    const url = URL.createObjectURL(file);
    const r = exec((s, c) => updateProfile(s, c, { userName: me!.userName, fullName: me!.fullName, avatarUrl: url }));
    if (r.ok) toast.success('Đã đổi ảnh đại diện');
    else (URL.revokeObjectURL(url), toast.error(r.message));
  }

  return (
    <Screen>
      <PageHeading title="Hồ sơ cá nhân" description="Thông tin của persona đang dùng trong bản xem trước." />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card title="Thông tin cá nhân">
          <div className="mb-4 flex items-center gap-4">
            <Avatar name={me.fullName} src={me.avatarUrl} size={64} />
            <div className="flex flex-wrap gap-2">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-label="Chọn ảnh đại diện" onChange={(e) => (setAvatar(e.target.files?.[0]), (e.target.value = ''))} />
              <Btn onClick={() => fileInput.current?.click()}>Đổi ảnh</Btn>
              {me.avatarUrl && (
                <Btn variant="subtle" onClick={() => exec((s, c) => updateProfile(s, c, { ...profile, userName: me.userName, fullName: me.fullName, avatarUrl: null }))}>
                  Bỏ ảnh
                </Btn>
              )}
            </div>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const r = exec((s, c) => updateProfile(s, c, profile));
              setProfileErrors(r.ok ? {} : (r.fieldErrors ?? {}));
              if (r.ok) toast.success('Đã lưu hồ sơ');
            }}
          >
            <Field label="Tên đăng nhập" required error={profileErrors.userName}>
              {(p) => <TextInput {...p} value={profile.userName} onChange={(e) => setProfile((f) => ({ ...f, userName: e.target.value }))} />}
            </Field>
            <Field label="Họ và tên" required error={profileErrors.fullName}>
              {(p) => <TextInput {...p} value={profile.fullName} onChange={(e) => setProfile((f) => ({ ...f, fullName: e.target.value }))} />}
            </Field>
            <Field label="Email" hint="Email đăng nhập không đổi trong bản này.">
              {(p) => <TextInput {...p} value={me.email} readOnly disabled />}
            </Field>
            <div className="flex gap-2">
              <Btn type="submit" variant="primary" disabled={!dirty}>
                Lưu hồ sơ
              </Btn>
              <Btn variant="subtle" disabled={!dirty} onClick={() => (setProfile({ userName: me.userName, fullName: me.fullName }), setProfileErrors({}))}>
                Hủy
              </Btn>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card title="Đổi mật khẩu">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const r = exec((s, c) => changePassword(s, c, pw));
                setPwErrors(r.ok ? {} : (r.fieldErrors ?? {}));
                if (r.ok) {
                  setPw({ current: '', next: '', confirm: '' });
                  toast.success('Đã đổi mật khẩu (mô phỏng). Phiên thật sẽ yêu cầu đăng nhập lại.');
                }
              }}
            >
              <InlineAlert tone="info">Bản mẫu chỉ kiểm tra dữ liệu nhập, không lưu hay so khớp mật khẩu.</InlineAlert>
              {(
                [
                  ['current', 'Mật khẩu hiện tại', 'current-password'],
                  ['next', 'Mật khẩu mới', 'new-password'],
                  ['confirm', 'Nhập lại mật khẩu mới', 'new-password'],
                ] as const
              ).map(([key, label, auto]) => (
                <Field key={key} label={label} required error={pwErrors[key]}>
                  {(p) => <TextInput {...p} type="password" autoComplete={auto} value={pw[key]} onChange={(e) => setPw((f) => ({ ...f, [key]: e.target.value }))} />}
                </Field>
              ))}
              <Btn type="submit" variant="primary">
                Đổi mật khẩu
              </Btn>
            </form>
          </Card>
          <Card title="Vai trò">
            <p className="text-xs font-semibold text-[#6b778c]">Vai trò hệ thống</p>
            <p className="mb-3 text-sm">{globalRoles.join(', ') || 'Không có'}</p>
            <p className="text-xs font-semibold text-[#6b778c]">Vai trò trong dự án</p>
            <ul className="text-sm">
              {memberships.map((m) => (
                <li key={m.projectId}>
                  {findProject(state, m.projectId)?.name}: {findRole(state, m.roleId)?.name}
                </li>
              ))}
              {!memberships.length && <li>Chưa thuộc dự án nào</li>}
            </ul>
          </Card>
        </div>
      </div>
    </Screen>
  );
}
