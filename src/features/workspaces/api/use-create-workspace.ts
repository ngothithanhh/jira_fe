import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Create workspace hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockCreateWorkspace } from '@/lib/mock/workspaces';
import { toast } from 'sonner';

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      // MOCK: Create workspace in localStorage
      const { name, image } = data.form || data;
      return await mockCreateWorkspace(name, image);
    },
    onSuccess: () => {
      toast.success("Đã tạo không gian làm việc");
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};