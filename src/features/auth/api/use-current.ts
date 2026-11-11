import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export const useCurrent = () => {
  const query = useQuery({
    queryKey: ['current'],
    queryFn: async () => {
      // If there is no token in localStorage, skip API call to save performance
      if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
        return null;
      }
      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data.user;
        if (user) {
          // Map backend id to Appwrite's $id convention used in frontend
          user.$id = String(user.id);
        }
        return user || null;
      } catch (error) {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return query;
};