import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DemoProvider } from '@/features/ui-demo/provider';

export const metadata = { title: 'Quản lý dự án · Bản xem trước' };

/**
 * Chặn toàn bộ bộ trang demo ở production trước khi cấp dữ liệu mẫu; không làm yếu auth của trang thật.
 * Layout gốc chỉ cấp provider; khung (auth hoặc ứng dụng) nằm ở route group con.
 */
export default function ReviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DemoProvider>{children}</DemoProvider>;
}
