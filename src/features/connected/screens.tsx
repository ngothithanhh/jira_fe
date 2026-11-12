'use client';

import { PageHeading } from '@/components/project-ui/kit';
import { useSession } from './session';
export { ConnectedProjectsList as ConnectedProjects } from './projects/screens';

/** Hồ sơ lấy từ /account/context của JWT; không hiển thị quyền từ persona hoặc cho phép sửa chưa nối API. */
export function ConnectedAccount() {
  const { data } = useSession();
  if (!data) return null;
  const { user } = data;
  return <div className="max-w-2xl space-y-6"><PageHeading title="Tài khoản" description="Thông tin tài khoản đang đăng nhập." />
    <div className="flex items-center gap-4 rounded-[3px] border border-[#dfe1e6] p-5"><div className="flex size-14 items-center justify-center rounded-full bg-[#deebff] text-xl font-semibold text-[#0052cc]" aria-hidden>{(user.fullName || user.userName).slice(0, 1).toUpperCase()}</div><div><h2 className="font-semibold">{user.fullName || user.userName}</h2><p className="text-sm text-[#6b778c]">{user.email}</p></div></div>
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-4 text-sm"><dt className="text-[#6b778c]">Tên người dùng</dt><dd>{user.userName}</dd><dt className="text-[#6b778c]">Họ và tên</dt><dd>{user.fullName || 'Chưa cập nhật'}</dd><dt className="text-[#6b778c]">Trạng thái</dt><dd><span className="rounded-[3px] bg-[#e3fcef] px-2 py-1 text-[#006644]">Đang hoạt động</span></dd><dt className="text-[#6b778c]">Vai trò hệ thống</dt><dd>{data.systemAdmin ? 'Quản trị viên hệ thống' : 'Người dùng'}</dd></dl>
  </div>;
}
