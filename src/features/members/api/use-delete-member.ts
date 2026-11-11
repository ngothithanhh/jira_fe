import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Delete member hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockDeleteMember } from '@/lib/mock/members';
import { toast } from 'sonner';

export const useDeleteMember = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ param }: { param: { memberId: string } }) => {
      // MOCK: Delete member from localStorage
      return await mockDeleteMember(param.memberId);
    },
    onSuccess: () => {
      toast.success("Đã xóa thành viên");
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};