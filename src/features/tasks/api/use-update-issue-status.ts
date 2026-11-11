import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useUpdateIssueStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { statusName: string; statusCategory: string } }) => {
      const response = await apiClient.put(`/issue-statuses/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái công việc");
      queryClient.invalidateQueries({ queryKey: ['issue-statuses'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
