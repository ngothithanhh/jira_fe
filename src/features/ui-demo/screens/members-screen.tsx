'use client';

import { useState } from 'react';
import { Crown, Plus } from 'lucide-react';
import { Avatar, Btn, ConfirmDialog, EmptyState, Field, InlineAlert, Modal, PageHeading, SearchInput, SelectInput, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { Screen, routes, useCan, useProject } from '../common';
import { addMember, changeMemberRole, findRole, findUser, PM_ROLE, projectMembers, removeMember, userLabel } from '../logic';
import { useDemo } from '../provider';

/**
 * Thành viên dự án: role ở đây là role THÀNH VIÊN (phạm vi dự án), tách khỏi role hệ thống.
 * Tối đa một PROJECT_MANAGER; trưởng dự án không gỡ trực tiếp được.
 */
export function MembersScreen() {
  const project = useProject();
  const { state, act } = useDemo();
  const canManage = useCan('ADD_MEMBER', project.id);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(0);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const projectRoles = state.roles.filter((r) => r.scope === 'PROJECT');
  const q = query.trim().toLocaleLowerCase('vi');
  const members = projectMembers(state, project.id)
    .map((m) => ({ ...m, user: findUser(state, m.userId) }))
    .filter((m) => (!q || `${m.user?.fullName} ${m.user?.email}`.toLocaleLowerCase('vi').includes(q)) && (!roleFilter || m.roleId === roleFilter))
    .sort((a, b) => Number(b.userId === project.leadId) - Number(a.userId === project.leadId) || (a.user?.fullName ?? '').localeCompare(b.user?.fullName ?? '', 'vi'));

  return (
    <Screen empty={<EmptyState title="Chưa có thành viên" />}>
      <PageHeading
        title="Thành viên"
        breadcrumbs={[{ label: 'Dự án', href: routes.projects }, { label: project.name, href: routes.project(project.id) }, { label: 'Thành viên' }]}
        description="Vai trò thành viên chỉ áp dụng trong dự án này; vai trò hệ thống được quản lý ở khu quản trị."
        actions={
          canManage && (
            <Btn variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Thêm thành viên
            </Btn>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tên hoặc email" label="Tìm thành viên" />
        <SelectInput aria-label="Lọc vai trò" value={roleFilter} onChange={(e) => setRoleFilter(Number(e.target.value))} className="w-auto">
          <option value={0}>Mọi vai trò</option>
          {projectRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectInput>
      </div>
      {!canManage && (
        <div className="mb-3">
          <InlineAlert tone="info">Bạn chỉ được xem danh sách. Trưởng dự án hoặc người có quyền quản lý thành viên mới thêm/gỡ được.</InlineAlert>
        </div>
      )}
      {!members.length ? (
        <EmptyState title="Không có thành viên khớp" action={<Btn onClick={() => (setQuery(''), setRoleFilter(0))}>Xóa bộ lọc</Btn>} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Thành viên</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Vai trò trong dự án</th>
                <th className={thClass}>Tham gia</th>
                <th className={thClass}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const lead = m.userId === project.leadId;
                return (
                  <tr key={m.userId} className="hover:bg-[#f4f5f7]">
                    <td className={tdClass}>
                      <span className="flex items-center gap-2">
                        <Avatar name={m.user?.fullName ?? '?'} src={m.user?.avatarUrl} size={28} />
                        <span className="font-medium">{userLabel(state, m.userId)}</span>
                        {lead && (
                          <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#fffae6] px-1.5 text-[11px] font-semibold text-[#974f0c]">
                            <Crown size={11} aria-hidden /> Trưởng dự án
                          </span>
                        )}
                        {m.user && !m.user.enabled && <span className="rounded-[3px] bg-[#ffebe6] px-1.5 text-[11px] font-semibold text-[#bf2600]">Bị khóa</span>}
                      </span>
                    </td>
                    <td className={tdClass}>{m.user?.email ?? '—'}</td>
                    <td className={tdClass}>
                      {canManage ? (
                        <SelectInput
                          aria-label={`Vai trò của ${userLabel(state, m.userId)}`}
                          value={m.roleId}
                          className="h-8 w-auto"
                          onChange={(e) => act((s, c) => changeMemberRole(s, c, project.id, m.userId, Number(e.target.value)), 'Đã đổi vai trò')}
                        >
                          {projectRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </SelectInput>
                      ) : (
                        findRole(state, m.roleId)?.name
                      )}
                    </td>
                    <td className={tdClass}>{formatDate(m.joinedAt)}</td>
                    <td className={tdClass}>
                      {canManage && (
                        <Btn variant="subtle" disabled={lead} title={lead ? 'Đổi trưởng dự án trong Cài đặt trước khi gỡ' : undefined} onClick={() => setRemoving(m.userId)}>
                          Gỡ
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddMemberDialog projectId={project.id} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Gỡ ${userLabel(state, removing)} khỏi dự án?`}
        description="Người này sẽ mất quyền xem dự án. Công việc đang giao cho họ vẫn giữ nguyên người phụ trách để bạn tự xử lý."
        confirmLabel="Gỡ thành viên"
        onConfirm={() => (removing !== null ? act((s, c) => removeMember(s, c, project.id, removing), 'Đã gỡ thành viên').ok : false)}
      />
    </Screen>
  );
}

/** Chỉ liệt kê user đang hoạt động chưa thuộc dự án; role chọn từ danh mục phạm vi dự án. */
function AddMemberDialog({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const { state, act } = useDemo();
  const candidates = state.users.filter((u) => u.enabled && !state.memberships.some((m) => m.projectId === projectId && m.userId === u.id));
  const roles = state.roles.filter((r) => r.scope === 'PROJECT');
  const hasPm = state.memberships.some((m) => m.projectId === projectId && findRole(state, m.roleId)?.name === PM_ROLE);
  const [userId, setUserId] = useState(candidates[0]?.id ?? 0);
  const [roleId, setRoleId] = useState(roles.find((r) => r.name === 'DEVELOPER')?.id ?? roles[0]?.id ?? 0);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Thêm thành viên"
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Hủy
          </Btn>
          <Btn variant="primary" disabled={!userId} onClick={() => act((s, c) => addMember(s, c, projectId, userId, roleId), 'Đã thêm thành viên').ok && onClose()}>
            Thêm
          </Btn>
        </>
      }
    >
      {!candidates.length ? (
        <InlineAlert tone="info">Mọi tài khoản đang hoạt động đều đã là thành viên.</InlineAlert>
      ) : (
        <div className="space-y-4">
          <Field label="Người dùng" required>
            {(p) => (
              <SelectInput {...p} value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} · {u.email}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Vai trò trong dự án" required hint={hasPm ? 'Dự án đã có PROJECT_MANAGER; mỗi dự án tối đa một người.' : undefined}>
            {(p) => (
              <SelectInput {...p} value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.name === PM_ROLE && hasPm}>
                    {r.name} — {r.description}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      )}
    </Modal>
  );
}
