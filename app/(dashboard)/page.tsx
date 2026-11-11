'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { PageLoader } from '@/components/page-loader';
import { useCurrent } from '@/features/auth/api/use-current';
import { useGetWorkspaces } from '@/features/workspaces/api/use-get-workspaces';

const HomePage = () => {
  const router = useRouter();
  
  const { data: user, isLoading: isLoadingUser } = useCurrent();
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useGetWorkspaces();

  useEffect(() => {
    if (isLoadingUser || isLoadingWorkspaces) return;

    if (!user) {
      router.push('/sign-in');
      return;
    }

    const firstWorkspace = workspaces?.documents?.[0];

    if (!firstWorkspace) {
      router.push('/workspaces/create');
    } else {
      router.push(`/workspaces/${firstWorkspace.$id}`);
    }
  }, [user, workspaces, isLoadingUser, isLoadingWorkspaces, router]);

  return <PageLoader />;
};

export default HomePage;
