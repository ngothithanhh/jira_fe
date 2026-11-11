'use client';

import { localizeLabel } from '@/lib/locale';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DottedSeparator } from '@/components/dotted-separator';
import { useGetIssueTypes } from '@/features/issue-types/api/use-get-issue-types';
import { useCreateIssueType } from '@/features/issue-types/api/use-create-issue-type';
import { useGetProjectIssueTypes } from '@/features/projects/api/use-get-project-issue-types';
import { useAssignIssueType } from '@/features/projects/api/use-assign-issue-type';
import { useSetDefaultIssueType } from '@/features/projects/api/use-set-default-issue-type';
import { useRemoveIssueType } from '@/features/projects/api/use-remove-issue-type';
import { useProjectId } from '@/features/projects/hooks/use-project-id';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';

export const ProjectIssueTypesSettings = () => {
  const projectId = useProjectId();
  
  const { data: globalIssueTypes, isLoading: isLoadingGlobal } = useGetIssueTypes();
  const { data: projectIssueTypes, isLoading: isLoadingProject } = useGetProjectIssueTypes(projectId);
  
  const { mutate: createIssueType, isPending: isCreatingGlobal } = useCreateIssueType();
  const { mutate: assignIssueType, isPending: isAssigning } = useAssignIssueType(projectId);
  const { mutate: setDefaultIssueType, isPending: isSettingDefault } = useSetDefaultIssueType(projectId);
  const { mutate: removeIssueType, isPending: isRemoving } = useRemoveIssueType(projectId);

  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState<string>('');
  const [newIssueTypeName, setNewIssueTypeName] = useState('');

  const handleCreateGlobal = () => {
    if (!newIssueTypeName.trim()) return;
    createIssueType({ typeName: newIssueTypeName }, {
      onSuccess: () => {
        setNewIssueTypeName('');
      }
    });
  };

  const handleAssignToProject = () => {
    if (!selectedIssueTypeId) return;
    assignIssueType({ issueTypeId: parseInt(selectedIssueTypeId, 10), isDefault: false }, {
      onSuccess: () => {
        setSelectedIssueTypeId('');
      }
    });
  };

  const isLoading = isLoadingGlobal || isLoadingProject;
  const isPending = isCreatingGlobal || isAssigning || isSettingDefault || isRemoving;

  // Filter out issue types that are already assigned to the project
  const availableIssueTypes = globalIssueTypes?.filter(
    (gType: any) => !projectIssueTypes?.some((pType: any) => pType.issueTypeId === gType.issueTypeId)
  );

  return (
    <Card className="size-full border-none shadow-none mt-4">
      <CardHeader className="flex flex-row items-center gap-x-4 space-y-0 p-7">
        <CardTitle className="text-xl font-bold">Thiết lập loại công việc</CardTitle>
      </CardHeader>
      
      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <div className="flex flex-col gap-y-6">
          
          {/* Add existing to project */}
          <div className="flex flex-col gap-y-2">
            <h3 className="font-semibold text-sm">Thêm loại công việc có sẵn</h3>
            <div className="flex items-center gap-x-4">
              <Select value={selectedIssueTypeId} onValueChange={setSelectedIssueTypeId} disabled={isPending}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Chọn loại công việc" />
                </SelectTrigger>
                <SelectContent>
                  {availableIssueTypes?.map((type: any, index: number) => {
                    const id = type.issueTypeId || type.id || index;
                    return (
                      <SelectItem key={id} value={String(id)}>
                        {localizeLabel(type.typeName || type.name || "Không xác định")}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button onClick={handleAssignToProject} disabled={isPending || !selectedIssueTypeId}>
                Thêm vào dự án
              </Button>
            </div>
          </div>

          <DottedSeparator />

          {/* Create new global issue type */}
          <div className="flex flex-col gap-y-2">
            <h3 className="font-semibold text-sm">Tạo loại công việc mới</h3>
            <p className="text-xs text-muted-foreground">Tạo loại công việc mới để sử dụng trong hệ thống.</p>
            <div className="flex items-center gap-x-4">
              <Input 
                placeholder="Tên loại công việc mới" 
                value={newIssueTypeName} 
                onChange={(e) => setNewIssueTypeName(e.target.value)}
                disabled={isPending}
                className="w-[250px]"
              />
              <Button onClick={handleCreateGlobal} disabled={isPending || !newIssueTypeName.trim()} variant="outline">
                <Plus className="size-4 mr-2" />
                Tạo
              </Button>
            </div>
          </div>

          <DottedSeparator />

          {/* Project Issue Types List */}
          <div className="flex flex-col gap-y-2">
            <h3 className="font-semibold text-sm">Các loại công việc của dự án</h3>
            {isLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="border rounded-md mt-2">
                {projectIssueTypes && projectIssueTypes.length > 0 ? (
                  <ul className="divide-y">
                    {projectIssueTypes.map((type: any) => (
                      <li key={type.issueTypeId} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-x-2">
                          <span className="font-medium">{localizeLabel(type.issueTypeName)}</span>
                          {type.isDefault && (
                            <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded-full flex items-center gap-x-1">
                              <Star className="size-3 fill-amber-500 text-amber-500" /> Mặc định
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2">
                          {!type.isDefault && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() => setDefaultIssueType({ issueTypeId: type.issueTypeId })}
                            >
                              Đặt làm mặc định
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending || type.isDefault}
                            onClick={() => removeIssueType({ issueTypeId: type.issueTypeId })}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">Dự án này chưa có loại công việc nào.</div>
                )}
              </div>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
};
