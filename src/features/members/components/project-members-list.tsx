'use client';

import { vi } from 'date-fns/locale';


import { localizeLabel } from '@/lib/locale';

import { useGetProjectMembers } from '@/features/members/api/use-get-project-members';
import { MemberAvatar } from '@/features/members/components/member-avatar';
import { useProjectId } from '@/features/projects/hooks/use-project-id';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DottedSeparator } from '@/components/dotted-separator';
import { Button } from '@/components/ui/button';
import { useAddMemberModal } from '@/features/members/hooks/use-add-member-modal';
import { Badge } from '@/components/ui/badge';
import { PlusIcon } from 'lucide-react';
import { format } from 'date-fns';

export const ProjectMembersList = () => {
  const projectId = useProjectId();
  const { data: members, isLoading } = useGetProjectMembers({ projectId });
  const { open } = useAddMemberModal();

  if (isLoading) {
    return <div>Đang tải thành viên...</div>;
  }

  return (
    <Card className="col-span-1 border-none shadow-none mt-4">
      <CardHeader className="flex flex-row items-center justify-between p-7">
        <CardTitle className="text-xl font-bold">Thành viên dự án ({members?.length || 0})</CardTitle>
        <Button onClick={open} size="sm" variant="secondary">
          <PlusIcon className="mr-2 size-4" />
          Thêm thành viên
        </Button>
      </CardHeader>
      
      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <div className="flex flex-col gap-y-4">
          {members?.map((member: any) => (
            <div key={member.userId || Math.random()} className="flex items-center gap-x-4">
              <MemberAvatar name={member.fullName || member.userName || member.email || "Không xác định"} className="size-10" />
              <div className="flex flex-col">
                <p className="text-sm font-medium">{member.fullName || member.userName}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-x-2">
                  <Badge variant={member.role === 'PM' || member.role === 'Project Manager' ? 'default' : 'secondary'}>
                    {localizeLabel(member.role || "Thành viên")}
                  </Badge> 
                  Ngày tham gia: {member.assignedAt ? format(new Date(member.assignedAt), 'PPP', { locale: vi }) : "Không xác định"}
                </p>
              </div>
            </div>
          ))}
          {members?.length === 0 && (
            <p className="text-sm text-muted-foreground">Dự án này chưa có thành viên nào.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
