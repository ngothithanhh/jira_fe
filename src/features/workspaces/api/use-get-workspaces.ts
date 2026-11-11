import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetWorkspaces = () => {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      // Compatibility adapter for legacy workspace routes: each selectable unit
      // is a real backend project, not a separate workspace entity.
      const response = await apiClient.get('/projects/getList');
      const projects = response.data || [];
      const documents = projects.map((project: any) => ({
        ...project,
        $id: String(project.projectId),
        name: project.projectName,
        imageUrl: undefined,
      }));
      return { documents, total: documents.length };
    },
    staleTime: 1000 * 60, // 1 minute
  });
};
