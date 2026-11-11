/**
 * MOCK: Get task hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetTask } from '@/lib/mock/tasks';

interface UseGetTaskProps {
  taskId?: string;
}

export const useGetTask = ({ taskId }: UseGetTaskProps) => {
  // MOCK: Fetch task from localStorage
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      if (!taskId) throw new Error("Vui lòng chọn công việc");
      const result = await mockGetTask(taskId);
      return result.data;
    },
    enabled: !!taskId,
    staleTime: 1000 * 60, // 1 minute
  });
};