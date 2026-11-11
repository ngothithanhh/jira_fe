'use client';

import { localizeLabel } from '@/lib/locale';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DottedSeparator } from '@/components/dotted-separator';
import { useGetIssueStatuses } from '@/features/tasks/api/use-get-issue-statuses';
import { useCreateIssueStatus } from '@/features/tasks/api/use-create-issue-status';
import { useUpdateIssueStatus } from '@/features/tasks/api/use-update-issue-status';
import { useDeleteIssueStatus } from '@/features/tasks/api/use-delete-issue-status';
import { Trash2, Pencil, X, Check } from 'lucide-react';

export const IssueStatusesSettings = () => {
  const { data: statuses, isLoading } = useGetIssueStatuses();
  const { mutate: createStatus, isPending: isCreating } = useCreateIssueStatus();
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateIssueStatus();
  const { mutate: deleteStatus, isPending: isDeleting } = useDeleteIssueStatus();

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>('TO_DO');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('TO_DO');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createStatus(
      { statusName: newName, statusCategory: newCategory },
      {
        onSuccess: () => {
          setNewName('');
          setNewCategory('TO_DO');
        },
      }
    );
  };

  const handleStartEdit = (status: any) => {
    setEditingId(status.statusId);
    setEditName(status.statusName);
    setEditCategory(status.statusCategory);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateStatus(
      { id: editingId, data: { statusName: editName, statusCategory: editCategory } },
      {
        onSuccess: () => {
          setEditingId(null);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("Bạn có chắc muốn xóa trạng thái này?")) {
      deleteStatus(id);
    }
  };

  if (isLoading) {
    return (
      <Card className="size-full border-none shadow-none">
        <CardContent className="p-7">
          <p>Đang tải trạng thái công việc...</p>
        </CardContent>
      </Card>
    );
  }

  const isPending = isCreating || isUpdating || isDeleting;

  return (
    <Card className="size-full border-none shadow-none">
      <CardHeader className="flex flex-row items-center gap-x-4 p-7 space-y-0">
        <CardTitle className="text-xl font-bold">Trạng thái công việc</CardTitle>
      </CardHeader>
      <div className="px-7">
        <DottedSeparator />
      </div>
      <CardContent className="p-7 flex flex-col gap-y-6">
        <div className="flex flex-col gap-y-4">
          <h3 className="font-semibold">Tạo trạng thái mới</h3>
          <div className="flex items-center gap-x-2">
            <Input
              placeholder="Tên trạng thái (ví dụ: Đang kiểm thử)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isPending}
              className="w-[250px]"
            />
            <Select value={newCategory} onValueChange={setNewCategory} disabled={isPending}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Nhóm trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TO_DO">Cần làm</SelectItem>
                <SelectItem value="IN_PROGRESS">Đang thực hiện</SelectItem>
                <SelectItem value="DONE">Hoàn thành</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
              Tạo trạng thái
            </Button>
          </div>
        </div>

        <DottedSeparator />

        <div className="flex flex-col gap-y-4">
          <h3 className="font-semibold">Các trạng thái hiện có</h3>
          {(!statuses || statuses.length === 0) ? (
            <p className="text-sm text-muted-foreground">Chưa có trạng thái nào được thiết lập.</p>
          ) : (
            <ul className="flex flex-col gap-y-2">
              {statuses.map((status: any) => {
                const isEditing = editingId === status.statusId;
                return (
                  <li key={status.statusId} className="flex items-center justify-between p-4 border rounded-md">
                    {isEditing ? (
                      <div className="flex items-center gap-x-2 flex-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          disabled={isPending}
                          className="w-[250px]"
                        />
                        <Select value={editCategory} onValueChange={setEditCategory} disabled={isPending}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Nhóm trạng thái" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TO_DO">Cần làm</SelectItem>
                            <SelectItem value="IN_PROGRESS">Đang thực hiện</SelectItem>
                            <SelectItem value="DONE">Hoàn thành</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-x-4 flex-1">
                        <span className="font-medium min-w-[200px]">{localizeLabel(status.statusName)}</span>
                        <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
                          {localizeLabel(status.statusCategory)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-x-2">
                      {isEditing ? (
                        <>
                          <Button size="icon" variant="ghost" onClick={handleSaveEdit} disabled={isPending || !editName.trim()}>
                            <Check className="size-4 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={handleCancelEdit} disabled={isPending}>
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => handleStartEdit(status)} disabled={isPending}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="icon" variant="destructive" onClick={() => handleDelete(status.statusId)} disabled={isPending}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
