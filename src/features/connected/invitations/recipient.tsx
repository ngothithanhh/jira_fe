'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Btn, Card, InlineAlert, PageHeading } from '@/components/project-ui/kit';
import { connectedRequest } from '../client';
import { useSession } from '../session';
import { ACCOUNT_INVITES, invitationId, invitePath, stateLabel, validInviteToken, type Invitation, type InvitationPage } from './contract';
import { useInvitationRead, useInvitationWrite } from './queries';

export function RecipientInbox() {
  const session = useSession();
  if (session.switching || !session.data) return null;
  const actor = session.data.user.userId;
  return <Inbox key={actor} actor={actor} />;
}

function Inbox({ actor }: { actor: number }) {
  const [offset, setOffset] = useState(0);
  const list = useInvitationRead<InvitationPage>(actor, 'recipient', ACCOUNT_INVITES + '?offset=' + offset);
  return <div className="max-w-3xl space-y-4">
    <PageHeading title="Lời mời dự án" />
    <Card>
      {list.isPending && <p role="status">Đang tải lời mời…</p>}
      {list.isError && <InlineAlert tone="error">{list.error.message}</InlineAlert>}
      {list.isSuccess && !list.data.items.length && <p>Bạn chưa có lời mời.</p>}
      <ul className="divide-y">
        {list.data?.items.map((item) => <li className="py-3" key={item.invitationId}>
          <Link className="font-medium text-[#0052cc] hover:underline" href={invitePath(item.invitationId, false)}>{item.projectName}</Link>
          <p className="text-sm">{item.projectKey} · {item.roleName} · {stateLabel[item.state]}</p>
        </li>)}
      </ul>
      <div className="flex gap-2">
        {offset > 0 && <Btn onClick={() => setOffset(offset - 20)}>Trang trước</Btn>}
        {list.data?.hasMore && <Btn onClick={() => setOffset(offset + 20)}>Trang sau</Btn>}
      </div>
    </Card>
  </div>;
}

export function InvitationPreview({ id, fromEmail }: { id: string; fromEmail: boolean }) {
  if (!invitationId(id)) return <InlineAlert tone="error">Không tìm thấy lời mời.</InlineAlert>;
  return <InvitationEntry key={id} id={id} fromEmail={fromEmail} />;
}

function InvitationEntry({ id, fromEmail }: { id: string; fromEmail: boolean }) {
  const session = useSession();
  const [ready, setReady] = useState(!fromEmail);
  const [error, setError] = useState('');
  const capture = useRef<{ fragment: string; pending: Promise<void> } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!fromEmail) return;
    let active = true;
    const consume = () => {
      const fragment = window.location.hash;
      if (!fragment) { setReady(true); return; }
      const token = fragment.startsWith('#token=') ? fragment.slice(7) : '';
      if (!validInviteToken(token)) { setError('Link lời mời không hợp lệ.'); return; }
      setReady(false);
      setError('');
      if (capture.current?.fragment !== fragment) {
        const previous = capture.current?.pending.catch(() => undefined) ?? Promise.resolve();
        capture.current = { fragment, pending: previous.then(() =>
          connectedRequest<void>(ACCOUNT_INVITES + '/' + id + '/proof', { method: 'POST', body: JSON.stringify({ token }) }, false)) };
      }
      const pending = capture.current.pending;
      void pending.then(() => {
        if (!active || capture.current?.pending !== pending || window.location.hash !== fragment) return;
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
        capture.current = null;
        setRevision((value) => value + 1);
        setReady(true);
      }).catch(() => {
        if (active && capture.current?.pending === pending && window.location.hash === fragment) {
          setError('Chưa lưu được link. Hãy mở lại email.');
        }
      });
    };
    consume();
    window.addEventListener('hashchange', consume);
    return () => { active = false; window.removeEventListener('hashchange', consume); };
  }, [id, fromEmail]);

  const target = encodeURIComponent(invitePath(id, fromEmail));
  const signIn = '/app/sign-in?returnTo=' + target;
  const signUp = '/app/sign-up?returnTo=' + target;
  return <div className={fromEmail ? 'mx-auto max-w-xl space-y-4 px-4 py-10' : 'max-w-3xl space-y-4'}>
    <PageHeading title="Lời mời tham gia dự án" />
    {error ? <InlineAlert tone="error">{error}</InlineAlert>
      : !ready || session.isPending || session.switching ? <p role="status">Đang tải lời mời…</p>
      : session.isError ? <InlineAlert tone="error">Không tải được phiên. <Btn onClick={() => void session.refetch()}>Thử lại</Btn></InlineAlert>
      : session.data ? <RecipientDetail key={session.data.user.userId + ':' + revision} actor={session.data.user.userId} id={id} fromEmail={fromEmail} revision={revision} />
      : <Card><p className="mb-3">Đăng nhập bằng tài khoản có email nhận lời mời.</p>
        <div className="flex gap-3"><Link className="text-[#0052cc]" href={signIn}>Đăng nhập</Link>
          <Link className="text-[#0052cc]" href={signUp}>Đăng ký</Link></div></Card>}
  </div>;
}

