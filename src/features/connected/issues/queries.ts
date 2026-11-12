'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { completeConnectedMutation, connectedMutation, connectedRequest, ConnectedError } from '../client';
import { useSession } from '../session';
import { useConnectedProject, useProjectMutationScope } from '../projects/queries';
import { assertProject, planningIssue, searchQuery, type Filters, type IssueDto, type IssuePage, type References, type SprintDto, type StatusDto, type TypeDto, type MemberDto } from './model';
import type { PlanningData } from '../../backlog/types';

/** Mọi cache dùng actor/project; thay phiên sẽ hủy request và xóa cache qua ConnectedProvider. */
export function useIssueContext(projectId: number) {
  const session = useSession();
  const project = useConnectedProject(projectId);
  const actor = session.data?.user.userId;
  const permitted = (permission: string) => !!project.data && !project.isError && (project.data.context.systemAdmin || project.data.context.projectPermissions.includes(permission));
  return { actor, project, permitted, enabled: !!session.data && !!project.data && !project.isError && !session.switching };
}

/** Reference được đọc sau gate; lỗi bất kỳ nguồn nào giữ nguyên error, không lấp bằng danh sách giả. */
export function useIssueReferences(projectId: number) {
  const { actor, enabled } = useIssueContext(projectId);
  return useQuery({ queryKey: ['connected','issue-refs',actor,projectId], enabled, retry: false,
    queryFn: async ({ signal }): Promise<References> => {
      const [statuses,types,members] = await Promise.all([
        connectedRequest<StatusDto[]>('issue-statuses',{signal}),
        connectedRequest<TypeDto[]>(`projects/${projectId}/issue-types`,{signal}),
        connectedRequest<MemberDto[]>(`projects/${projectId}/members`,{signal}),
      ]);
      return { statuses,types,members };
    } });
}

/** Search do BE lọc và phân trang; query key chứa nguyên bộ lọc, không dùng dữ liệu trang trước làm kết quả trang mới. */
export function useIssueSearch(projectId: number, filters: Filters) {
  const { actor, enabled } = useIssueContext(projectId);
  return useQuery({ queryKey: ['connected','issues',actor,projectId,searchQuery(filters)], enabled, retry: false,
    queryFn: async ({ signal }) => {
      const result = await connectedRequest<IssuePage>(`projects/${projectId}/issues/search?${searchQuery(filters)}`,{signal});
      result.items.forEach((i) => assertProject(i,projectId)); return result;
    } });
}

/** Detail kiểm project sau quyền BE; ID cùng số ở route khác không được trình bày trong project hiện tại. */
export function useIssueDetail(projectId: number, issueId: number) {
  const { actor, enabled } = useIssueContext(projectId);
  return useQuery({ queryKey: ['connected','issue',actor,projectId,issueId], enabled, retry: false,
    queryFn: async ({ signal }) => { const issue = await connectedRequest<IssueDto>(`issues/${issueId}`,{signal}); assertProject(issue,projectId); return issue; } });
}

