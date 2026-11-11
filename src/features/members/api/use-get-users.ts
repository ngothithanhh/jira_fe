import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/user');
        console.log("Users API response:", response.data);
        return response.data;
      } catch (error) {
        console.error("Users API error:", error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
