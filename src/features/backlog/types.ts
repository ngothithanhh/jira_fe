export type PlanningIssue = {
  id: number;
  key: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  points: number;
  assignee: string | null;
  assigneeId: number | null;
  version: number | null;
};

export type PlanningSprint = {
  id: number;
  name: string;
  goal: string;
  state: 'FUTURE' | 'ACTIVE';
  startDate: string | null;
  endDate: string | null;
  issues: PlanningIssue[];
};

export type PlanningData = {
  projectId: number;
  projectName: string;
  projectKey: string;
  sprints: PlanningSprint[];
  backlog: PlanningIssue[];
  issueTypes: { id: number; name: string; isDefault: boolean }[];
};

export type SprintDraft = { name: string; goal: string; startDate: string; endDate: string };
export type IssueDraft = { title: string; typeId: number; priority: string };
export type IssueEdit = { description: string; points: number };
export type PlanningActions = {
  createIssue: (draft: IssueDraft) => Promise<void>;
  createSprint: (draft: SprintDraft) => Promise<void>;
  moveIssue: (issueId: number, from: number | null, to: number | null) => Promise<void>;
  reorder: (group: number | null, issueIds: number[]) => Promise<void>;
  startSprint: (id: number) => Promise<void>;
  completeSprint: (id: number, target: number | null) => Promise<void>;
  editIssue: (id: number, edit: IssueEdit) => Promise<void>;
};
