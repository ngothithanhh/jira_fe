import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Join workspace hook
 * Uses local mock data stored in localStorage
 */

import { useMutation } from '@tanstack/react-query';
import { mockJoinWorkspace } from '@/lib/mock/workspaces';
import { toast } from 'sonner';

export const useJoinWorkspace = () => {
  const mutation = useMutation({
    mutationFn: async ({ param, json }: { param: { workspaceId: string }; json: { code: string } }) => {
      // MOCK: Join workspace in localStorage
      return await mockJoinWorkspace(param.workspaceId, json.code);
    },
    onSuccess: () => {
      toast.success("Tham gia không gian làm việc thành công");
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};