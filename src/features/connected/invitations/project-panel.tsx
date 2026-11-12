'use client';

import { useState } from 'react';
import { Btn, Card, Field, InlineAlert, Modal, SelectInput, TextInput } from '@/components/project-ui/kit';
import type { ProjectRole } from '../members/queries';
import { deliveryLabel, inviteStates, projectInvites, stateLabel, validInviteEmail, type Invitation, type InvitationPage } from './contract';
import { useInvitationRead, useInvitationWrite } from './queries';

export function ProjectInvitations({ actor, projectId, roles, hasManager, canWrite, visible, create, close, reloadProject }: {
  actor: number; projectId: number; roles: ProjectRole[]; hasManager: boolean; canWrite: boolean;
  visible: boolean; create: boolean; close: () => void; reloadProject: () => void;
}) {
  const path = projectInvites(projectId);
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useInvitationRead<InvitationPage>(actor, projectId,
    path + '?offset=' + offset + (filter ? '&state=' + filter : ''), visible || create);
  const write = useInvitationWrite(actor, projectId);
  const [action, setAction] = useState<{ kind: 'resend' | 'revoke'; item: Invitation } | null>(null);
  const [notice, setNotice] = useState('');
  const blocked = !canWrite || write.busy || write.uncertain;
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(0);
  const available = roles.filter((role) => !hasManager || role.roleName.toUpperCase() !== 'PROJECT_MANAGER');
  const selectedRole = roleId || available.find((role) => role.roleName === 'DEVELOPER')?.role || available[0]?.role || 0;

  function updated(message: string) {
    setNotice(message);
    void list.refetch();
  }

  return <>
    {visible && <Card title="Lời mời">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SelectInput aria-label="Lọc trạng thái lời mời" value={filter} onChange={(event) => { setOffset(0); setFilter(event.target.value); }}>
          <option value="">Mọi trạng thái</option>
          {inviteStates.map((state) => <option key={state} value={state}>{stateLabel[state]}</option>)}
        </SelectInput>
        <Btn onClick={() => void list.refetch()} disabled={list.isFetching}>Tải lại lời mời</Btn>
      </div>
      {notice && <p role="status">{notice}</p>}
      {write.uncertain && <InlineAlert tone="warning">Chưa xác nhận được kết quả. <Btn onClick={() => window.location.reload()}>Tải lại trang</Btn></InlineAlert>}
      {write.error && !action && !create && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {list.isPending && <p role="status">Đang tải lời mời…</p>}
      {list.isError && <InlineAlert tone="error">{list.error.message}</InlineAlert>}
      {list.isSuccess && list.data.items.length === 0 && <p>Chưa có lời mời.</p>}
      <ul className="divide-y">
        {list.data?.items.map((item) => <li key={item.invitationId} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <p className="break-all font-medium">{item.email}</p>
            <p className="text-sm">{item.roleName} · {stateLabel[item.state]} · {deliveryLabel[item.deliveryState ?? ''] ?? 'Chưa có trạng thái gửi'}</p>
            {item.deliveryError === 'MAIL_REAUTH' && <p className="text-sm">Dịch vụ gửi thư cần được xác thực lại.</p>}
            <time className="text-sm" dateTime={item.expiresAt}>Hết hạn {new Date(item.expiresAt).toLocaleString('vi-VN')}</time>
          </div>
          {item.state === 'PENDING' && <div className="flex gap-2">
            <Btn disabled={blocked || !item.canResend} onClick={() => { write.clearError(); setAction({ kind: 'resend', item }); }}>Gửi lại</Btn>
            <Btn disabled={blocked} onClick={() => { write.clearError(); setAction({ kind: 'revoke', item }); }}>Thu hồi</Btn>
          </div>}
        </li>)}
      </ul>
      <div className="flex gap-2">
        {offset > 0 && <Btn onClick={() => setOffset(offset - 20)}>Trang trước</Btn>}
        {list.data?.hasMore && <Btn onClick={() => setOffset(offset + 20)}>Trang sau</Btn>}
      </div>
    </Card>}
    {create && <Modal open title="Mời thành viên" onOpenChange={(open) => { if (!open && !write.busy) close(); }}
      footer={<><Btn onClick={close} disabled={write.busy}>Hủy</Btn><Btn variant="primary" form="invite-member" type="submit"
        disabled={blocked || !validInviteEmail(email) || !available.some((role) => role.role === selectedRole)}>Gửi lời mời</Btn></>}>
      <form id="invite-member" className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (blocked || !validInviteEmail(email)) return;
        void write.submit(path, { email: email.trim(), roleId: selectedRole }, () => {
          setEmail(''); setRoleId(0); close(); updated('Đã tạo lời mời. Email đang chờ gửi.');
        });
      }}>
        {!canWrite && <InlineAlert tone="warning">Chưa xác nhận được quyền mời. <Btn type="button" onClick={reloadProject}>Tải lại dự án</Btn></InlineAlert>}
        <Field label="Email người nhận" required>{(props) => <TextInput {...props} type="email" maxLength={100} value={email} onChange={(event) => setEmail(event.target.value)} />}</Field>
        <Field label="Vai trò trong dự án" required>{(props) => <SelectInput {...props} value={selectedRole} onChange={(event) => setRoleId(Number(event.target.value))}>
          {available.map((role) => <option key={role.role} value={role.role}>{role.roleName}</option>)}
        </SelectInput>}</Field>
        {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
      </form>
    </Modal>}
    {action && <Modal open title={action.kind === 'resend' ? 'Gửi lại lời mời?' : 'Thu hồi lời mời?'}
      onOpenChange={(open) => { if (!open && !write.busy) setAction(null); }}
      footer={<><Btn onClick={() => setAction(null)} disabled={write.busy}>Hủy</Btn>
        <Btn variant="primary" disabled={blocked} onClick={() => void write.submit(
          path + '/' + action.item.invitationId + '/' + action.kind, undefined, () => {
            updated(action.kind === 'resend' ? 'Email mới đang chờ gửi.' : 'Đã thu hồi lời mời.');
            setAction(null);
          })}>Xác nhận</Btn></>}>
      <p>{action.item.email}</p>
      {action.kind === 'resend' && <p>Link trong thư trước sẽ hết hiệu lực.</p>}
      {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
    </Modal>}
  </>;
}
