'use client';

import { ResponsiveModal } from '@/components/responsive-modal';
import { AddMemberForm } from '@/features/members/components/add-member-form';
import { useAddMemberModal } from '@/features/members/hooks/use-add-member-modal';

export const AddMemberModal = () => {
  const { isOpen, setIsOpen, close } = useAddMemberModal();

  return (
    <ResponsiveModal title="Thêm thành viên" description="Chọn người dùng và vai trò trong dự án." open={isOpen} onOpenChange={setIsOpen}>
      <AddMemberForm onCancel={close} />
    </ResponsiveModal>
  );
};
