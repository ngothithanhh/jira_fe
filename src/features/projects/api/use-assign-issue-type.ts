import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useAssignIssueType = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueTypeId, isDefault = false }: { issueTypeId: number; isDefault?: boolean }) => {
      const response = await apiClient.post(
        `/projects/${projectId}/issue-types/${issueTypeId}?isDefault=${isDefault}`
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã thêm loại công việc vào dự án");
      queryClient.invalidateQueries({ queryKey: ['project-issue-types', projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
