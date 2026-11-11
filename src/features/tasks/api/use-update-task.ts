import { getApiErrorMessage } from '@/lib/api-error';
/**
 * MOCK: Update task hook
 * Uses local mock data stored in localStorage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

interface UpdateTaskData {
  [key: string]: unknown;
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const { json, param } = data;
      const taskId = param?.taskId || data?.taskId;
      
      const {
        name,
        description,
        dueDate,
        assigneeId,
        status,
        priority,
      } = json || data.form || data;

      // Update main issue fields
      const response = await apiClient.put(`/issues/${taskId}`, {
        summary: name,
        description: description || '',
        priority: priority || 'Medium',
      });

      // Assign user if provided
      if (assigneeId) {
        await apiClient.put(`/issues/${taskId}/assign?assigneeId=${assigneeId}`);
      }

      // Update status if provided
      const statusIdParam = param?.statusId || data?.statusId;
      if (statusIdParam) {
        await apiClient.put(`/issues/${taskId}/status?statusId=${statusIdParam}`);
      }

      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã cập nhật công việc");
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: Error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};