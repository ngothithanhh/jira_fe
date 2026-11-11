import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Update workspace hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockUpdateWorkspace } from '@/lib/mock/workspaces';
import { toast } from 'sonner';
import type { Workspace } from '@/features/workspaces/types';

// Type definitions for consistency
type ResponseType = { data: Workspace };
type RequestType = {
  param: { workspaceId: string };
  form?: { name?: string; image?: string | File };
};

export const useUpdateWorkspace = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<ResponseType, Error, RequestType>({
    mutationFn: async ({ form = {}, param }) => {
      // MOCK: Update workspace in localStorage
      const response = await mockUpdateWorkspace(param.workspaceId, form);
      return response;
    },
    onSuccess: ({ data }) => {
      toast.success("Đã cập nhật không gian làm việc");
      queryClient.invalidateQueries({
        queryKey: ['workspaces'],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace', data.$id],
        exact: true,
      });
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};
