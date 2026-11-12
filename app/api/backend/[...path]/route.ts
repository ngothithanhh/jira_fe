import { backendRoute } from '@/features/connected/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** path chỉ chọn API trong allowlist của cầu nối; mọi quyền nghiệp vụ vẫn được Spring Boot kiểm tra. */
function handle(request: Request, { params }: { params: { path: string[] } }) {
  return backendRoute(request, params.path);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