function RecipientDetail({ actor, id, fromEmail, revision }: { actor: number; id: string; fromEmail: boolean; revision: number }) {
  const base = ACCOUNT_INVITES + '/' + id;
  const query = fromEmail ? '?link=true' : '';
  const preview = useInvitationRead<Invitation>(actor, 'recipient', base + query, true, revision);
  const verify = useInvitationRead<{ state: string }>(actor, 'recipient', 'account/email-verification/status', preview.data?.state === 'PENDING');
  const write = useInvitationWrite(actor, 'recipient');
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [result, setResult] = useState<Invitation | undefined>();
  const invitation = result ?? preview.data;
  const verifyUrl = '/app/account?returnTo=' + encodeURIComponent(invitePath(id, fromEmail));
  return <Card>
    {preview.isPending && <p role="status">Đang tải lời mời…</p>}
    {preview.isError && <InlineAlert tone="error">{preview.error.message}</InlineAlert>}
    {preview.isError && <Link className="text-[#0052cc]" href={'/app/sign-in?returnTo=' + encodeURIComponent(invitePath(id, fromEmail))}>Đổi tài khoản</Link>}
    {invitation && <div className="space-y-3">
      <h2 className="text-lg font-semibold">{invitation.projectName} ({invitation.projectKey})</h2>
      <p>Vai trò {invitation.roleName}</p>
      {invitation.inviterName && <p>Người mời {invitation.inviterName}</p>}
      <p role="status">{stateLabel[invitation.state]}</p>
      {invitation.state === 'PENDING' && <time dateTime={invitation.expiresAt}>Hết hạn {new Date(invitation.expiresAt).toLocaleString('vi-VN')}</time>}
      {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {write.uncertain && <Btn onClick={() => window.location.reload()}>Tải lại lời mời</Btn>}
      {invitation.state === 'PENDING' && verify.isError && <InlineAlert tone="error">{verify.error.message} <Btn onClick={() => void verify.refetch()}>Thử lại</Btn></InlineAlert>}
      {invitation.state === 'PENDING' && verify.data?.state !== 'VERIFIED' && verify.isSuccess &&
        <Link className="block text-[#0052cc]" href={verifyUrl}>Xác minh email trong Tài khoản</Link>}
      {invitation.state === 'PENDING' && verify.data?.state === 'VERIFIED' && <div className="flex flex-wrap gap-2">
        <Btn variant="primary" disabled={write.busy || write.uncertain} onClick={() => void write.submit<Invitation>(base + '/accept' + query,
          undefined, setResult)}>Chấp nhận</Btn>
        <Btn disabled={write.busy || write.uncertain} onClick={() => {
          if (!confirmDecline) { setConfirmDecline(true); return; }
          void write.submit(base + '/decline' + query, undefined, () => setResult({ ...invitation, state: 'DECLINED' }));
        }}>{confirmDecline ? 'Xác nhận từ chối' : 'Từ chối'}</Btn>
        {confirmDecline && <Btn onClick={() => setConfirmDecline(false)}>Hủy</Btn>}
      </div>}
      {invitation.state === 'ACCEPTED' && invitation.projectId && <Link className="block text-[#0052cc]" href={'/app/projects/' + invitation.projectId + '/overview'}>Mở dự án</Link>}
    </div>}
    <Link className="mt-3 block text-[#0052cc]" href="/app/account/project-invitations">Hộp thư lời mời</Link>
  </Card>;
}