/** Chỉ tải issue của sprint mở; CLOSED giữ lịch sử ở BE, không thành một nhóm có thể sửa trong backlog. */
export function usePlanning(projectId: number) {
  const { actor, enabled, project } = useIssueContext(projectId);
  const refs = useIssueReferences(projectId);
  const client = useQueryClient();
  const previousRefs = useRef(refs.data);
  useEffect(() => {
    // Reference đổi tên/category chỉ refetch cùng cache, không đổi key làm mất panel hoặc bản nháp đang mở.
    if (previousRefs.current !== refs.data) {
      previousRefs.current = refs.data;
      void client.invalidateQueries({queryKey:['connected','planning',actor,projectId]});
    }
  },[refs.data,actor,projectId,client]);
  return useQuery({ queryKey: ['connected','planning',actor,projectId], enabled: enabled && !!refs.data, retry: false,
    queryFn: async ({ signal }): Promise<PlanningData> => {
      const [sprints,backlog] = await Promise.all([
        connectedRequest<SprintDto[]>(`sprints/project/${projectId}`,{signal}),
        connectedRequest<IssueDto[]>(`projects/${projectId}/backlog`,{signal}),
      ]);
      // Lấy reference từ cache tại lúc xử lý response; closure của query đang chạy có thể có trước lần refetch reference.
      const references = client.getQueryData<References>(['connected','issue-refs',actor,projectId]);
      if (!references) throw new Error('Chưa tải được cấu hình công việc.');
      const open = sprints.filter((s): s is SprintDto & {state: 'FUTURE' | 'ACTIVE'} => s.state !== 'CLOSED')
        .sort((a,b) => Number(b.state === 'ACTIVE')-Number(a.state === 'ACTIVE') || a.sprintId-b.sprintId);
      const map = (i: IssueDto) => { assertProject(i,projectId); return planningIssue(i,references.statuses); };
      const groups = await Promise.all(open.map(async (s) => {
        assertProject(s,projectId);
        const issues = await connectedRequest<IssueDto[]>(`sprints/${s.sprintId}/issues`,{signal});
        return { id: s.sprintId, name: s.sprintName, goal: s.goal ?? '', state: s.state, startDate: s.startDate, endDate: s.endDate, issues: issues.map(map) };
      }));
      return { projectId, projectName: project.data!.project.projectName, projectKey: project.data!.project.projectKey,
        sprints: groups, backlog: backlog.map(map), issueTypes: references.types.map((t) => ({ id: t.issueTypeId, name: t.issueTypeName, isDefault: t.isDefault })) };
    } });
}

/**
 * Từng ghi dùng actor hiện tại và khóa phiên đã có. Khóa submit giữ qua invalidate/completion để chặn bấm đôi.
 * 409 tải lại cache để người dùng xem dữ liệu mới, không tự gửi lại mutation hoặc tự chọn version mới để xóa.
 */
export function useIssueWrite(projectId: number) {
  const { actor } = useIssueContext(projectId);
  const client = useQueryClient();
  const capture = useProjectMutationScope();
  const locked = useRef(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const refresh = async () => {
    await Promise.all(['issues','issue','planning','projects','project'].map((domain) => client.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'connected' && q.queryKey[1] === domain && q.queryKey[2] === actor
        && (domain === 'projects' || q.queryKey[3] === projectId),
    })));
  };
  async function run<T>(path: string, init: RequestInit, message: string, complete?: (data: T) => void): Promise<T> {
    if (locked.current || !actor) throw new ConnectedError(409,'Một thao tác đang được xử lý.');
    locked.current = true; setBusy(true); setError('');
    const current = capture();
    try {
      const result = await connectedMutation<T>(path,actor,init,current);
      if (!current()) throw new ConnectedError(409,'Phiên đã thay đổi.');
      // Response ghi issue đã được BE commit là snapshot mới nhất đã xác nhận; refetch lỗi vẫn giữ dữ liệu này.
      const saved = result as IssueDto | undefined;
      if (saved && typeof saved.issueId === 'number' && saved.projectId === projectId && typeof saved.summary === 'string') {
        client.setQueryData<IssueDto>(['connected','issue',actor,projectId,saved.issueId],(cached) =>
          cached && cached.version !== null && saved.version !== null && cached.version > saved.version ? cached : saved);
      }
      await refresh();
      // Có thể người khác đã ghi C sau response B và GET đã đọc C; completion phải dùng snapshot mới nhất đã xác nhận.
      const completed = await completeConnectedMutation(actor,current,() => {
        // Đọc trong callback sau khi lấy khóa/kiểm auth; refetch có thể đã cập nhật cache trong thời gian chờ đó.
        const latest = saved && typeof saved.issueId === 'number' && saved.projectId === projectId
          ? client.getQueryData<IssueDto>(['connected','issue',actor,projectId,saved.issueId]) ?? result : result;
        complete?.(latest as T); if (message) toast.success(message);
      });
      if (!completed) throw new ConnectedError(409,'Phiên đã thay đổi.');
      return result;
    } catch (err) {
      if (current()) {
        if (err instanceof ConnectedError && err.status === 409) await refresh();
        await completeConnectedMutation(actor,current,() => { const message = err instanceof Error ? err.message : 'Không thể thực hiện yêu cầu.'; setError(message); toast.error(message); });
      }
      throw err;
    } finally { locked.current = false; if (current()) setBusy(false); }
  }
  return { run,busy,error,clearError: () => setError('') };
}
