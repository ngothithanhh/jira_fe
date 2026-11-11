/**
 * MOCK: Tasks data and functions
 * This module provides mock task management without backend
 */

import { TaskStatus, type Task } from '@/features/tasks/types';

const STORAGE_KEY = 'mock_tasks';

// MOCK: Sample task data
const MOCK_TASKS_INITIAL: Task[] = [
  {
    $id: 'task_demo_001',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Set up database',
    status: TaskStatus.DONE,
    assigneeId: 'user_demo_001',
    projectId: 'project_demo_001',
    workspaceId: 'workspace_demo_001',
    position: 1,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Initialize PostgreSQL database with migrations',
  },
  {
    $id: 'task_demo_002',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Create API endpoints',
    status: TaskStatus.IN_REVIEW,
    assigneeId: 'user_demo_001',
    projectId: 'project_demo_001',
    workspaceId: 'workspace_demo_001',
    position: 2,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Build REST API for workspace management',
  },
  {
    $id: 'task_demo_003',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Frontend components',
    status: TaskStatus.IN_PROGRESS,
    assigneeId: 'user_demo_002',
    projectId: 'project_demo_001',
    workspaceId: 'workspace_demo_001',
    position: 3,
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Implement React components for dashboard',
  },
  {
    $id: 'task_demo_004',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Write documentation',
    status: TaskStatus.TODO,
    assigneeId: 'user_demo_001',
    projectId: 'project_demo_001',
    workspaceId: 'workspace_demo_001',
    position: 4,
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Create comprehensive API documentation',
  },
  {
    $id: 'task_demo_005',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Unit tests',
    status: TaskStatus.BACKLOG,
    assigneeId: 'user_demo_002',
    projectId: 'project_demo_002',
    workspaceId: 'workspace_demo_001',
    position: 5,
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Add comprehensive unit tests for all functions',
  },
  {
    $id: 'task_demo_006',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'User authentication',
    status: TaskStatus.TODO,
    assigneeId: 'user_demo_001',
    projectId: 'project_demo_003',
    workspaceId: 'workspace_demo_002',
    position: 1,
    dueDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    description: 'Implement OAuth2 authentication',
  },
];

export function getStoredTasks(): Task[] {
  if (typeof window === 'undefined') return MOCK_TASKS_INITIAL;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = MOCK_TASKS_INITIAL;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return MOCK_TASKS_INITIAL;
  }
}

function saveTasks(tasks: Task[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
}

export async function mockGetTasks(
  workspaceId: string,
  projectId?: string,
  status?: TaskStatus,
  assigneeId?: string,
  dueBefore?: Date,
): Promise<{ data: { documents: Task[]; total: number } }> {
  let tasks = getStoredTasks().filter((t) => t.workspaceId === workspaceId);

  if (projectId) {
    tasks = tasks.filter((t) => t.projectId === projectId);
  }

  if (status) {
    tasks = tasks.filter((t) => t.status === status);
  }

  if (assigneeId) {
    tasks = tasks.filter((t) => t.assigneeId === assigneeId);
  }

  if (dueBefore) {
    tasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < dueBefore);
  }

  return {
    data: {
      documents: tasks.sort((a, b) => a.position - b.position),
      total: tasks.length,
    },
  };
}

export async function mockGetTask(taskId: string): Promise<{ data: Task }> {
  const tasks = getStoredTasks();
  const task = tasks.find((t) => t.$id === taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  return { data: task };
}

export async function mockCreateTask(
  workspaceId: string,
  projectId: string,
  name: string,
  status: TaskStatus = TaskStatus.TODO,
  description?: string,
  dueDate?: string,
  assigneeId?: string,
): Promise<{ data: Task }> {
  const tasks = getStoredTasks();
  const maxPosition = Math.max(
    ...tasks
      .filter((t) => t.projectId === projectId)
      .map((t) => t.position),
    0,
  );

  // MOCK: Create new task
  const newTask: Task = {
    $id: `task_${crypto.randomUUID()}`,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name,
    status,
    assigneeId: assigneeId || 'user_demo_001',
    projectId,
    workspaceId,
    position: maxPosition + 1,
    dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    description,
  };

  tasks.push(newTask);
  saveTasks(tasks);

  return { data: newTask };
}

export async function mockUpdateTask(
  taskId: string,
  updates: Partial<Omit<Task, '$id' | '$createdAt' | '$permissions' | '$collectionId' | '$databaseId'>>,
): Promise<{ data: Task }> {
  const tasks = getStoredTasks();
  const task = tasks.find((t) => t.$id === taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  // MOCK: Update task fields
  Object.assign(task, updates, {
    $updatedAt: new Date().toISOString(),
  });

  saveTasks(tasks);

  return { data: task };
}

export async function mockDeleteTask(taskId: string): Promise<{
  data: { $id: string };
}> {
  const tasks = getStoredTasks();
  const index = tasks.findIndex((t) => t.$id === taskId);

  if (index === -1) {
    throw new Error('Task not found');
  }

  tasks.splice(index, 1);
  saveTasks(tasks);

  return { data: { $id: taskId } };
}

export async function mockUpdateTaskPosition(
  taskId: string,
  position: number,
): Promise<{ data: Task }> {
  const tasks = getStoredTasks();
  const task = tasks.find((t) => t.$id === taskId);

  if (!task) {
    throw new Error('Task not found');
  }

  task.position = position;
  task.$updatedAt = new Date().toISOString();
  saveTasks(tasks);

  return { data: task };
}

export async function mockBulkUpdateTasks(
  updates: Array<{ id: string; status: TaskStatus }>,
): Promise<{ data: Task[] }> {
  const tasks = getStoredTasks();
  const updatedTasks: Task[] = [];

  for (const update of updates) {
    const task = tasks.find((t) => t.$id === update.id);
    if (task) {
      task.status = update.status;
      task.$updatedAt = new Date().toISOString();
      updatedTasks.push(task);
    }
  }

  saveTasks(tasks);
  return { data: updatedTasks };
}

export function getMockTaskSync(taskId: string): Task | null {
  const tasks = getStoredTasks();
  return tasks.find((t) => t.$id === taskId) || null;
}
