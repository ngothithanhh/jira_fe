import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Reset invite code hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockResetInviteCode } from '@/lib/mock/workspaces';
import { toast } from 'sonner';

export const useResetInviteCode = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ param }: { param: { workspaceId: string } }) => {
      // MOCK: Reset invite code in localStorage
      return await mockResetInviteCode(param.workspaceId);
    },
    onSuccess: (data) => {
      toast.success("Đã đặt lại mã mời");
      queryClient.invalidateQueries({
        queryKey: ['workspace', data.data.$id],
      });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};