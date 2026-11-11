/**
 * MOCK: Get project analytics hook
 * Uses local mock data stored in localStorage
 */

import { useQuery } from '@tanstack/react-query';
import { mockGetProjectAnalytics } from '@/lib/mock/projects';

export interface ProjectAnalyticsResponseType {
  data: {
    taskCount: number;
    taskDifference: number;
    projectCount?: number;
    projectDifference?: number;
    assignedTaskCount: number;
    assignedTaskDifference: number;
    completedTaskCount: number;
    completedTaskDifference: number;
    incompleteTaskCount: number;
    incompleteTaskDifference: number;
    overdueTaskCount: number;
    overdueTaskDifference: number;
  };
}

interface UseGetProjectAnalyticsProps {
  projectId?: string;
}

export const useGetProjectAnalytics = ({ projectId }: UseGetProjectAnalyticsProps) => {
  // MOCK: Fetch analytics from localStorage
  return useQuery({
    queryKey: ['projectAnalytics', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("Vui lòng chọn dự án");
      const result = await mockGetProjectAnalytics(projectId);
      return result.data;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};