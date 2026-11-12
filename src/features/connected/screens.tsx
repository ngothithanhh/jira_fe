'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import { Btn, EmptyState, InlineAlert, PageHeading, SearchInput, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { connectedRequest } from './client';
import { useSession } from './session';

type ProjectSummary = { projectId: number; projectName: string; projectKey: string; description: string | null; leader: { id: number; userName: string; email: string } | null };

/** Danh sách chỉ lấy project BE đã lọc VIEW_PROJECT; tìm kiếm cục bộ trên danh sách API cũ chưa có phân trang. */
export function ConnectedProjects() {
  const session = useSession();
  const [search, setSearch] = useState('');
  const projects = useQuery({ queryKey: ['connected', 'projects', session.data?.user.userId], enabled: !!session.data,
    queryFn: ({ signal }) => connectedRequest<ProjectSummary[]>('projects/getList', { signal }), retry: false });
  const filtered = (projects.data || []).filter((p) => `${p.projectKey} ${p.projectName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <div className="space-y-5"><PageHeading title="Dự án" description="Các dự án bạn được phép truy cập." />
    <SearchInput label="Tìm dự án" placeholder="Tìm theo tên hoặc mã dự án" value={search} onChange={setSearch} className="max-w-sm" />
    {projects.isPending ? <p role="status" className="text-sm text-[#6b778c]">Đang tải dự án…</p> : projects.isError ? <div className="space-y-3"><InlineAlert tone="error">{projects.error.message}</InlineAlert><Btn onClick={() => void projects.refetch()}>Thử lại</Btn></div>
      : !filtered.length ? <EmptyState icon={<FolderKanban />} title={search ? 'Không tìm thấy dự án' : 'Chưa có dự án'} description={search ? 'Thử tìm bằng tên hoặc mã khác.' : 'Bạn chưa được thêm vào dự án nào. Liên hệ quản lý để được cấp quyền truy cập.'} />
      : <div className="overflow-x-auto rounded-[3px] border border-[#dfe1e6]"><table className={tableClass}><thead><tr><th className={thClass}>Dự án</th><th className={thClass}>Mã</th><th className={thClass}>Người phụ trách</th><th className={thClass}>Mô tả</th></tr></thead><tbody>{filtered.map((p) => <tr key={p.projectId}><td className={`${tdClass} font-medium`}>{p.projectName}</td><td className={tdClass}>{p.projectKey}</td><td className={tdClass}>{p.leader?.userName || 'Chưa có người phụ trách'}</td><td className={`${tdClass} max-w-md`}>{p.description || 'Chưa có mô tả'}</td></tr>)}</tbody></table></div>}
  </div>;
}

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
