import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface UseGetProjectsProps {
  workspaceId?: string;
}

export const useGetProjects = ({ workspaceId }: UseGetProjectsProps) => {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: async () => {
      // workspaceId is not strictly needed for the Spring Boot backend
      // as it might fetch all projects for the logged-in user.
      const response = await apiClient.get('/projects/getList');
      const projects = response.data || [];
      
      const mappedProjects = projects.map((p: any) => ({
        ...p,
        $id: String(p.projectId),
        name: p.projectName,
        workspaceId: workspaceId || '1', // fallback
      }));
      
      return {
        documents: mappedProjects,
        total: mappedProjects.length,
      };
    },
    staleTime: 1000 * 60, // 1 minute
  });
};