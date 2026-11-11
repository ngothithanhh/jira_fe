/**
 * MOCK: Get workspace hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetWorkspace } from '@/lib/mock/workspaces';

interface UseGetWorkspaceProps {
  workspaceId?: string;
}

export const useGetWorkspace = ({ workspaceId }: UseGetWorkspaceProps) => {
  // MOCK: Fetch workspace from localStorage
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Vui lòng chọn không gian làm việc");
      const result = await mockGetWorkspace(workspaceId);
      return result.data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60, // 1 minute
  });
};