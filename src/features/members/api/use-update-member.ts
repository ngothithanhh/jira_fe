import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Update member hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockUpdateMember } from '@/lib/mock/members';
import { MemberRole } from '@/features/members/types';
import { toast } from 'sonner';

export const useUpdateMember = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ param, json }: { param: { memberId: string }; json: { role?: MemberRole; name?: string } }) => {
      // MOCK: Update member in localStorage
      return await mockUpdateMember(param.memberId, json);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật thành viên");
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};