'use client';

import { localizeLabel } from '@/lib/locale';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DottedSeparator } from '@/components/dotted-separator';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddMember } from '@/features/members/api/use-add-member';
import { useGetRoles } from '@/features/members/api/use-get-roles';
import { useGetUsers } from '@/features/members/api/use-get-users';
import { useGetProjectMembers } from '@/features/members/api/use-get-project-members';
import { useProjectId } from '@/features/projects/hooks/use-project-id';
import { cn } from '@/lib/utils';

interface AddMemberFormProps {
  onCancel?: () => void;
}

const addMemberSchema = z.object({
  userId: z.string().min(1, "Vui lòng chọn người dùng"),
  roleId: z.string().min(1, "Vui lòng chọn vai trò"),
});

export const AddMemberForm = ({ onCancel }: AddMemberFormProps) => {
  const projectId = useProjectId();
  const { mutate: addMember, isPending } = useAddMember({ projectId });
  const { data: users, isLoading: isLoadingUsers } = useGetUsers();
  const { data: roles, isLoading: isLoadingRoles } = useGetRoles();
  const { data: members, isLoading: isLoadingMembers } = useGetProjectMembers({ projectId });
  const form = useForm<z.infer<typeof addMemberSchema>>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      userId: '',
      roleId: '',
    },
  });

  const onSubmit = (values: z.infer<typeof addMemberSchema>) => {
    addMember(
      {
        userId: parseInt(values.userId, 10),
        roleId: parseInt(values.roleId, 10),
      },
      {
        onSuccess: () => {
          form.reset();
          onCancel?.();
        },
      },
    );
  };

  const isLoading = isLoadingUsers || isLoadingRoles || isLoadingMembers || isPending;

  return (
    <Card className="size-full border-none shadow-none">
      <CardHeader className="flex p-7">
        <CardTitle className="text-xl font-bold">Thêm thành viên mới</CardTitle>
      </CardHeader>

      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-y-4">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Người dùng</FormLabel>
                    <Select defaultValue={field.value} onValueChange={field.onChange} disabled={isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn người dùng" />
                        </SelectTrigger>
                      </FormControl>
                      <FormMessage />
                      <SelectContent>
                        {users?.map((user: any) => {
                          const isMember = members?.some((m: any) => m.id?.userId === (user.userId || user.id) || m.user?.userId === (user.userId || user.id) || m.userId === (user.userId || user.id) || m.user?.id === (user.userId || user.id));
                          return (
                          <SelectItem key={user.userId || user.id} value={String(user.userId || user.id)} disabled={isMember}>
                            {user.fullName || user.userName || user.email} {isMember ? '(Đã tham gia)' : ''}
                          </SelectItem>
                        )})}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vai trò</FormLabel>
                    <Select defaultValue={field.value} onValueChange={field.onChange} disabled={isLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                      </FormControl>
                      <FormMessage />
                      <SelectContent>
                        {roles?.map((role: any) => (
                          <SelectItem key={role.roleId} value={String(role.roleId)}>
                            {localizeLabel(role.roleName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <DottedSeparator className="py-7" />

            <div className="flex items-center justify-between">
              <Button
                disabled={isLoading}
                type="button"
                size="lg"
                variant="secondary"
                onClick={onCancel}
                className={cn(!onCancel && 'invisible')}
              >
                Hủy
              </Button>

              <Button disabled={isLoading} type="submit" size="lg">
                Thêm thành viên
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
