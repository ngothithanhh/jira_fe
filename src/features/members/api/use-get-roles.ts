import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useGetRoles = () => {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/user-role');
        console.log("Roles API response:", response.data);
        return response.data;
      } catch (error) {
        console.error("Roles API error:", error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
