import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Delete task hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mockDeleteTask } from '@/lib/mock/tasks';
import { toast } from 'sonner';

export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (taskId: string) => {
      // MOCK: Delete task from localStorage
      return await mockDeleteTask(taskId);
    },
    onSuccess: () => {
      toast.success("Đã xóa công việc");
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};