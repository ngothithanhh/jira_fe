'use client';

import { localizeLabel } from '@/lib/locale';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DatePicker } from '@/components/date-picker';
import { DottedSeparator } from '@/components/dotted-separator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MemberAvatar } from '@/features/members/components/member-avatar';
import { ProjectAvatar } from '@/features/projects/components/project-avatar';
import { useCreateTask } from '@/features/tasks/api/use-create-task';
import { createTaskSchema } from '@/features/tasks/schema';
import { TaskStatus } from '@/features/tasks/types';
import { useGetProjectMembers } from '@/features/members/api/use-get-project-members';
import { useWorkspaceId } from '@/features/workspaces/hooks/use-workspace-id';
import { useGetIssueStatuses } from '@/features/tasks/api/use-get-issue-statuses';
import { useGetProjectIssueTypes } from '@/features/projects/api/use-get-project-issue-types';
import { cn } from '@/lib/utils';

interface CreateTaskFormProps {
  initialStatus?: string | null;
  onCancel?: () => void;
  projectOptions: { id: string; name: string; imageUrl?: string }[];
  memberOptions: { id: string; name: string }[];
  defaultProjectId?: string;
}

export const CreateTaskForm = ({ initialStatus, onCancel, memberOptions, projectOptions, defaultProjectId }: CreateTaskFormProps) => {
  const router = useRouter();
  const workspaceId = useWorkspaceId();

  const { mutate: createTask, isPending } = useCreateTask();

  const createTaskForm = useForm<z.infer<typeof createTaskSchema>>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      name: '',
      dueDate: undefined,
      assigneeId: undefined,
      description: '',
      projectId: defaultProjectId || undefined,
      status: initialStatus ?? undefined,
      workspaceId,
      issueTypeId: '1',
      priority: 'Medium',
    },
  });

  const selectedProjectId = createTaskForm.watch('projectId');
  const { data: projectMembers } = useGetProjectMembers({ projectId: selectedProjectId });
  const { data: issueStatuses } = useGetIssueStatuses();
  const { data: projectIssueTypes } = useGetProjectIssueTypes(selectedProjectId || '');

  // Chuẩn hóa lựa chọn từ API/mock thành cùng kiểu trước khi render Select.
  const dynamicMemberOptions: { id: string; name: string }[] = selectedProjectId
    ? (projectMembers ? projectMembers.map((m: any) => ({
        id: String(m.userId || m.id),
        name: m.fullName || m.userName || m.name || m.email || "Không xác định",
      })) : [])
    : memberOptions;

  const onSubmit = (values: z.infer<typeof createTaskSchema>) => {
    createTask(
      {
        json: values,
      },
      {
        onSuccess: ({ data }) => {
          createTaskForm.reset();
          router.push(`/workspaces/${data.workspaceId}/tasks/${data.$id}`);
        },
      },
    );
  };

  return (
    <Card className="size-full border-none shadow-none">
      <CardHeader className="flex p-7">
        <CardTitle className="text-xl font-bold">Tạo công việc mới</CardTitle>
      </CardHeader>

      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <Form {...createTaskForm}>
          <form onSubmit={createTaskForm.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-y-4">
              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên công việc</FormLabel>

                    <FormControl>
                      <Input {...field} type="text" placeholder="Nhập tên công việc" />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hạn hoàn thành</FormLabel>

                    <FormControl>
                      <DatePicker {...field} disabled={isPending} placeholder="Chọn hạn hoàn thành" />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Người phụ trách</FormLabel>

                    <Select disabled={isPending} defaultValue={field.value} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>{field.value ? <SelectValue placeholder="Chọn người phụ trách" /> : "Chọn người phụ trách"}</SelectTrigger>
                      </FormControl>

                      <FormMessage />

                      <SelectContent>
                        {dynamicMemberOptions.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-x-2">
                              <MemberAvatar className="size-6" name={member.name} />
                              {member.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trạng thái</FormLabel>

                    <Select disabled={isPending} defaultValue={field.value} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>{field.value ? <SelectValue placeholder="Chọn trạng thái" /> : "Chọn trạng thái"}</SelectTrigger>
                      </FormControl>

                      <FormMessage />

                      <SelectContent>
                        {issueStatuses?.map((status: any) => (
                          <SelectItem key={status.statusId} value={String(status.statusId)}>
                            {localizeLabel(status.statusName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="issueTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loại công việc</FormLabel>
                    <Select disabled={isPending} defaultValue={field.value} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>{field.value ? <SelectValue placeholder="Chọn loại công việc" /> : "Chọn loại công việc"}</SelectTrigger>
                      </FormControl>
                      <FormMessage />
                      <SelectContent>
                        {projectIssueTypes?.map((type: any) => (
                          <SelectItem key={type.issueTypeId} value={String(type.issueTypeId)}>
                            {localizeLabel(type.issueTypeName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={createTaskForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mức độ ưu tiên</FormLabel>
                    <Select disabled={isPending} defaultValue={field.value} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>{field.value ? <SelectValue placeholder="Chọn mức độ ưu tiên" /> : "Chọn mức độ ưu tiên"}</SelectTrigger>
                      </FormControl>
                      <FormMessage />
                      <SelectContent>
                        <SelectItem value="Highest">Cao nhất</SelectItem>
                        <SelectItem value="High">Cao</SelectItem>
                        <SelectItem value="Medium">Trung bình</SelectItem>
                        <SelectItem value="Low">Thấp</SelectItem>
                        <SelectItem value="Lowest">Thấp nhất</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {!defaultProjectId && (
                <FormField
                  disabled={isPending}
                  control={createTaskForm.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dự án</FormLabel>
                      <Select disabled={isPending} defaultValue={field.value} value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>{field.value ? <SelectValue placeholder="Chọn dự án" /> : "Chọn dự án"}</SelectTrigger>
                        </FormControl>
                        <FormMessage />
                        <SelectContent>
                          {projectOptions.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              <div className="flex items-center gap-x-2">
                                <ProjectAvatar className="size-6" name={project.name} image={project.imageUrl} />
                                {project.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DottedSeparator className="py-7" />

            <FormMessage />

            <div className="flex items-center justify-between">
              <Button
                disabled={isPending}
                type="button"
                size="lg"
                variant="secondary"
                onClick={onCancel}
                className={cn(!onCancel && 'invisible')}
              >
                Hủy
              </Button>

              <Button disabled={isPending} type="submit" size="lg">
                Tạo công việc
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
