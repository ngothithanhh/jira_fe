import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useSetDefaultIssueType = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueTypeId }: { issueTypeId: number }) => {
      const response = await apiClient.put(
        `/projects/${projectId}/issue-types/${issueTypeId}/default`
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success("Đã cập nhật loại công việc mặc định");
      queryClient.invalidateQueries({ queryKey: ['project-issue-types', projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
