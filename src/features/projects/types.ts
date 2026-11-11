export type Project = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions: string[];
  $collectionId: string;
  $databaseId: string;
  name: string;
  imageId?: string;
  imageUrl?: string;
  workspaceId: string;
};
