'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useNotificationCount } from './queries';

export function NotificationBell({ userId }: { userId: number }) {
  const { data, isError } = useNotificationCount(userId);
  const count = isError ? undefined : data?.count;
  const label = count === undefined ? 'Thông báo' : `Thông báo · ${count} chưa đọc`;

  return (
    <Link
      href="/app/notifications"
      aria-label={label}
      title={label}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded hover:bg-[#ebecf0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]"
    >
      <Bell size={20} aria-hidden="true" />
      {count !== undefined && count > 0 && (
        <span aria-hidden="true" className="absolute -right-1 -top-0.5 rounded-full bg-[#0052cc] px-1 text-[11px] font-semibold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
