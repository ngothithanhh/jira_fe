import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Delete project hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockDeleteProject } from '@/lib/mock/projects';
import { toast } from 'sonner';

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ param }: { param: { projectId: string } }) => {
      // MOCK: Delete project from localStorage
      return await mockDeleteProject(param.projectId);
    },
    onSuccess: () => {
      toast.success("Đã xóa dự án");
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};