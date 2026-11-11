'use server';

/**
 * MOCK: Workspace server queries
 * These functions have been replaced with mock implementations.
 */

import { mockGetWorkspaces } from '@/lib/mock/workspaces';

export const getWorkspaces = async () => {
  try {
    // MOCK: Get workspaces from localStorage
    const result = await mockGetWorkspaces();
    return result.data;
  } catch {
    return { documents: [], total: 0 };
  }
};

export const getWorkspaceInfo = async () => {
  return {
    $id: '1',
    name: 'Demo Workspace',
    imageUrl: '',
  };
};