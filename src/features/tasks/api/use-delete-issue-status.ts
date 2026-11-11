import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useDeleteIssueStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.delete(`/issue-statuses/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã xóa trạng thái công việc");
      queryClient.invalidateQueries({ queryKey: ['issue-statuses'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
