import apiClient from '@/lib/api-client';
import { mapPlanningIssue, type IssueDto } from './model';
import type { PlanningData } from './types';

type SprintDto = {
  sprintId: number;
  sprintName: string;
  goal: string | null;
  state: 'FUTURE' | 'ACTIVE' | 'CLOSED';
  startDate: string | null;
  endDate: string | null;
};
type TypeDto = { issueTypeId: number; issueTypeName: string; isDefault: boolean };

/**
 * projectId là projects.project_id; chỉ đọc API thật, không fallback fixture khi 403/404 hoặc mất kết nối.
 * Chờ đủ project/sprint/product/type rồi đọc backlog từng sprint mở; CLOSED không thuộc màn lập kế hoạch.
 */
export async function loadPlanning(projectId: number): Promise<PlanningData> {
  const [project, sprintResponse, backlogResponse, typeResponse] = await Promise.all([
    apiClient.get<{ projectId: number; projectName: string; projectKey: string }>(`/projects/${projectId}`),
    apiClient.get<SprintDto[]>(`/sprints/project/${projectId}`),
    apiClient.get<IssueDto[]>(`/projects/${projectId}/backlog`),
    apiClient.get<TypeDto[]>(`/projects/${projectId}/issue-types`),
  ]);
  const open = sprintResponse.data.filter(
    (sprint): sprint is SprintDto & { state: 'FUTURE' | 'ACTIVE' } =>
      sprint.state === 'ACTIVE' || sprint.state === 'FUTURE',
  );
  open.sort((a, b) => Number(b.state === 'ACTIVE') - Number(a.state === 'ACTIVE') || a.sprintId - b.sprintId);
  const sprints = await Promise.all(
    open.map(async (sprint) => {
      const response = await apiClient.get<IssueDto[]>(`/sprints/${sprint.sprintId}/issues`);
      return {
        id: sprint.sprintId,
        name: sprint.sprintName,
        goal: sprint.goal ?? '',
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        issues: response.data.map(mapPlanningIssue),
      };
    }),
  );
  return {
    projectId: project.data.projectId,
    projectName: project.data.projectName,
    projectKey: project.data.projectKey,
    sprints,
    backlog: backlogResponse.data.map(mapPlanningIssue),
    issueTypes: typeResponse.data.map((type) => ({
      id: type.issueTypeId,
      name: type.issueTypeName,
      isDefault: type.isDefault,
    })),
  };
}
