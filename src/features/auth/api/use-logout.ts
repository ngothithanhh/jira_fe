import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useLogout = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/auth/logout', {});
      } catch (error) {
        // Ignore error
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    },
    onSuccess: () => {
      toast.success("Đăng xuất thành công");
      queryClient.clear();
      router.refresh();
      setTimeout(() => {
        router.push('/sign-in');
      }, 100);
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};