import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetIssueStatuses = () => {
  return useQuery({
    queryKey: ['issue-statuses'],
    queryFn: async () => {
      const response = await apiClient.get('/issue-statuses');
      return response.data;
    },
  });
};
