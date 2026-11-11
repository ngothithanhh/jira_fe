import { getApiErrorMessage } from '@/lib/api-error';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

export const useRegister = () => {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      password: string;
    }) => {
      const response = await apiClient.post('/auth/register', data);
      if (typeof window !== 'undefined' && response.data.token) {
        localStorage.setItem('token', response.data.token);
        document.cookie = `token=${response.data.token}; path=/; max-age=86400; SameSite=Lax`;
      }
      return response.data;
    },
    onSuccess: () => {
      toast.success("Tạo tài khoản thành công");
      router.refresh();
      setTimeout(() => {
        router.push('/');
      }, 100);
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return mutation;
};