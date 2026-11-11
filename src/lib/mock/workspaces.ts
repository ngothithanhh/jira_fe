/**
 * MOCK: Workspaces data and functions
 * This module provides mock workspace management without backend
 */

import type { Workspace } from '@/features/workspaces/types';
import { getCurrentUserSync, type MockUser } from './auth';

const STORAGE_KEY = 'mock_workspaces';

// MOCK: Sample workspace data
const MOCK_WORKSPACES_INITIAL: Workspace[] = [
  {
    $id: 'workspace_demo_001',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Design System',
    imageId: undefined,
    imageUrl: undefined,
    userId: 'user_demo_001',
    inviteCode: 'DESIGN2024',
  },
  {
    $id: 'workspace_demo_002',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name: 'Mobile App',
    imageId: undefined,
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="45" fill="%2300B4D8"/%3E%3C/svg%3E',
    userId: 'user_demo_001',
    inviteCode: 'MOBILE2024',
  },
];

function getStoredWorkspaces(): Workspace[] {
  if (typeof window === 'undefined') return MOCK_WORKSPACES_INITIAL;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = MOCK_WORKSPACES_INITIAL;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return MOCK_WORKSPACES_INITIAL;
  }
}

function saveWorkspaces(workspaces: Workspace[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
  }
}

export async function mockGetWorkspaces(): Promise<{
  data: { documents: Workspace[]; total: number };
}> {
  const user = getCurrentUserSync();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // MOCK: Get workspaces where user is a member
  const allWorkspaces = getStoredWorkspaces();
  const userWorkspaces = allWorkspaces.filter(
    (ws) => ws.userId === user.$id || ws.userId === user.$id,
  );

  return {
    data: {
      documents: userWorkspaces.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      ),
      total: userWorkspaces.length,
    },
  };
}

export async function mockGetWorkspace(workspaceId: string): Promise<{
  data: Workspace;
}> {
  const workspaces = getStoredWorkspaces();
  const workspace = workspaces.find((ws) => ws.$id === workspaceId);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  return { data: workspace };
}

export async function mockGetWorkspaceInfo(workspaceId: string): Promise<{
  data: { $id: string; name: string };
}> {
  const workspaces = getStoredWorkspaces();
  const workspace = workspaces.find((ws) => ws.$id === workspaceId);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  return {
    data: {
      $id: workspace.$id,
      name: workspace.name,
    },
  };
}

export async function mockCreateWorkspace(
  name: string,
  image?: string | File,
): Promise<{ data: Workspace }> {
  const user = getCurrentUserSync();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // MOCK: Create new workspace
  const newWorkspace: Workspace = {
    $id: `workspace_${crypto.randomUUID()}`,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    name,
    imageId: undefined,
    imageUrl: image && typeof image === 'string' ? image : undefined,
    userId: user.$id,
    inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
  };

  // MOCK: Handle file upload
  if (image instanceof File) {
    const reader = new FileReader();
    const imageUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(image);
    });
    newWorkspace.imageUrl = imageUrl;
  }

  const workspaces = getStoredWorkspaces();
  workspaces.push(newWorkspace);
  saveWorkspaces(workspaces);

  return { data: newWorkspace };
}

export async function mockUpdateWorkspace(
  workspaceId: string,
  updates: { name?: string; image?: string | File },
): Promise<{ data: Workspace }> {
  const workspaces = getStoredWorkspaces();
  const workspace = workspaces.find((ws) => ws.$id === workspaceId);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  // MOCK: Update workspace fields
  if (updates.name) {
    workspace.name = updates.name;
  }

  if (updates.image) {
    if (typeof updates.image === 'string') {
      workspace.imageUrl = updates.image;
    } else {
      // MOCK: Handle file upload
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(updates.image as File);
      });
      workspace.imageUrl = imageUrl;
    }
  }

  workspace.$updatedAt = new Date().toISOString();
  saveWorkspaces(workspaces);

  return { data: workspace };
}

export async function mockDeleteWorkspace(workspaceId: string): Promise<{
  data: { $id: string };
}> {
  const workspaces = getStoredWorkspaces();
  const index = workspaces.findIndex((ws) => ws.$id === workspaceId);

  if (index === -1) {
    throw new Error('Workspace not found');
  }

  workspaces.splice(index, 1);
  saveWorkspaces(workspaces);

  // MOCK: Also delete associated members, projects, tasks would happen here
  // For now, we'll handle it in their respective modules

  return { data: { $id: workspaceId } };
}

export async function mockResetInviteCode(workspaceId: string): Promise<{
  data: Workspace;
}> {
  const workspaces = getStoredWorkspaces();
  const workspace = workspaces.find((ws) => ws.$id === workspaceId);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  workspace.inviteCode = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
  workspace.$updatedAt = new Date().toISOString();
  saveWorkspaces(workspaces);

  return { data: workspace };
}

export async function mockJoinWorkspace(
  workspaceId: string,
  code: string,
): Promise<{ data: Workspace }> {
  const user = getCurrentUserSync();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const workspaces = getStoredWorkspaces();
  const workspace = workspaces.find((ws) => ws.$id === workspaceId);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  if (workspace.inviteCode !== code) {
    throw new Error('Invalid invite code');
  }

  // MOCK: Add user as member (for demo, we just note they can access it)
  // In real app, this creates a member document

  return { data: workspace };
}

export async function mockGetWorkspaceAnalytics(workspaceId: string): Promise<{
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
}> {
  // MOCK: Return placeholder analytics
  return {
    data: {
      taskCount: 12,
      taskDifference: 3,
      projectCount: 3,
      projectDifference: 1,
      assignedTaskCount: 8,
      assignedTaskDifference: 2,
      completedTaskCount: 7,
      completedTaskDifference: 4,
      incompleteTaskCount: 5,
      incompleteTaskDifference: -1,
      overdueTaskCount: 2,
      overdueTaskDifference: 1,
    },
  };
}

export function getMockWorkspaceSync(workspaceId: string): Workspace | null {
  const workspaces = getStoredWorkspaces();
  return workspaces.find((ws) => ws.$id === workspaceId) || null;
}
