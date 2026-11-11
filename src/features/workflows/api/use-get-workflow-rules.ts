import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetWorkflowRules = (projectId?: string) => {
  return useQuery({
    queryKey: ['workflow-rules', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await apiClient.get(`/projects/${projectId}/workflows/rules`);
      return response.data;
    },
    enabled: !!projectId,
  });
};
