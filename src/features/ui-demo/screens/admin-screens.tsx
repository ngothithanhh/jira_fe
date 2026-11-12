'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Avatar, Btn, Card, ConfirmDialog, EmptyState, InlineAlert, Modal, PageHeading, SearchInput, SelectInput, StateView, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { Screen, routes, useCan } from '../common';
import { ADMIN_ROLE, adminOverview, findRole, findUser, setGlobalRoles, setUserEnabled, userLabel } from '../logic';
import { useDemo } from '../provider';
import type { DemoUser, PermissionCode } from '../types';

/** Cổng quyền của từng trang quản trị; reducer vẫn kiểm lại quyền ở mọi action, không chỉ ẩn nút. */
export function AdminGuard({ perm, children }: { perm: PermissionCode; children: ReactNode }) {
  const allowed = useCan(perm);
  if (!allowed)
    return (
      <StateView
        kind="forbidden"
        description="Trang này chỉ dành cho quản trị viên hệ thống. Đổi sang persona Lê Quản Trị trong Công cụ demo để xem."
        action={
          <Link href={routes.projects} className="text-sm font-medium text-[#0052cc] hover:underline">
            Về danh sách dự án
          </Link>
        }
      />
    );
  return (<div className="relative overflow-x-auto"><Screen>{children}</Screen></div>);
}

/** Tổng quan quản trị: mọi số đếm tính từ DemoState hiện tại. */
export function AdminOverviewScreen() {
  const { state } = useDemo();
  const o = adminOverview(state);
  const recent = [...state.auditEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, 8);
  const stats: [string, number, string][] = [
    ['Người dùng', o.users, routes.admin('users')],
    ['Đang hoạt động', o.enabledUsers, routes.admin('users')],
    ['Quản trị viên', o.admins, routes.admin('users')],
    ['Dự án', o.projects, routes.projects],
    ['Công việc', o.issues, routes.projects],
    ['Sprint đang chạy', o.activeSprints, routes.projects],
    ['Sprint đã đóng', o.closedSprints, routes.projects],
  ];
  return (
    <AdminGuard perm="VIEW_AUDIT">
      <PageHeading title="Quản trị hệ thống" description="Số liệu tính từ dữ liệu mẫu hiện tại." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {stats.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-[3px] border border-[#dfe1e6] px-4 py-3 hover:bg-[#f4f5f7]">
            <p className="text-xs text-[#6b778c]">{label}</p>
            <p className="mt-1 text-2xl font-medium">{value}</p>
          </Link>
        ))}
      </div>
      <Card title="Nhật ký gần đây" action={<Link className="text-[13px] text-[#0052cc] hover:underline" href={routes.admin('audit')}>Xem tất cả</Link>}>
        <ul className="divide-y divide-[#ebecf0]">
          {recent.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-2 py-2 text-[13px]">
              <span className="w-36 shrink-0 text-[#6b778c]">{formatDate(e.createdAt, true)}</span>
              <span className="w-40 shrink-0 font-medium">{e.actorId === null ? 'Hệ thống' : userLabel(state, e.actorId)}</span>
              <span className="rounded-[3px] bg-[#f4f5f7] px-1.5 text-[11px] font-semibold text-[#42526e]">{e.action}</span>
              <span className="min-w-0 flex-1 text-[#42526e]">{e.detail}</span>
            </li>
          ))}
        </ul>
      </Card>
    </AdminGuard>
  );
}

