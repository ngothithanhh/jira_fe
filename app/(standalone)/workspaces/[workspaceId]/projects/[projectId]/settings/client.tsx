'use client';

import { PageError } from '@/components/page-error';
import { PageLoader } from '@/components/page-loader';
import { useGetProject } from '@/features/projects/api/use-get-project';
import { EditProjectForm } from '@/features/projects/components/edit-project-form';
import { ProjectIssueTypesSettings } from '@/features/projects/components/project-issue-types-settings';
import { WorkspaceWorkflowsSettings } from '@/features/workflows/components/workspace-workflows-settings';
import { IssueStatusesSettings } from '@/features/tasks/components/issue-statuses-settings';

import { useProjectId } from '@/features/projects/hooks/use-project-id';

export const ProjectIdSettingsClient = () => {
  const projectId = useProjectId();
  const { data: initialValues, isLoading } = useGetProject({ projectId });

  if (isLoading) {
    return <PageLoader />;
  }

  if (!initialValues) {
    return <PageError message="Không tìm thấy dự án" />;
  }

  return (
    <div className="w-full lg:max-w-xl">
      <EditProjectForm initialValues={initialValues} />
      <div className="mt-8">
        <ProjectIssueTypesSettings />
      </div>
      <div className="mt-8">
        <IssueStatusesSettings />
      </div>
      <div className="mt-8">
        <WorkspaceWorkflowsSettings />
      </div>
    </div>
  );
};
