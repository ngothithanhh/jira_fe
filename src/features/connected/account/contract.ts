export type ProfileDraft = { userName: string; fullName: string };
export type PasswordDraft = { oldPassword: string; newPassword: string; confirm: string };

const withinPasswordBytes = (value: string) => new TextEncoder().encode(value).length <= 72;
export const validOldPassword = (value: string) => !!value.trim() && withinPasswordBytes(value);
export const validNewPassword = (value: string) => value.length >= 8 && validOldPassword(value);

export function accountBody(action: 'profile' | 'password', input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dữ liệu tài khoản không hợp lệ.');
  const fields = input as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (action === 'password') {
    const { oldPassword, newPassword } = fields;
    if (keys.length !== 2 || typeof oldPassword !== 'string' || !validOldPassword(oldPassword)
      || typeof newPassword !== 'string' || !validNewPassword(newPassword)) {
      throw new Error('Mật khẩu mới cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.');
    }
    return JSON.stringify({ oldPassword, newPassword });
  }
  if (keys.length === 0 || keys.some((key) => key !== 'userName' && key !== 'fullName')) throw new Error('Dữ liệu hồ sơ không hợp lệ.');
  const { userName, fullName } = fields;
  if (('userName' in fields && (typeof userName !== 'string' || !userName.trim() || userName.length > 50))
    || ('fullName' in fields && (typeof fullName !== 'string' || fullName.length > 100))) {
    throw new Error('Tên người dùng tối đa 50 ký tự, họ và tên tối đa 100 ký tự.');
  }
  return JSON.stringify({ userName: typeof userName === 'string' ? userName.trim() : undefined, fullName });
}
