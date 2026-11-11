/**
 * MOCK: Get workspace info hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetWorkspaceInfo } from '@/lib/mock/workspaces';

interface UseGetWorkspaceInfoProps {
  workspaceId?: string;
}

export const useGetWorkspaceInfo = ({ workspaceId }: UseGetWorkspaceInfoProps) => {
  // MOCK: Fetch workspace info from localStorage
  return useQuery({
    queryKey: ['workspaceInfo', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Vui lòng chọn không gian làm việc");
      const result = await mockGetWorkspaceInfo(workspaceId);
      return result.data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60, // 1 minute
  });
};