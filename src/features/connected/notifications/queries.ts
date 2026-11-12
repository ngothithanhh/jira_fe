'use client';

import { useQuery } from '@tanstack/react-query';
import { ConnectedError, connectedMutation, connectedRequest, hasPendingLogout, withSessionLock } from '../client';
import type { AccountContext } from '../session';

export type NotificationItem = {
  notificationId: number;
  userId: number;
  issueId: number | null;
  invitationId?: string | null;
  notificationType: string | null;
  actorId: number | null;
  actorName: string | null;
  message: string | null;
  read: boolean;
  createdAt: string | null;
};

export type NotificationAction =
  | { kind: 'read' | 'delete'; id: number }
  | { kind: 'read-all' };

export const notificationKey = (userId: number) => ['connected', 'notifications', userId] as const;

/** Cookie dùng chung giữa các tab. Kiểm user của phiên dưới cùng khóa với login/logout trước khi gửi request inbox. */
async function requestForUser<T>(userId: number, path: string, init: RequestInit, recoverRead = false) {
  const request = () => withSessionLock(async () => {
    init.signal?.throwIfAborted();
    if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng trên thiết bị này.');
    const account = await connectedRequest<AccountContext>('account/context', { signal: init.signal }, false);
    init.signal?.throwIfAborted();
    if (account.user.userId !== userId || hasPendingLogout()) {
      throw new ConnectedError(409, 'Tài khoản đã thay đổi. Vui lòng mở lại hộp thư.');
    }
    return connectedRequest<T>(path, init, false);
  });
  try {
    return await request();
  } catch (error) {
    if (!recoverRead || init.signal?.aborted || !(error instanceof ConnectedError) || error.status !== 401) throw error;
    // Client dùng chung tự lấy khóa khi refresh. Làm ngoài khóa và kiểm lại user trước lần đọc mới.
    await connectedRequest<AccountContext>('account/context', { signal: init.signal });
    return request();
  }
}

export function useNotificationList(userId: number, unreadOnly: boolean) {
  return useQuery({
    queryKey: [...notificationKey(userId), 'list', unreadOnly],
    queryFn: ({ signal }) => requestForUser<NotificationItem[]>(userId, `notifications?unreadOnly=${unreadOnly}`, { signal }, true),
  });
}

/** Trang inbox và bell dùng cùng count từ BE, kể cả khi trang đang lọc chỉ thông báo chưa đọc. */
export function useNotificationCount(userId: number) {
  return useQuery({
    queryKey: [...notificationKey(userId), 'unread-count'],
    queryFn: ({ signal }) => requestForUser<{ count: number }>(userId, 'notifications/unread-count', { signal }, true),
  });
}

/** ID là notifications.notification_id. BE tự lấy recipient từ JWT. Không replay thao tác sau lỗi. */
export async function changeNotification(userId: number, action: NotificationAction, current:()=>boolean) {
  switch (action.kind) {
    case 'read':
      await connectedMutation<void>(`notifications/${action.id}/read`,userId,{ method: 'PUT' },current);
      break;
    case 'read-all':
      await connectedMutation<{ updated: number }>('notifications/read-all',userId,{ method: 'PUT' },current);
      break;
    case 'delete':
      await connectedMutation<void>(`notifications/${action.id}`,userId,{ method: 'DELETE' },current);
      break;
  }
}
