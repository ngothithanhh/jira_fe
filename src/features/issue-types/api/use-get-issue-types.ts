import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetIssueTypes = () => {
  return useQuery({
    queryKey: ['issue-types'],
    queryFn: async () => {
      const response = await apiClient.get('/issue-types');
      return response.data;
    },
  });
};
