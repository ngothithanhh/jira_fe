'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, MailOpen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, EmptyState, PageHeading, SearchInput, TabBar, formatDate } from '@/components/project-ui/kit';
import { cn } from '@/lib/utils';
import { Screen, routes } from '../common';
import { can, deleteNotification, findIssue, findProject, inbox, markAllRead, markNotification } from '../logic';
import { useDemo } from '../provider';

const TYPE_LABEL = { ASSIGNED: 'Giao việc', COMMENT: 'Bình luận', MEMBER_ADDED: 'Thành viên', SPRINT: 'Sprint', STATUS: 'Trạng thái' } as const;

/**
 * Hộp thư của persona đang chọn: selector lọc theo recipientId ngay từ đầu, đổi persona thì danh sách đổi.
 * Mở thông báo trỏ tới issue đã xóa hoặc dự án không còn quyền thì báo rõ, không điều hướng sai.
 */
export function NotificationsScreen() {
  const { state, me, act } = useDemo();
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [query, setQuery] = useState('');
  const all = inbox(state, me?.id);
  const unread = all.filter((n) => !n.read).length;
  const q = query.trim().toLocaleLowerCase('vi');
  const items = all.filter((n) => (tab === 'all' || !n.read) && (!q || `${n.title} ${n.body}`.toLocaleLowerCase('vi').includes(q)));

  function openItem(id: number) {
    const n = all.find((x) => x.id === id);
    if (!n) return;
    if (!n.read) act((s, c) => markNotification(s, c, n.id, true));
    if (n.projectId && !findProject(state, n.projectId)) return toast.error('Dự án không còn tồn tại.');
    if (n.projectId && !can(state, me?.id, 'VIEW_PROJECT', n.projectId)) return toast.error('Bạn không còn quyền xem dự án này.');
    if (n.issueId) {
      if (!findIssue(state, n.issueId)) return toast.error('Công việc không còn tồn tại.');
      return router.push(routes.issue(n.projectId!, n.issueId, 'board'));
    }
    if (n.projectId) router.push(routes.project(n.projectId));
  }

  return (
    <Screen empty={<EmptyState icon={<Bell size={40} strokeWidth={1.5} />} title="Không có thông báo" />}>
      <PageHeading
        title="Thông báo"
        description={`${unread} chưa đọc`}
        actions={
          <Btn disabled={!unread} onClick={() => act((s, c) => markAllRead(s, c), 'Đã đánh dấu tất cả là đã đọc')}>
            <MailOpen /> Đánh dấu đã đọc tất cả
          </Btn>
        }
      />
      <TabBar
        label="Lọc thông báo"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: `Tất cả (${all.length})` },
          { value: 'unread', label: `Chưa đọc (${unread})` },
        ]}
      />
      <div className="mb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm trong thông báo" label="Tìm thông báo" />
      </div>
      {!items.length ? (
        <EmptyState
          icon={<Bell size={40} strokeWidth={1.5} />}
          title={all.length ? 'Không có thông báo khớp' : 'Hộp thư trống'}
          description={all.length ? 'Thử bỏ lọc hoặc chuyển sang tab Tất cả.' : 'Thông báo khi được giao việc, có bình luận hoặc được thêm vào dự án sẽ hiện ở đây.'}
        />
      ) : (
        <ul className="max-w-4xl divide-y divide-[#ebecf0] rounded-[3px] border border-[#dfe1e6]">
          {items.map((n) => {
            const missing = n.issueId !== null && !findIssue(state, n.issueId);
            return (
              <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read && 'bg-[#e9f2ff]/50')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-[#0052cc]')} aria-label={n.read ? 'Đã đọc' : 'Chưa đọc'} role="img" />
                <button className="min-w-0 flex-1 text-left" onClick={() => openItem(n.id)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                    <span className="rounded-[3px] bg-[#f4f5f7] px-1.5 text-[11px] text-[#42526e]">{TYPE_LABEL[n.type]}</span>
                    {missing && <span className="rounded-[3px] bg-[#ffebe6] px-1.5 text-[11px] text-[#bf2600]">Công việc đã bị xóa</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-[#42526e]">{n.body}</span>
                  <span className="mt-0.5 block text-xs text-[#6b778c]">
                    {n.projectId ? (findProject(state, n.projectId)?.name ?? 'Dự án đã xóa') + ' · ' : ''}
                    {formatDate(n.createdAt, true)}
                  </span>
                </button>
                <Btn variant="subtle" onClick={() => act((s, c) => markNotification(s, c, n.id, !n.read))}>
                  {n.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
                </Btn>
                <Btn size="icon" variant="subtle" aria-label={`Xóa thông báo ${n.title}`} onClick={() => act((s, c) => deleteNotification(s, c, n.id), 'Đã xóa thông báo')}>
                  <Trash2 />
                </Btn>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
