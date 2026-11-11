import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Update project hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockUpdateProject } from '@/lib/mock/projects';
import { toast } from 'sonner';

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ form = {}, param }: { form?: any; param: { projectId: string } }) => {
      // MOCK: Update project in localStorage
      const { name, image } = form;
      return await mockUpdateProject(param.projectId, { name, image });
    },
    onSuccess: (data) => {
      toast.success("Đã cập nhật dự án");
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', data.data.$id] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};