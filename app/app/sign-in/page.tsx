import { Suspense } from 'react';
import { ConnectedAuthScreen } from '@/features/connected/auth-screen';
export default function Page() { return <Suspense><ConnectedAuthScreen /></Suspense>; }
