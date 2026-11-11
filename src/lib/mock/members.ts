/**
 * MOCK: Members data and functions
 * This module provides mock member management without backend
 */

import { MemberRole, type Member } from '@/features/members/types';

const STORAGE_KEY = 'mock_members';

// MOCK: Sample member data
const MOCK_MEMBERS_INITIAL: Member[] = [
  {
    $id: 'member_demo_001',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId: 'workspace_demo_001',
    userId: 'user_demo_001',
    name: 'Demo User',
    email: 'demo@example.com',
    role: MemberRole.ADMIN,
  },
  {
    $id: 'member_demo_002',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId: 'workspace_demo_001',
    userId: 'user_demo_002',
    name: 'Admin User',
    email: 'admin@example.com',
    role: MemberRole.MEMBER,
  },
  {
    $id: 'member_demo_003',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId: 'workspace_demo_001',
    userId: `user_${crypto.randomUUID()}`,
    name: 'John Doe',
    email: 'john@example.com',
    role: MemberRole.MEMBER,
  },
  {
    $id: 'member_demo_004',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId: 'workspace_demo_001',
    userId: `user_${crypto.randomUUID()}`,
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: MemberRole.MEMBER,
  },
  {
    $id: 'member_demo_005',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId: 'workspace_demo_002',
    userId: 'user_demo_001',
    name: 'Demo User',
    email: 'demo@example.com',
    role: MemberRole.ADMIN,
  },
];

function getStoredMembers(): Member[] {
  if (typeof window === 'undefined') return MOCK_MEMBERS_INITIAL;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = MOCK_MEMBERS_INITIAL;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return MOCK_MEMBERS_INITIAL;
  }
}

function saveMembers(members: Member[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  }
}

export async function mockGetMembers(workspaceId: string): Promise<{
  data: { documents: Member[]; total: number };
}> {
  const members = getStoredMembers();
  const workspaceMembers = members.filter((m) => m.workspaceId === workspaceId);

  return {
    data: {
      documents: workspaceMembers.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      ),
      total: workspaceMembers.length,
    },
  };
}

export async function mockGetMember(
  workspaceId: string,
  userId: string,
): Promise<{ data: Member | null }> {
  const members = getStoredMembers();
  const member = members.find(
    (m) => m.workspaceId === workspaceId && m.userId === userId,
  );

  return { data: member || null };
}

export async function mockUpdateMember(
  memberId: string,
  updates: { role?: MemberRole; name?: string },
): Promise<{ data: Member }> {
  const members = getStoredMembers();
  const member = members.find((m) => m.$id === memberId);

  if (!member) {
    throw new Error('Member not found');
  }

  // MOCK: Update member fields
  if (updates.role) {
    member.role = updates.role;
  }
  if (updates.name) {
    member.name = updates.name;
  }

  member.$updatedAt = new Date().toISOString();
  saveMembers(members);

  return { data: member };
}

export async function mockDeleteMember(memberId: string): Promise<{
  data: { $id: string };
}> {
  const members = getStoredMembers();
  const index = members.findIndex((m) => m.$id === memberId);

  if (index === -1) {
    throw new Error('Member not found');
  }

  members.splice(index, 1);
  saveMembers(members);

  return { data: { $id: memberId } };
}

export async function mockAddMember(
  workspaceId: string,
  userId: string,
  name: string,
  email: string,
  role: MemberRole = MemberRole.MEMBER,
): Promise<{ data: Member }> {
  // MOCK: Create new member
  const newMember: Member = {
    $id: `member_${crypto.randomUUID()}`,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    $permissions: [],
    $collectionId: '',
    $databaseId: '',
    workspaceId,
    userId,
    name,
    email,
    role,
  };

  const members = getStoredMembers();
  members.push(newMember);
  saveMembers(members);

  return { data: newMember };
}

export function getMockMemberSync(
  workspaceId: string,
  userId: string,
): Member | null {
  const members = getStoredMembers();
  return (
    members.find((m) => m.workspaceId === workspaceId && m.userId === userId) ||
    null
  );
}
