import { parseAsBoolean, useQueryState } from 'nuqs';

export const useAddMemberModal = () => {
  const [isOpen, setIsOpen] = useQueryState('add-member', parseAsBoolean.withDefault(false).withOptions({ clearOnDefault: true }));

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
  };
};
