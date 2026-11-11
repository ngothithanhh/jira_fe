/**
 * MOCK: Get workspace analytics hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetWorkspaceAnalytics } from '@/lib/mock/workspaces';

interface UseGetWorkspaceAnalyticsProps {
  workspaceId?: string;
}

export const useGetWorkspaceAnalytics = ({
  workspaceId,
}: UseGetWorkspaceAnalyticsProps) => {
  // MOCK: Fetch analytics from localStorage
  return useQuery({
    queryKey: ['workspaceAnalytics', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Vui lòng chọn không gian làm việc");
      const result = await mockGetWorkspaceAnalytics(workspaceId);
      return result.data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};