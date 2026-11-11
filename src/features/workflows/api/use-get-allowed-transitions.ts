import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetAllowedTransitions = (projectId: string | undefined, currentStatusId: number | undefined) => {
  return useQuery({
    queryKey: ['workflow-allowed-transitions', projectId, currentStatusId],
    queryFn: async () => {
      if (!projectId || !currentStatusId) return [];
      const response = await apiClient.get(`/projects/${projectId}/workflows/allowed-transitions?currentStatusId=${currentStatusId}`);
      return response.data; // Expected to be an array of IssueStatusResponse
    },
    enabled: !!projectId && !!currentStatusId,
  });
};
