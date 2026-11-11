/**
 * Projects — mock data and functions backed by localStorage.
 * See src/lib/mock/ for the full mock layer.
 */

import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { TaskStatus, type Task } from '@/features/tasks/types';
import { getStoredTasks } from './tasks';
import { getCurrentUserSync } from './auth';

import type { Project } from '@/features/projects/types';

const STORAGE_KEY = 'mock_projects';

// MOCK: Sample project data
const MOCK_PROJECTS_INITIAL: Project[] = [
  {
    $id: 'project_demo_001',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Landing Page',
    imageId: undefined,
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%236366F1"/%3E%3Ctext x="50" y="50" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle"%3ELP%3C/text%3E%3C/svg%3E',
    workspaceId: 'workspace_demo_001',
  },
  {
    $id: 'project_demo_002',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Dashboard',
    imageId: undefined,
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%2308B981"/%3E%3Ctext x="50" y="50" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle"%3EDB%3C/text%3E%3C/svg%3E',
    workspaceId: 'workspace_demo_001',
  },
  {
    $id: 'project_demo_003',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Mobile App',
    imageId: undefined,
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23F59E0B"/%3E%3Ctext x="50" y="50" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle"%3EMA%3C/text%3E%3C/svg%3E',
    workspaceId: 'workspace_demo_002',
  },
];

function getStoredProjects(): Project[] {
  if (typeof window === 'undefined') return MOCK_PROJECTS_INITIAL;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = MOCK_PROJECTS_INITIAL;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return MOCK_PROJECTS_INITIAL;
  }
}

function saveProjects(projects: Project[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
}

export async function mockGetProjects(workspaceId: string): Promise<{
  data: { documents: Project[]; total: number };
}> {
  const projects = getStoredProjects();
  const workspaceProjects = projects.filter((p) => p.workspaceId === workspaceId);

  return {
    data: {
      documents: workspaceProjects.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      ),
      total: workspaceProjects.length,
    },
  };
}

export async function mockGetProject(projectId: string): Promise<{
  data: Project;
}> {
  const projects = getStoredProjects();
  const project = projects.find((p) => p.$id === projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  return { data: project };
}

export async function mockCreateProject(
  workspaceId: string,
  name: string,
  image?: string | File,
): Promise<{ data: Project }> {
  // MOCK: Create new project
  const newProject: Project = {
    $id: `project_${crypto.randomUUID()}`,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name,
    imageId: undefined,
    imageUrl: image && typeof image === 'string' ? image : undefined,
    workspaceId,
  };

  // MOCK: Handle file upload
  if (image instanceof File) {
    const reader = new FileReader();
    const imageUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(image);
    });
    newProject.imageUrl = imageUrl;
  }

  const projects = getStoredProjects();
  projects.push(newProject);
  saveProjects(projects);

  return { data: newProject };
}

export async function mockUpdateProject(
  projectId: string,
  updates: { name?: string; image?: string | File },
): Promise<{ data: Project }> {
  const projects = getStoredProjects();
  const project = projects.find((p) => p.$id === projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  // MOCK: Update project fields
  if (updates.name) {
    project.name = updates.name;
  }

  if (updates.image) {
    if (typeof updates.image === 'string') {
      project.imageUrl = updates.image;
    } else {
      // MOCK: Handle file upload
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(updates.image as File);
      });
      project.imageUrl = imageUrl;
    }
  }

  project.$updatedAt = new Date().toISOString();
  saveProjects(projects);

  return { data: project };
}

export async function mockDeleteProject(projectId: string): Promise<{
  data: { $id: string; workspaceId: string };
}> {
  const projects = getStoredProjects();
  const index = projects.findIndex((p) => p.$id === projectId);

  if (index === -1) {
    throw new Error('Project not found');
  }

  const deletedProject = projects[index];
  projects.splice(index, 1);
  saveProjects(projects);

  // MOCK: Also delete associated tasks would happen here

  return { data: { $id: projectId, workspaceId: deletedProject.workspaceId } };
}

export async function mockGetProjectAnalytics(projectId: string): Promise<{
  data: {
    taskCount: number;
    taskDifference: number;
    assignedTaskCount: number;
    assignedTaskDifference: number;
    completedTaskCount: number;
    completedTaskDifference: number;
    incompleteTaskCount: number;
    incompleteTaskDifference: number;
    overdueTaskCount: number;
    overdueTaskDifference: number;
  };
}> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const user = getCurrentUserSync();
  const allTasks = getStoredTasks().filter((t) => t.projectId === projectId);

  const inRange = (t: { $createdAt: string }, start: Date, end: Date) => {
    const d = new Date(t.$createdAt);
    return d >= start && d <= end;
  };

  const thisMonth = allTasks.filter((t: Task) => inRange(t, thisMonthStart, thisMonthEnd));
  const lastMonth = allTasks.filter((t: Task) => inRange(t, lastMonthStart, lastMonthEnd));

  const taskCount = thisMonth.length;
  const taskDifference = taskCount - lastMonth.length;

  const assignedThis = thisMonth.filter((t: Task) => user && t.assigneeId === user.$id);
  const assignedLast = lastMonth.filter((t: Task) => user && t.assigneeId === user.$id);
  const assignedTaskCount = assignedThis.length;
  const assignedTaskDifference = assignedTaskCount - assignedLast.length;

  const completedThis = thisMonth.filter((t: Task) => t.status === TaskStatus.DONE);
  const completedLast = lastMonth.filter((t: Task) => t.status === TaskStatus.DONE);
  const completedTaskCount = completedThis.length;
  const completedTaskDifference = completedTaskCount - completedLast.length;

  const incompleteThis = thisMonth.filter((t: Task) => t.status !== TaskStatus.DONE);
  const incompleteLast = lastMonth.filter((t: Task) => t.status !== TaskStatus.DONE);
  const incompleteTaskCount = incompleteThis.length;
  const incompleteTaskDifference = incompleteTaskCount - incompleteLast.length;

  const overdueThis = thisMonth.filter(
    (t: Task) => t.status !== TaskStatus.DONE && t.dueDate && new Date(t.dueDate) < now,
  );
  const overdueLast = lastMonth.filter(
    (t: Task) => t.status !== TaskStatus.DONE && t.dueDate && new Date(t.dueDate) < now,
  );
  const overdueTaskCount = overdueThis.length;
  const overdueTaskDifference = overdueTaskCount - overdueLast.length;

  return {
    data: {
      taskCount,
      taskDifference,
      assignedTaskCount,
      assignedTaskDifference,
      completedTaskCount,
      completedTaskDifference,
      incompleteTaskCount,
      incompleteTaskDifference,
      overdueTaskCount,
      overdueTaskDifference,
    },
  };
}

export function getMockProjectSync(projectId: string): Project | null {
  const projects = getStoredProjects();
  return projects.find((p) => p.$id === projectId) || null;
}
