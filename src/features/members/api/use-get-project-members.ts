import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface UseGetProjectMembersProps {
  projectId?: string;
}

export const useGetProjectMembers = ({ projectId }: UseGetProjectMembersProps) => {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await apiClient.get(`/projects/${projectId}/members`);
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60, // 1 minute
  });
};
