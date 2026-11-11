'use client';

import { usePathname } from 'next/navigation';

import { UserButton } from '@/features/auth/components/user-button';

import { MobileSidebar } from './mobile-sidebar';
import { SourceCode } from './source-code';

const pathnameMap = {
  tasks: {
    title: "Công việc của tôi",
    description: "Xem tất cả công việc của bạn tại đây.",
  },
  projects: {
    title: "Dự án của tôi",
    description: "Xem công việc trong dự án của bạn tại đây.",
  },
};

const defaultMap = {
  title: "Trang chủ",
  description: "Theo dõi tất cả dự án và công việc của bạn tại đây.",
};

export const Navbar = () => {
  const pathname = usePathname();
  const pathnameParts = pathname.split('/');
  const pathnameKey = pathnameParts[3] as keyof typeof pathnameMap;

  const { title, description } = pathnameMap[pathnameKey] || defaultMap;

  return (
    <nav className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="hidden flex-col lg:flex">
          <h1 className="text-2xl font-semibold">{title}</h1>

          <p className="text-muted-foreground">{description}</p>
        </div>

        <MobileSidebar />

        <div className="ml-auto flex items-center gap-x-2.5">
          <UserButton />

          <SourceCode />
        </div>
      </div>
    </nav>
  );
};
