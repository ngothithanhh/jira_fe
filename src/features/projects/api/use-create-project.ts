import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const { workspaceId, name } = data.form || data;
      
      // Auto-generate a project key (e.g., first 3 letters, uppercase)
      let projectKey = 'PRJ';
      if (name && typeof name === 'string' && name.length >= 2) {
        projectKey = name.substring(0, 3).toUpperCase().replace(/\s/g, '');
      }

      const payload = {
        projectName: name,
        projectKey: projectKey,
        description: '', // Can add description input later in UI
      };

      const response = await apiClient.post('/projects/create', payload);
      return response.data;
    },
    onSuccess: (data, variables) => {
      toast.success("Đã tạo dự án");
      const workspaceId = (variables as any).form?.workspaceId || (variables as any).workspaceId;
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      // Invalidate general projects list too
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};