import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { TaskStatus } from '@/features/tasks/types';

interface UseGetTasksProps {
  workspaceId?: string;
  projectId?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
}

export const useGetTasks = ({
  workspaceId,
  projectId,
  status,
  assigneeId,
  dueDate,
}: UseGetTasksProps) => {
  return useQuery({
    queryKey: ['tasks', workspaceId, projectId, status, assigneeId, dueDate],
    queryFn: async () => {
      if (!projectId) {
        return { documents: [], total: 0 };
      }
      
      const response = await apiClient.get(`/issues/project/${projectId}`);
      let issues = response.data || [];

      // Next.js Jira clone expects the tasks to be in a specific format like:
      // { documents: Task[], total: number }
      // The Task object uses $id instead of issueId, and name instead of summary
      const mappedTasks = issues.map((issue: any) => ({
        ...issue,
        $id: String(issue.issueId),
        name: issue.summary,
        status: issue.statusName,
        assigneeId: issue.assigneeId ? String(issue.assigneeId) : null,
        projectId: String(issue.projectId),
      }));

      // Filter locally if backend doesn't support filtering yet
      let filteredTasks = mappedTasks;
      if (status) {
        filteredTasks = filteredTasks.filter((t: any) => t.status === status);
      }
      if (assigneeId) {
        filteredTasks = filteredTasks.filter((t: any) => t.assigneeId === assigneeId);
      }

      return {
        documents: filteredTasks,
        total: filteredTasks.length,
      };
    },
    enabled: !!projectId,
    staleTime: 1000 * 60, // 1 minute
  });
};