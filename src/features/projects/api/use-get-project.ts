import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface UseGetProjectProps {
  projectId?: string;
}

export const useGetProject = ({ projectId }: UseGetProjectProps) => {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("Vui lòng chọn dự án");
      const response = await apiClient.get(`/projects/${projectId}`);
      const p = response.data;
      if (!p) return null;
      
      return {
        ...p,
        $id: String(p.projectId),
        name: p.projectName,
      };
    },
    enabled: !!projectId,
    staleTime: 1000 * 60, // 1 minute
  });
};
