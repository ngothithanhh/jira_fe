import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Delete workspace hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockDeleteWorkspace } from '@/lib/mock/workspaces';
import { toast } from 'sonner';

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ param }: { param: { workspaceId: string } }) => {
      // MOCK: Delete workspace from localStorage
      return await mockDeleteWorkspace(param.workspaceId);
    },
    onSuccess: () => {
      toast.success("Đã xóa không gian làm việc");
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};