/** Người dùng: khóa/mở và gán role hệ thống; luôn giữ ít nhất một quản trị viên đang hoạt động. */
export function AdminUsersScreen() {
  const { state } = useDemo();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const q = query.trim().toLocaleLowerCase('vi');
  const users = state.users.filter(
    (u) => (!q || `${u.fullName} ${u.userName} ${u.email}`.toLocaleLowerCase('vi').includes(q)) && (status === 'all' || (status === 'enabled') === u.enabled),
  );
  const roleNames = (id: number) => state.userRoles.filter((a) => a.userId === id).map((a) => findRole(state, a.roleId)?.name);
  return (
    <AdminGuard perm="MANAGE_USERS">
      <PageHeading title="Người dùng" breadcrumbs={[{ label: 'Quản trị', href: routes.admin() }, { label: 'Người dùng' }]} />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tên, tên đăng nhập, email" label="Tìm người dùng" />
        <SelectInput aria-label="Lọc trạng thái tài khoản" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
          <option value="all">Mọi trạng thái</option>
          <option value="enabled">Đang hoạt động</option>
          <option value="disabled">Bị khóa</option>
        </SelectInput>
      </div>
      {!users.length ? (
        <EmptyState title="Không có người dùng khớp" />
      ) : (
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Người dùng</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Role hệ thống</th>
                <th className={thClass}>Dự án</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#f4f5f7]">
                  <td className={tdClass}>
                    <span className="flex items-center gap-2">
                      <Avatar name={u.fullName} src={u.avatarUrl} size={28} />
                      <span>
                        <span className="block font-medium">{u.fullName}</span>
                        <span className="block text-xs text-[#6b778c]">@{u.userName}</span>
                      </span>
                    </span>
                  </td>
                  <td className={tdClass}>{u.email}</td>
                  <td className={tdClass}>{roleNames(u.id).join(', ') || <span className="text-[#6b778c]">—</span>}</td>
                  <td className={tdClass}>{state.memberships.filter((m) => m.userId === u.id).length}</td>
                  <td className={tdClass}>
                    <span className={u.enabled ? 'rounded-[3px] bg-[#e3fcef] px-1.5 text-[11px] font-bold text-[#006644]' : 'rounded-[3px] bg-[#ffebe6] px-1.5 text-[11px] font-bold text-[#bf2600]'}>
                      {u.enabled ? 'HOẠT ĐỘNG' : 'BỊ KHÓA'}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <Btn variant="subtle" onClick={() => setSelected(u.id)}>
                      Chi tiết
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected !== null && findUser(state, selected) && <UserDetail user={findUser(state, selected)!} onClose={() => setSelected(null)} />}
    </AdminGuard>
  );
}

/** Chi tiết user: tick role hệ thống rồi Lưu/Hủy; khóa/mở cần xác nhận. Lỗi admin cuối hiện ngay trong dialog. */
function UserDetail({ user, onClose }: { user: DemoUser; onClose: () => void }) {
  const { state, act } = useDemo();
  const globalRoles = state.roles.filter((r) => r.scope === 'GLOBAL');
  const current = state.userRoles.filter((a) => a.userId === user.id).map((a) => a.roleId);
  const [roles, setRoles] = useState<number[]>(current);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const dirty = roles.length !== current.length || roles.some((r) => !current.includes(r));
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={user.fullName} description={`${user.email} · tạo ${formatDate(user.createdAt)}`} width={560}>
      <div className="space-y-5 pb-2">
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[#6b778c]">Role hệ thống</h3>
          <div className="space-y-1.5">
            {globalRoles.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={roles.includes(r.id)} onChange={(e) => setRoles((list) => (e.target.checked ? [...list, r.id] : list.filter((x) => x !== r.id)))} />
                <span>
                  <span className="font-medium">{r.name}</span>
                  {r.name === ADMIN_ROLE && <span className="ml-1 text-xs text-[#974f0c]">(dành riêng)</span>}
                  <span className="block text-xs text-[#6b778c]">{r.description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#6b778c]">Vai trò trong từng dự án được quản lý ở trang Thành viên của dự án, không ở đây.</p>
          <div className="mt-3 flex gap-2">
            <Btn
              variant="primary"
              disabled={!dirty}
              onClick={() => {
                const r = act((s, c) => setGlobalRoles(s, c, user.id, roles), 'Đã lưu role hệ thống');
                setError(r.ok ? '' : r.message);
              }}
            >
              Lưu role
            </Btn>
            <Btn variant="subtle" disabled={!dirty} onClick={() => (setRoles(current), setError(''))}>
              Hủy
            </Btn>
          </div>
        </section>
        <section className="border-t border-[#ebecf0] pt-4">
          <h3 className="mb-2 text-xs font-semibold text-[#6b778c]">Trạng thái tài khoản</h3>
          <p className="mb-2 text-sm">{user.enabled ? 'Đang hoạt động.' : 'Đang bị khóa: không đăng nhập và không có quyền nào.'}</p>
          <Btn variant={user.enabled ? 'danger' : 'primary'} onClick={() => setToggling(true)}>
            {user.enabled ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          </Btn>
        </section>
      </div>
      <ConfirmDialog
        open={toggling}
        onOpenChange={setToggling}
        danger={user.enabled}
        title={user.enabled ? `Khóa ${user.fullName}?` : `Mở khóa ${user.fullName}?`}
        description={user.enabled ? 'Phiên đăng nhập thật của người này sẽ bị thu hồi khi nối backend. Lịch sử và công việc giữ nguyên.' : 'Người dùng đăng nhập lại được với quyền như trước khi khóa.'}
        confirmLabel={user.enabled ? 'Khóa' : 'Mở khóa'}
        onConfirm={() => {
          const r = act((s, c) => setUserEnabled(s, c, user.id, !user.enabled), user.enabled ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản');
          setError(r.ok ? '' : r.message);
          return true;
        }}
      />
    </Modal>
  );
}
