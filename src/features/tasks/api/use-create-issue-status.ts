import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useCreateIssueStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { statusName: string; statusCategory: string }) => {
      const response = await apiClient.post('/issue-statuses', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã tạo trạng thái công việc");
      queryClient.invalidateQueries({ queryKey: ['issue-statuses'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
