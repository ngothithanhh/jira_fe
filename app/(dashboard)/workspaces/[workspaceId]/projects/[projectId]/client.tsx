'use client';

import { ListTodo, Pencil } from 'lucide-react';
import Link from 'next/link';

import { Analytics } from '@/components/analytics';
import { PageError } from '@/components/page-error';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import { useGetProject } from '@/features/projects/api/use-get-project';
import { useGetProjectAnalytics } from '@/features/projects/api/use-get-project-analytics';
import { ProjectAvatar } from '@/features/projects/components/project-avatar';
import { useProjectId } from '@/features/projects/hooks/use-project-id';
import { TaskViewSwitcher } from '@/features/tasks/components/task-view-switcher';
import { ProjectMembersList } from '@/features/members/components/project-members-list';

export const ProjectIdClient = () => {
  const projectId = useProjectId();

  const { data: project, isLoading: isLoadingProject } = useGetProject({ projectId });
  const { data: projectAnalytics, isLoading: isLoadingProjectAnalytics } = useGetProjectAnalytics({ projectId });

  const isLoading = isLoadingProject || isLoadingProjectAnalytics;

  if (isLoading) return <PageLoader />;

  if (!project) return <PageError message="Không tìm thấy dự án." />;

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <ProjectAvatar name={project.name} image={project.imageUrl} className="size-8" />

          <p className="text-lg font-semibold">{project.name}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/projects/${project.$id}/backlog`}><ListTodo className="mr-2 size-4" />Backlog & Sprint</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/workspaces/${project.workspaceId}/projects/${project.$id}/settings`}>
              <Pencil className="mr-2 size-4" />
              Chỉnh sửa dự án
            </Link>
          </Button>
        </div>
      </div>

      {projectAnalytics && <Analytics data={projectAnalytics} />}

      <ProjectMembersList />
      
      <TaskViewSwitcher projectId={projectId} hideProjectFilter />
    </div>
  );
};
