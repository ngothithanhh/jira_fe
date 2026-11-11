import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const {
        workspaceId,
        projectId,
        name,
        description,
        dueDate,
        assigneeId,
        status,
        issueTypeId,
        priority,
      } = data.json || data.form || data;

      // Call Spring Boot API
      const response = await apiClient.post('/issues', {
        projectId: Number(projectId),
        issueTypeId: Number(issueTypeId),
        summary: name,
        description: description || '',
        priority: priority,
      });
      
      const issueId = response.data.issueId;

      // Assign user if provided
      if (assigneeId) {
        await apiClient.put(`/issues/${issueId}/assign?assigneeId=${assigneeId}`);
      }

      // Note: We might need to map status if the form provides it and it differs from default.
      // But usually creation places it in 'TODO' by default.

      return response.data;
    },
    onSuccess: (data, variables) => {
      toast.success("Đã tạo công việc");
      const workspaceId = (variables as any).json?.workspaceId || (variables as any).form?.workspaceId || (variables as any).workspaceId;
      const projectId = (variables as any).json?.projectId || (variables as any).form?.projectId || (variables as any).projectId;
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId, projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};