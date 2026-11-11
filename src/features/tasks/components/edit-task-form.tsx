'use client';

import { localizeLabel } from '@/lib/locale';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { useUpdateTask } from '@/features/tasks/api/use-update-task';
import { createTaskSchema } from '@/features/tasks/schema';
import { type Task, TaskStatus } from '@/features/tasks/types';
import { useGetProjectMembers } from '@/features/members/api/use-get-project-members';
import { useGetWorkflowRules } from '@/features/workflows/api/use-get-workflow-rules';
import { useGetIssueStatuses } from '@/features/tasks/api/use-get-issue-statuses';
import { cn } from '@/lib/utils';

interface EditTaskFormProps {
  onCancel?: () => void;
  projectOptions: { id: string; name: string; imageUrl?: string }[];
  memberOptions: { id: string; name: string }[];
  initialValues: Task;
}

export const EditTaskForm = ({ onCancel, memberOptions, projectOptions, initialValues }: EditTaskFormProps) => {
  const { mutate: createTask, isPending } = useUpdateTask();
  const { data: rules } = useGetWorkflowRules(initialValues.projectId);
  const { data: statuses } = useGetIssueStatuses();

  let allowedStatusNames: string[] = [initialValues.status];
  if (rules && rules.length > 0 && statuses && statuses.length > 0) {
    const currentStatusObj = statuses.find((s: any) => s.statusName === initialValues.status);
    if (currentStatusObj) {
      const allowedToStatusIds = rules
        .filter((r: any) => (r.fromStatusId ?? r.fromStatus?.statusId) === currentStatusObj.statusId)
        .map((r: any) => r.toStatusId ?? r.toStatus?.statusId);
      const allowedToStatusNames = statuses.filter((s: any) => allowedToStatusIds.includes(s.statusId)).map((s: any) => s.statusName);
      allowedStatusNames = [...allowedStatusNames, ...allowedToStatusNames];
    }
  } else {
    allowedStatusNames = Object.values(TaskStatus);
  }

  const isStatusAllowed = (statusName: string) => {
    if (!rules || rules.length === 0) return true; // if no workflow rules, allow all
    return allowedStatusNames.includes(statusName);
  };

  const editTaskForm = useForm<z.infer<typeof createTaskSchema>>({
    resolver: zodResolver(createTaskSchema.omit({ workspaceId: true, description: true })),
    defaultValues: {
      ...initialValues,
      dueDate: initialValues.dueDate ? new Date(initialValues.dueDate) : undefined,
      priority: initialValues.priority || 'Medium',
    },
  });

  const selectedProjectId = editTaskForm.watch('projectId');
  const { data: projectMembers } = useGetProjectMembers({ projectId: selectedProjectId });

  // Chuẩn hóa lựa chọn từ API/mock thành cùng kiểu trước khi render Select.
  const dynamicMemberOptions: { id: string; name: string }[] = selectedProjectId
    ? (projectMembers ? projectMembers.map((m: any) => ({
        id: String(m.userId || m.id),
        name: m.fullName || m.userName || m.name || m.email || "Không xác định",
      })) : [])
    : memberOptions;

  const onSubmit = (values: z.infer<typeof createTaskSchema>) => {
    const statusObj = statuses?.find((s: any) => s.statusName === values.status);
    const statusId = statusObj ? statusObj.statusId : undefined;

    createTask(
      {
        json: values,
        param: { taskId: initialValues.$id, statusId },
      },
      {
        onSuccess: () => {
          onCancel?.();
        },
      },
    );
  };

  return (
    <Card className="size-full border-none shadow-none">
      <CardHeader className="flex p-7">
        <CardTitle className="text-xl font-bold">Chỉnh sửa công việc</CardTitle>
      </CardHeader>

      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <Form {...editTaskForm}>
          <form onSubmit={editTaskForm.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-y-4">
              <FormField
                disabled={isPending}
                control={editTaskForm.control}
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
                control={editTaskForm.control}
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
                control={editTaskForm.control}
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
                control={editTaskForm.control}
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
                        {statuses?.map((s: any) => (
                          <SelectItem key={s.statusId} value={localizeLabel(s.statusName)} disabled={!isStatusAllowed(s.statusName)}>
                            {localizeLabel(s.statusName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                disabled={isPending}
                control={editTaskForm.control}
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

              <FormField
                disabled={isPending}
                control={editTaskForm.control}
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
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
