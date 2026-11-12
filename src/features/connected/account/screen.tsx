'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, Btn, Card, Field, InlineAlert, PageHeading, TextInput } from '@/components/project-ui/kit';
import { changeConnectedPassword, completeConnectedMutation, connectedMutation, hasPendingLogout } from '../client';
import { useProjectMutationScope } from '../projects/queries';
import { useSession, type AccountContext } from '../session';
import { validNewPassword, validOldPassword, type PasswordDraft, type ProfileDraft } from './contract';

const sessionKey = ['connected', 'session'] as const;
const emptyPassword: PasswordDraft = { oldPassword: '', newPassword: '', confirm: '' };
const nameQueries = new Set(['project', 'projects', 'members', 'issues', 'issue', 'issue-refs', 'planning', 'board', 'notifications', 'reports']);
type PasswordField = keyof PasswordDraft;

export function ConnectedAccountProfile() {
  const session = useSession();
  if (!session.data || session.switching) return null;
  return <AccountForm key={session.data.user.userId} context={session.data} />;
}

function AccountForm({ context }: { context: AccountContext }) {
  const { user } = context;
  const queryClient = useQueryClient();
  const captureScope = useProjectMutationScope();
  const submitting = useRef(false);
  const [pending, setPending] = useState<'profile' | 'password' | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [password, setPassword] = useState<PasswordDraft>(emptyPassword);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileUncertain, setProfileUncertain] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const saved = { userName: user.userName, fullName: user.fullName ?? '' };
  const profile = draft ?? saved;
  const dirty = profile.userName.trim() !== saved.userName || profile.fullName !== saved.fullName;

  /** Lưu tên của users trong phiên; chỉ gửi trường đã đổi, rồi đồng bộ cache riêng với việc hoàn tất form. */
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || submitting.current || profileUncertain) return;
    const userName = profile.userName.trim();
    if (!userName || userName.length > 50 || profile.fullName.length > 100) {
      setProfileError('Tên người dùng cần từ 1 đến 50 ký tự, họ và tên tối đa 100 ký tự.');
      return;
    }
    const body = {
      ...(userName !== saved.userName && { userName }),
      ...(profile.fullName !== saved.fullName && { fullName: profile.fullName }),
    };
    const current = captureScope();
    submitting.current = true;
    setPending('profile');
    setProfileError(null);
    try {
      const updated = await connectedMutation<AccountContext['user']>('account/profile', user.userId, {
        method: 'PATCH', body: JSON.stringify(body),
      }, current);
      if (updated?.userId !== user.userId) throw new Error('Không xác nhận được hồ sơ đã lưu. Hãy tải lại trang.');
      // PATCH đã lưu: đánh stale đúng actor kể cả khi người dùng vừa rời trang Hồ sơ.
      const namesForActor = ({ queryKey }: { queryKey: readonly unknown[] }) => queryKey[0] === 'connected'
        && queryKey[2] === user.userId && typeof queryKey[1] === 'string' && nameQueries.has(queryKey[1]);
      await queryClient.invalidateQueries({ predicate: namesForActor, refetchType: 'none' });
      await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true, refetchType: 'none' });
      // Header còn tồn tại sau khi form unmount. Kiểm cookie actor trước làm mới, không dùng response cũ cho phiên mới.
      const cacheCurrent = () => !hasPendingLogout() && queryClient.getQueryData<AccountContext | null>(sessionKey)?.user.userId === user.userId;
      const accepted = await completeConnectedMutation(user.userId, cacheCurrent, () => {
        // Hủy đọc context cũ trước khi đồng bộ tên từ response, giữ nguyên quyền của phiên.
        void queryClient.cancelQueries({ queryKey: sessionKey, exact: true });
        if (current()) {
          queryClient.setQueryData<AccountContext>(sessionKey, (account) => account?.user.userId === user.userId
            ? { ...account, user: { ...account.user, userName: updated.userName, fullName: updated.fullName } } : account);
          setDraft(null);
          toast.success('Đã lưu hồ sơ.');
        } else {
          // Form cũ đã đóng hoặc từng đổi phiên: đọc lại tên hiện tại, không áp response muộn lên phiên cùng ID.
          void queryClient.invalidateQueries({ queryKey: sessionKey, exact: true });
        }
        void queryClient.invalidateQueries({ predicate: namesForActor });
      });
      // Probe lỗi sau commit không có nghĩa PATCH thất bại. Khóa gửi tiếp cho tới khi tải lại để xác nhận.
      if (!accepted && current()) {
        setProfileUncertain(true);
        setProfileError('Hồ sơ đã lưu nhưng chưa xác nhận lại được phiên. Tải lại trang trước khi thao tác tiếp.');
      }
    } catch (error) {
      // Lỗi của request cũ cũng phải kiểm cookie trước khi hiển thị cho form đang mở.
      if (current()) {
        const accepted = await completeConnectedMutation(user.userId, current,
          () => setProfileError(error instanceof Error ? error.message : 'Không thể lưu hồ sơ.'));
        if (!accepted && current()) {
          setProfileUncertain(true);
          setProfileError('Chưa xác nhận được kết quả lưu hồ sơ. Tải lại trang trước khi thao tác tiếp.');
        }
      }
    } finally {
      submitting.current = false;
      if (current()) setPending(null);
    }
  }

  /** Đổi mật khẩu kết thúc phiên ngay sau BE204; không chạy completion probe bằng JWT vừa bị thu hồi. */
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || profileUncertain) return;
    const { oldPassword, newPassword, confirm } = password;
    const errors: Partial<Record<PasswordField, string>> = {};
    if (!validOldPassword(oldPassword)) errors.oldPassword = 'Nhập mật khẩu hiện tại, tối đa 72 byte UTF-8.';
    if (!validNewPassword(newPassword)) errors.newPassword = 'Mật khẩu mới cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.';
    if (confirm !== newPassword) errors.confirm = 'Xác nhận mật khẩu mới chưa khớp.';
    setFieldErrors(errors);
    setPasswordError(null);
    if (Object.keys(errors).length) return;

    const current = captureScope();
    submitting.current = true;
    setPending('password');
    try {
      await changeConnectedPassword(user.userId, { oldPassword, newPassword }, current, (outcome) => {
        if (outcome === 'changed') toast.success('Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.');
        else if (outcome === 'uncertain') toast.warning('Chưa xác nhận được kết quả đổi mật khẩu. Hãy thử đăng nhập bằng mật khẩu mới.');
        else toast.warning('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
      });
    } catch (error) {
      if (current()) setPasswordError(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.');
    } finally {
      submitting.current = false;
      if (current()) setPending(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeading title="Hồ sơ cá nhân" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Thông tin cá nhân">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.fullName || user.userName} size={64} />
            <div className="min-w-0">
              <h2 className="break-words font-semibold">{user.fullName || user.userName}</h2>
              <p className="text-sm text-[#42526e]">{context.systemAdmin ? 'Quản trị viên hệ thống' : 'Người dùng'}</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={saveProfile}>
            <Field label="Tên người dùng" required>{(props) => (
              <TextInput {...props} required maxLength={50} value={profile.userName} disabled={pending !== null || profileUncertain}
                onChange={(event) => setDraft({ ...profile, userName: event.target.value })} />
            )}</Field>
            <Field label="Họ và tên">{(props) => (
              <TextInput {...props} maxLength={100} value={profile.fullName} disabled={pending !== null || profileUncertain}
                onChange={(event) => setDraft({ ...profile, fullName: event.target.value })} />
            )}</Field>
            <Field label="Email đăng nhập">{(props) => <TextInput {...props} value={user.email} readOnly />}</Field>
            {profileError && <InlineAlert tone="error">{profileError}</InlineAlert>}
            {profileUncertain && <Btn onClick={() => window.location.reload()}>Tải lại hồ sơ</Btn>}
            <div className="flex gap-2">
              <Btn type="submit" variant="primary" disabled={!dirty || pending !== null || profileUncertain}>{pending === 'profile' ? 'Đang lưu…' : 'Lưu hồ sơ'}</Btn>
              <Btn type="button" variant="subtle" disabled={!draft || pending !== null || profileUncertain} onClick={() => { setDraft(null); setProfileError(null); }}>Hủy</Btn>
            </div>
          </form>
        </Card>
        <Card title="Đổi mật khẩu">
          <form className="space-y-4" onSubmit={savePassword}>
            <p className="text-sm text-[#42526e]">Đổi mật khẩu sẽ kết thúc các phiên hiện tại của tài khoản.</p>
            {([
              ['oldPassword', 'Mật khẩu hiện tại', 'current-password'],
              ['newPassword', 'Mật khẩu mới', 'new-password'],
              ['confirm', 'Nhập lại mật khẩu mới', 'new-password'],
            ] as const).map(([key, label, autocomplete]) => (
              <Field key={key} label={label} required error={fieldErrors[key]}>{(props) => (
                <TextInput {...props} type="password" required autoComplete={autocomplete} value={password[key]} disabled={pending !== null || profileUncertain}
                  onChange={(event) => setPassword({ ...password, [key]: event.target.value })} />
              )}</Field>
            ))}
            {passwordError && <InlineAlert tone="error">{passwordError}</InlineAlert>}
            <Btn type="submit" variant="primary" disabled={pending !== null || profileUncertain}>{pending === 'password' ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu'}</Btn>
          </form>
        </Card>
      </div>
    </div>
  );
}
