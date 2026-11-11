import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useRemoveIssueType = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueTypeId }: { issueTypeId: number }) => {
      const response = await apiClient.delete(
        `/projects/${projectId}/issue-types/${issueTypeId}`
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã gỡ loại công việc khỏi dự án");
      queryClient.invalidateQueries({ queryKey: ['project-issue-types', projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
