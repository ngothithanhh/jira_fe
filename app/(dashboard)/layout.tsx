import type { PropsWithChildren } from 'react';

import { ModalProvider } from '@/components/modal-provider';
import { Navbar } from '@/components/navbar';
import { Sidebar } from '@/components/sidebar';

const DashboardLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex h-screen bg-white">
      <ModalProvider />

      {/* Sidebar - Fixed on left, hidden on mobile */}
      <aside className="hidden w-[264px] flex-shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-100 lg:block">
        <Sidebar />
      </aside>

      {/* Main content area - Takes remaining space */}
      <div className="flex flex-1 flex-col">
        {/* Header/Navbar */}
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
          <Navbar />
        </header>

        {/* Main scrollable content */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-screen-xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
