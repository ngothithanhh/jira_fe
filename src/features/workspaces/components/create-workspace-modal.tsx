'use client';

import { ResponsiveModal } from '@/components/responsive-modal';
import { useCreateWorkspaceModal } from '@/features/workspaces/hooks/use-create-workspace-modal';

import { CreateWorkspaceForm } from './create-workspace-form';

export const CreateWorkspaceModal = () => {
  const { isOpen, setIsOpen, close } = useCreateWorkspaceModal();

  return (
    <ResponsiveModal title="Tạo không gian làm việc" description="Tạo không gian làm việc mới để bắt đầu." open={isOpen} onOpenChange={setIsOpen}>
      <CreateWorkspaceForm onCancel={close} />
    </ResponsiveModal>
  );
};
