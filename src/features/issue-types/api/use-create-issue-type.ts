import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useCreateIssueType = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { typeName: string }) => {
      const response = await apiClient.post('/issue-types', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Tạo loại công việc thành công");
      queryClient.invalidateQueries({ queryKey: ['issue-types'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
