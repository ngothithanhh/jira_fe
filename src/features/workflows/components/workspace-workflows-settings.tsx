'use client';

import { localizeLabel } from '@/lib/locale';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DottedSeparator } from '@/components/dotted-separator';
import { useGetWorkflowRules } from '@/features/workflows/api/use-get-workflow-rules';
import { useCreateWorkflowRule } from '@/features/workflows/api/use-create-workflow-rule';
import { useDeleteWorkflowRule } from '@/features/workflows/api/use-delete-workflow-rule';
import { useGetIssueStatuses } from '@/features/tasks/api/use-get-issue-statuses';
import { Loader2, Trash2 } from 'lucide-react';
import { useProjectId } from '@/features/projects/hooks/use-project-id';

export const WorkspaceWorkflowsSettings = () => {
  const projectId = useProjectId();
  const { data: rules, isLoading: isLoadingRules } = useGetWorkflowRules(projectId);
  const { data: statuses, isLoading: isLoadingStatuses } = useGetIssueStatuses();
  
  const { mutate: createRule, isPending: isCreating } = useCreateWorkflowRule(projectId);
  const { mutate: deleteRule, isPending: isDeleting } = useDeleteWorkflowRule(projectId);

  const [fromStatusId, setFromStatusId] = useState<string>('');
  const [toStatusId, setToStatusId] = useState<string>('');

  const handleAddRule = () => {
    if (!fromStatusId || !toStatusId) return;
    createRule({
      fromStatusId: parseInt(fromStatusId, 10),
      toStatusId: parseInt(toStatusId, 10),
    }, {
      onSuccess: () => {
        setFromStatusId('');
        setToStatusId('');
      }
    });
  };

  const getStatusName = (id: number) => {
    return statuses?.find((s: any) => s.statusId === id)?.statusName || `Trạng thái ${id}`;
  };

  const isLoading = isLoadingRules || isLoadingStatuses;

  return (
    <Card className="size-full border-none shadow-none mt-4">
      <CardHeader className="flex flex-row items-center gap-x-4 space-y-0 p-7">
        <CardTitle className="text-xl font-bold">Quy tắc quy trình</CardTitle>
      </CardHeader>
      
      <div className="px-7">
        <DottedSeparator />
      </div>

      <CardContent className="p-7">
        <div className="flex flex-col gap-y-4">
          <p className="text-sm text-muted-foreground">Thiết lập các bước chuyển trạng thái được phép cho công việc trong dự án này.</p>

          <div className="flex items-center gap-x-4 mb-4">
            <Select value={fromStatusId} onValueChange={setFromStatusId} disabled={isCreating}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Trạng thái ban đầu" />
              </SelectTrigger>
              <SelectContent>
                {statuses?.map((status: any) => (
                  <SelectItem key={status.statusId} value={status.statusId.toString()}>
                    {localizeLabel(status.statusName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-muted-foreground">→</span>

            <Select value={toStatusId} onValueChange={setToStatusId} disabled={isCreating}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Trạng thái tiếp theo" />
              </SelectTrigger>
              <SelectContent>
                {statuses?.map((status: any) => (
                  <SelectItem key={status.statusId} value={status.statusId.toString()}>
                    {localizeLabel(status.statusName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleAddRule} disabled={isCreating || !fromStatusId || !toStatusId}>
              {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
              Thêm quy tắc
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="border rounded-md">
              {rules && rules.length > 0 ? (
                <ul className="divide-y">
                  {rules.map((rule: any) => (
                    <li key={rule.ruleId} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-x-2 font-medium">
                        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md text-sm">{localizeLabel(rule.fromStatus?.statusName || getStatusName(rule.fromStatusId))}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-md text-sm">{localizeLabel(rule.toStatus?.statusName || getStatusName(rule.toStatusId))}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => deleteRule({ ruleId: rule.ruleId })}
                        disabled={isDeleting}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">Chưa có quy tắc quy trình. Công việc có thể chuyển sang bất kỳ trạng thái nào.</div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
