import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useDeleteWorkflowRule = (projectId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId }: { ruleId: number }) => {
      if (!projectId) throw new Error("Vui lòng chọn dự án để thiết lập quy tắc quy trình");
      const response = await apiClient.delete(`/projects/${projectId}/workflows/rules/${ruleId}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Xóa quy tắc quy trình thành công");
      queryClient.invalidateQueries({ queryKey: ['workflow-rules', projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
