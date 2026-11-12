'use client';

import { useState, type FormEvent } from 'react';
import { Crown, Plus } from 'lucide-react';
import { Avatar, Btn, EmptyState, Field, InlineAlert, Modal, PageHeading, SearchInput, SelectInput, TextInput, formatDate, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import { useSession } from '../session';
import { useConnectedProject } from '../projects/queries';
import type { ProjectDto } from '../projects/model';
import { isCandidateEmail } from './contract';
import { useMemberCandidate, useMemberRoles, useMembers, useMemberWrite, type Member, type ProjectRole } from './queries';

const manager = 'PROJECT_MANAGER';
const displayName = (member: Member) => member.fullName || member.userName;

export function ConnectedMembers({ projectId }: { projectId: number }) {
  const session = useSession();
  const project = useConnectedProject(projectId);
  const actor = session.data?.user.userId;
  if (actor === undefined || session.switching || !project.data) return null;
  const { context } = project.data;
  const can = (permission: string) => !project.isError && (context.systemAdmin || context.projectPermissions.includes(permission));
  return <MemberScreen key={actor + ':' + projectId} actor={actor} project={project.data.project} canAdd={can('ADD_MEMBER')} canRemove={can('DELETE_MEMBER')} readFailed={project.isError} reloadProject={()=>void project.refetch()} />;
}

function MemberScreen({ actor, project, canAdd, canRemove, readFailed, reloadProject }: {
  actor: number; project: ProjectDto; canAdd: boolean; canRemove: boolean; readFailed: boolean; reloadProject:()=>void;
}) {
  const projectId = project.projectId;
  const members = useMembers(actor, projectId);
  const roles = useMemberRoles(actor, projectId, canAdd);
  const write = useMemberWrite(actor, projectId);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(0);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const all = members.data ?? [];
  const normalized = search.trim().toLocaleLowerCase('vi');
  const visible = all.filter((member) => (!roleFilter || member.roleId === roleFilter)
    && [member.fullName, member.userName, member.email].some((field) => field?.toLocaleLowerCase('vi').includes(normalized)))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'vi'));
  const roleFilters = new Map(all.map((member) => [member.roleId, member.role]));
  const leadId = project.leader?.id;
  const managerId = all.find((member) => member.role.toUpperCase() === manager)?.userId;
  const ready = members.isSuccess && roles.isSuccess && !roles.isFetching;

  function closeDialogs() {
    setAdding(false);
    setRemoving(null);
    write.clearError();
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Thành viên"
        description="Vai trò thành viên áp dụng trong dự án này."
        breadcrumbs={[{ label: 'Dự án', href: '/app/projects' }, { label: project.projectName, href: '/app/projects/' + projectId + '/overview' }, { label: 'Thành viên' }]}
        actions={canAdd && (
          <Btn variant="primary" disabled={!ready || write.busy || write.uncertain || !roles.data.length} onClick={() => { write.clearError(); setAdding(true); }}>
            <Plus /> Thêm thành viên
          </Btn>
        )}
      />
      {project.leader && (
        <p className="flex items-center gap-2 text-sm">
          <Crown size={16} aria-hidden /> Trưởng dự án <strong>{project.leader.userName}</strong>
        </p>
      )}
      {!canAdd && !canRemove && <InlineAlert tone="info">Bạn chỉ có quyền xem danh sách thành viên.</InlineAlert>}
      {canAdd && roles.isError && (
        <InlineAlert tone="error">{roles.error.message} <Btn onClick={() => void roles.refetch()}>Tải lại vai trò</Btn></InlineAlert>
      )}
      {members.isPending && <p role="status">Đang tải thành viên…</p>}
      {members.isError && (
        <InlineAlert tone="error">{members.error.message} <Btn onClick={() => void members.refetch()}>Tải lại thành viên</Btn></InlineAlert>
      )}
      {members.isSuccess && (
        <>
          <div className="flex flex-wrap gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Tên hoặc email" label="Tìm thành viên" />
            <SelectInput aria-label="Lọc vai trò" value={roleFilter} onChange={(event) => setRoleFilter(Number(event.target.value))} className="w-auto">
              <option value={0}>Mọi vai trò</option>
              {[...roleFilters].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </SelectInput>
          </div>
          {!visible.length ? (
            <EmptyState title={all.length ? 'Không có thành viên khớp' : 'Chưa có thành viên'}
              action={all.length > 0 && <Btn onClick={() => { setSearch(''); setRoleFilter(0); }}>Xóa bộ lọc</Btn>} />
          ) : (
            <div className="overflow-x-auto rounded border border-[#dfe1e6]">
              <table className={tableClass} aria-label="Thành viên dự án">
                <thead><tr>
                  <th scope="col" className={thClass}>Thành viên</th>
                  <th scope="col" className={thClass}>Email</th>
                  <th scope="col" className={thClass}>Vai trò trong dự án</th>
                  <th scope="col" className={thClass}>Tham gia</th>
                  {canRemove && <th scope="col" className={thClass}>Thao tác</th>}
                </tr></thead>
                <tbody>{visible.map((member) => (
                  <tr key={member.userId} className="hover:bg-[#f4f5f7]">
                    <td className={tdClass}>
                      <span className="flex items-center gap-2">
                        <Avatar name={displayName(member)} size={28} />
                        <span className="font-medium">{displayName(member)}</span>
                        {leadId === member.userId && <Crown size={13} aria-label="Trưởng dự án" />}
                      </span>
                    </td>
                    <td className={tdClass}>{member.email}</td>
                    <td className={tdClass}>
                      {canAdd && roles.isSuccess ? (
                        <SelectInput aria-label={'Vai trò của ' + displayName(member)} value={member.roleId} disabled={write.busy||write.uncertain||readFailed||members.isError}
                          className="h-8 w-auto"
                          onChange={(event) => void write.submit({ kind: 'role', userId: member.userId, roleId: Number(event.target.value) }, () => {})}>
                          {!roles.data.some((role) => role.role === member.roleId) && <option value={member.roleId} disabled>{member.role}</option>}
                          {roles.data.map((role) => <option key={role.role} value={role.role}
                            disabled={role.roleName.toUpperCase() === manager && managerId !== undefined && managerId !== member.userId}>{role.roleName}</option>)}
                        </SelectInput>
                      ) : member.role}
                    </td>
                    <td className={tdClass}><time dateTime={member.assignedAt ?? undefined}>{formatDate(member.assignedAt, true)}</time></td>
                    {canRemove && <td className={tdClass}>
                      <Btn variant="subtle" disabled={write.busy || write.uncertain || readFailed || members.isError || leadId === member.userId} aria-label={'Gỡ ' + displayName(member)}
                        onClick={() => { write.clearError(); setRemoving(member); }}>Gỡ</Btn>
                    </td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
      {write.busy && <p role="status">Đang cập nhật thành viên…</p>}
      {write.uncertain&&<InlineAlert tone="warning">Kết quả đã lưu nhưng chưa đồng bộ. <Btn onClick={()=>window.location.reload()}>Tải lại trang</Btn></InlineAlert>}
      {write.error && !adding && !removing && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {adding && (canAdd || readFailed) && roles.data && (
        <AddMemberDialog actor={actor} projectId={projectId} roles={roles.data} hasManager={managerId !== undefined}
          busy={write.busy} blocked={!canAdd||readFailed||write.uncertain} readFailed={readFailed} reloadProject={reloadProject} error={write.error} close={closeDialogs}
          add={(userId, roleId) => void write.submit({ kind: 'add', userId, roleId }, closeDialogs)} />
      )}
      {removing && (canRemove || readFailed) && (
        <Modal open title={'Gỡ ' + displayName(removing) + ' khỏi dự án?'}
          onOpenChange={(open) => { if (!open && !write.busy) closeDialogs(); }}
          footer={<>
            <Btn variant="subtle" disabled={write.busy} onClick={closeDialogs}>Hủy</Btn>
            <Btn variant="danger" disabled={write.busy||write.uncertain||readFailed||!canRemove}
              onClick={() => void write.submit({ kind: 'remove', userId: removing.userId }, closeDialogs)}>Gỡ thành viên</Btn>
          </>}>
          <p className="text-sm">Vai trò thành viên của người này sẽ bị gỡ khỏi dự án.</p>
          {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
        </Modal>
      )}
    </div>
  );
}

function AddMemberDialog({ actor, projectId, roles, hasManager, busy, blocked, readFailed, reloadProject, error, close, add }: {
  actor: number; projectId: number; roles: ProjectRole[]; hasManager: boolean; busy: boolean;
  blocked: boolean; readFailed:boolean; reloadProject:()=>void; error: string | null; close: () => void; add: (userId: number, roleId: number) => void;
}) {
  const available = roles.filter((role) => !hasManager || role.roleName.toUpperCase() !== manager);
  const [roleId, setRoleId] = useState(() => available.find((role) => role.roleName === 'DEVELOPER')?.role ?? available[0]?.role ?? 0);
  const [email, setEmail] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const candidate = useMemberCandidate(actor, projectId, searched);
  const user = candidate.isSuccess && !candidate.isFetching ? candidate.data[0] : undefined;

  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!isCandidateEmail(value) || busy) return;
    if (value === searched) void candidate.refetch();
    else setSearched(value);
  }

  return (
    <Modal open title="Thêm thành viên" onOpenChange={(open) => { if (!open && !busy) close(); }}
      footer={<>
        <Btn variant="subtle" onClick={close} disabled={busy}>Hủy</Btn>
        <Btn variant="primary" disabled={busy || blocked || !user || !available.some((role) => role.role === roleId)}
          onClick={() => { if (user && !blocked) add(user.userId, roleId); }}>{busy ? 'Đang thêm…' : 'Thêm'}</Btn>
      </>}>
      <div className="space-y-4">
        {/* Gate lỗi giữ nguyên form; nút retry nằm trong modal để người dùng không phải đóng và mất draft. */}
        {readFailed&&<InlineAlert tone="warning">Chưa tải lại được quyền dự án. Bản nháp được giữ; tải lại trước khi thêm. <Btn disabled={busy} onClick={reloadProject}>Tải lại dự án</Btn></InlineAlert>}
        <form className="space-y-2" onSubmit={find}>
          <Field label="Email ứng viên" required>{(props) => (
            <TextInput {...props} type="email" maxLength={100} required value={email} disabled={busy}
              onChange={(event) => { setEmail(event.target.value); setSearched(null); }} />
          )}</Field>
          <Btn type="submit" disabled={busy || !isCandidateEmail(email.trim()) || candidate.isFetching}>Tìm ứng viên</Btn>
        </form>
        {candidate.isFetching && <p role="status">Đang tìm ứng viên…</p>}
        {candidate.isError && <InlineAlert tone="error">{candidate.error.message}</InlineAlert>}
        {candidate.isSuccess && !candidate.isFetching && (
          <InlineAlert tone="info">{user ? 'Ứng viên: ' + (user.fullName || user.userName) : 'Không tìm thấy ứng viên đủ điều kiện.'}</InlineAlert>
        )}
        <Field label="Vai trò trong dự án" required>{(props) => (
          <SelectInput {...props} value={roleId} onChange={(event) => setRoleId(Number(event.target.value))} disabled={busy || !available.length}>
            {!available.length && <option value={0}>Chưa có vai trò khả dụng</option>}
            {available.map((role) => <option key={role.role} value={role.role}>{role.roleName}</option>)}
          </SelectInput>
        )}</Field>
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
      </div>
    </Modal>
  );
}
