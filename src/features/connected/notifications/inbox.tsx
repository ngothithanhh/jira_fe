'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, MailOpen, Trash2 } from 'lucide-react';
import { Btn, EmptyState, formatDate, InlineAlert, PageHeading, TabBar } from '@/components/project-ui/kit';
import { completeConnectedMutation, hasPendingLogout } from '../client';
import { useProjectMutationScope } from '../projects/queries';
import { useSession, type AccountContext } from '../session';
import { changeNotification, notificationKey, useNotificationCount, useNotificationList, type NotificationAction } from './queries';

const typeLabels: Record<string, string> = {
  ISSUE_ASSIGNED: 'Giao việc',
  ISSUE_STATUS_CHANGED: 'Trạng thái',
  PROJECT_INVITED: 'Thành viên',
  ISSUE_COMMENTED: 'Bình luận',
};

export function ConnectedNotifications() {
  const session = useSession();
  const userId = session.data?.user.userId;
  if (session.switching || userId === undefined) return null;
  return <Inbox key={userId} userId={userId} />;
}

function Inbox({ userId }: { userId: number }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const inFlight = useRef(false);
  const capture=useProjectMutationScope();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [uncertain,setUncertain]=useState(false);
  const list = useNotificationList(userId, tab === 'unread');
  const unread = useNotificationCount(userId);
  const count = unread.isError ? undefined : unread.data?.count;

  /** Khóa cả hai lần click xảy ra trước khi React cập nhật disabled. Chỉ cập nhật inbox sau phản hồi BE. */
  async function submit(action: NotificationAction) {
    if (inFlight.current||uncertain) return;
    inFlight.current = true;
    setPending(true);setError('');const current=capture();
    try{
      await changeNotification(userId,action,current);
      // Đánh stale bằng scope local trước; chỉ refetch/completion khi cookie actor vẫn khớp.
      await queryClient.invalidateQueries({queryKey:notificationKey(userId),refetchType:'none'});
      // Inbox có thể đã unmount nhưng bell còn trên shell. Đồng bộ cache dùng actor/session, tách khỏi vòng đời form.
      const cacheCurrent=()=>!hasPendingLogout()&&queryClient.getQueryData<AccountContext|null>(['connected','session'])?.user.userId===userId;
      const accepted=await completeConnectedMutation(userId,cacheCurrent,()=>{});
      if(!accepted){if(current()){setUncertain(true);setError('Thao tác đã lưu nhưng chưa xác nhận lại được phiên. Tải lại hộp thư trước khi thao tác tiếp.');}return;}
      await queryClient.invalidateQueries({queryKey:notificationKey(userId)});
      if(!current())return;
      const finished=await completeConnectedMutation(userId,current,()=>{});
      if(!finished&&current()){setUncertain(true);setError('Thao tác đã lưu. Tải lại hộp thư để xác nhận kết quả.');}
    }catch(failure){
      if(current()){
        const confirmed=await completeConnectedMutation(userId,current,()=>setError(failure instanceof Error?failure.message:'Không cập nhật được thông báo.'));
        if(!confirmed&&current()){setUncertain(true);setError('Không xác nhận được kết quả. Tải lại hộp thư trước khi thử tiếp.');}
      }
    }finally{inFlight.current=false;if(current())setPending(false);}
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <PageHeading
        title="Thông báo"
        description={count === undefined ? undefined : `${count} chưa đọc`}
        actions={
          <Btn disabled={count === undefined || count === 0 || pending || uncertain} onClick={() => void submit({ kind: 'read-all' })}>
            <MailOpen /> Đánh dấu tất cả đã đọc
          </Btn>
        }
      />
      <TabBar
        label="Lọc thông báo"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'Tất cả' },
          { value: 'unread', label: count === undefined ? 'Chưa đọc' : `Chưa đọc (${count})` },
        ]}
      />
      {pending && <p role="status" className="text-sm text-[#42526e]">Đang cập nhật thông báo…</p>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {uncertain&&<Btn onClick={()=>window.location.reload()}>Tải lại hộp thư</Btn>}
      {unread.isError && (
        <InlineAlert tone="error">
          Không tải được số thông báo chưa đọc. <Btn variant="subtle" onClick={() => void unread.refetch()}>Tải lại số chưa đọc</Btn>
        </InlineAlert>
      )}
      {list.isError && (
        <InlineAlert tone="error">
          {list.error.message} <Btn variant="subtle" onClick={() => void list.refetch()}>Tải lại hộp thư</Btn>
        </InlineAlert>
      )}
      {list.isPending ? (
        <p role="status" className="text-sm text-[#42526e]">Đang tải hộp thư…</p>
      ) : list.data?.length ? (
        <ul aria-label="Hộp thư thông báo" className="divide-y divide-[#ebecf0] rounded border border-[#dfe1e6]">
          {list.data.map((item) => (
            <li key={item.notificationId} className={`flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap ${item.read ? '' : 'bg-[#e9f2ff]/50'}`}>
              <div className="min-w-0 flex-1 basis-full space-y-1 sm:basis-auto">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#42526e]">
                  <span className="rounded bg-[#f4f5f7] px-1.5">{typeLabels[item.notificationType ?? ''] ?? 'Thông báo'}</span>
                  {!item.read && <span className="font-semibold text-[#0052cc]">Chưa đọc</span>}
                  {item.createdAt && <time dateTime={item.createdAt}>{formatDate(item.createdAt, true)}</time>}
                </div>
                <p className={`break-words text-sm ${item.read ? '' : 'font-semibold'}`}>{item.message || 'Thông báo không có nội dung'}</p>
                {item.actorName && <p className="break-words text-xs text-[#42526e]">{item.actorName}</p>}
              </div>
              {!item.read && (
                <Btn variant="subtle" disabled={pending||uncertain} onClick={() => void submit({ kind: 'read', id: item.notificationId })}>
                  Đánh dấu đã đọc
                </Btn>
              )}
              <Btn variant="subtle" size="icon" disabled={pending||uncertain} aria-label="Xóa thông báo" onClick={() => void submit({ kind: 'delete', id: item.notificationId })}>
                <Trash2 />
              </Btn>
            </li>
          ))}
        </ul>
      ) : !list.isError && (
        <EmptyState icon={<Bell size={40} strokeWidth={1.5} />} title={tab === 'unread' ? 'Không có thông báo chưa đọc' : 'Hộp thư trống'} />
      )}
    </section>
  );
}
