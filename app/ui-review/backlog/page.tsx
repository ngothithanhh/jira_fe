import { notFound } from 'next/navigation';
import { BacklogPreview } from '@/features/backlog/components/backlog-preview';

/** Trang duyệt chỉ chạy development; không đưa fixture hoặc thao tác giả vào luồng production. */
export default function BacklogReviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <BacklogPreview />;
}
