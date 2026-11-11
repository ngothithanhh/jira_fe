/**
 * MOCK: Get members hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetMembers } from '@/lib/mock/members';

interface UseGetMembersProps {
  workspaceId?: string;
}

export const useGetMembers = ({ workspaceId }: UseGetMembersProps) => {
  // MOCK: Fetch members from localStorage
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Vui lòng chọn không gian làm việc");
      const result = await mockGetMembers(workspaceId);
      return result.data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60, // 1 minute
  });
};