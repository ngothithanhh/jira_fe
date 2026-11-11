import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetProjectIssueTypes = (projectId: string | number) => {
  return useQuery({
    queryKey: ['project-issue-types', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await apiClient.get(`/projects/${projectId}/issue-types`);
      return response.data;
    },
    enabled: !!projectId,
  });
};
