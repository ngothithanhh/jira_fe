'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Btn, InlineAlert, PageHeading, StateView } from '@/components/project-ui/kit';
import { ConnectedError, hasPendingLogout } from '../client';
import { configurationRead, useConfigurationGate } from '../configuration/queries';
import { useSession } from '../session';
import { overviewFields, overviewLabels, parseAdminOverview } from './model';

const formatCount = new Intl.NumberFormat('vi-VN');

/** Đọc thống kê bằng phiên của actor; chỉ bật query sau khi cổng quyền quản trị thành công. */
function useAdminOverview(actor: number) {
  return useQuery({
    queryKey: ['connected', 'admin-overview', actor],
    queryFn: async ({ signal }) => {
      const result = await configurationRead<unknown>(actor, 'admin/overview', signal);
      signal.throwIfAborted();
      if (hasPendingLogout()) throw new ConnectedError(401, 'Phiên đã đóng.');
      return parseAdminOverview(result);
    },
  });
}

export function AdminOverviewScreen() {
  const session = useSession();
  const gate = useConfigurationGate();
  const actor = session.data?.user.userId;
  if (!actor || session.switching || !gate.isSuccess || !gate.data.systemAdmin) return null;
  return <AdminOverview key={actor} actor={actor} />;
}

/** Lỗi đọc được ưu tiên hơn dữ liệu cache để không hiện số cũ khi quyền hoặc phiên đã thay đổi. */
function AdminOverview({ actor }: { actor: number }) {
  const overview = useAdminOverview(actor);
  const status = overview.error instanceof ConnectedError ? overview.error.status : undefined;
  return (
    <section className="space-y-4" aria-label="Tổng quan quản trị">
      <PageHeading title="Tổng quan quản trị" />
      {overview.isPending && <p role="status" className="text-sm text-[#6b778c]">Đang tải số liệu tổng quan…</p>}
      {status === 403 && <StateView kind="forbidden" title="Bạn không có quyền xem tổng quan quản trị" />}
      {status === 401 && (
        <InlineAlert tone="error">
          Phiên đăng nhập đã hết hạn.{' '}
          <Link className="underline" href="/app/sign-in?returnTo=%2Fapp%2Fadmin%2Foverview">Đăng nhập lại</Link>
        </InlineAlert>
      )}
      {overview.isError && status !== 401 && status !== 403 && (
        <InlineAlert tone="error">
          {overview.error.message}{' '}
          <Btn disabled={overview.isFetching} onClick={() => void overview.refetch()}>Thử lại</Btn>
        </InlineAlert>
      )}
      {overview.isSuccess && (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {overviewFields.map((field) => (
            <div key={field} className="min-w-0 rounded-[3px] border border-[#dfe1e6] px-3 py-4 sm:px-4">
              <dt className="text-sm text-[#42526e]">{overviewLabels[field]}</dt>
              <dd className="mt-1 break-words text-2xl font-semibold tabular-nums">{formatCount.format(overview.data[field])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
