export enum MemberRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

// Base document type for mock data
export interface BaseDocument {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions: string[];
  $collectionId: string;
  $databaseId: string;
}

export type Member = BaseDocument & {
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
};
