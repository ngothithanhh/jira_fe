import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

interface UseAddMemberProps {
  projectId: string;
}

export const useAddMember = ({ projectId }: UseAddMemberProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { userId: number; roleId: number }) => {
      const response = await apiClient.post(`/projects/${projectId}/members`, data);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Thêm thành viên thành công");
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });
};
