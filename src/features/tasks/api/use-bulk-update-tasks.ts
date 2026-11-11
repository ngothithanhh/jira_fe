import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';
import { TaskStatus } from '@/features/tasks/types';

// Map status enum to backend status IDs (assuming 1=TODO, 2=IN_PROGRESS, 3=IN_REVIEW, 4=DONE, 5=BACKLOG)
const getStatusId = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.TODO: return 1;
    case TaskStatus.IN_PROGRESS: return 2;
    case TaskStatus.IN_REVIEW: return 3;
    case TaskStatus.DONE: return 4;
    case TaskStatus.BACKLOG: return 5;
    default: return 1;
  }
};

export const useBulkUpdateTasks = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: { json: { tasks: any[] } }) => {
      // The frontend bulk updates for Kanban drag & drop.
      // We will loop over the tasks and update them via the Spring Boot API
      const tasks = payload.json.tasks;
      const promises = tasks.map(async (task) => {
        // Change status if status is provided
        if (task.status) {
          const statusId = getStatusId(task.status);
          await apiClient.put(`/issues/${task.$id}/status?statusId=${statusId}`);
        }
        // Could also update position if the backend supports it in the future
      });

      await Promise.all(promises);
      return { success: true };
    },
    onSuccess: () => {
      toast.success("Đã cập nhật các công việc");
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};