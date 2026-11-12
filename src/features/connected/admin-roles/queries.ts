'use client';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '../session';
import {configurationRead,useConfigurationGate} from '../configuration/queries';
import {rolesFrom,permissionsFrom,matrixFrom} from './contract';
/** Key tách actor; đọc bằng khóa phiên và chỉ chạy khi gate xác nhận SYSTEM_ADMIN. */
export function useRoleCatalog(){
  const session=useSession(),actor=session.data?.user.userId,gate=useConfigurationGate();
  const enabled=!!actor&&gate.data?.systemAdmin===true&&!session.switching;
  const roles=useQuery({queryKey:['connected','admin-roles',actor,'roles'],enabled,retry:false,
    queryFn:async({signal})=>rolesFrom(await configurationRead(actor!,'admin/roles',signal))});
  const permissions=useQuery({queryKey:['connected','admin-roles',actor,'permissions'],enabled,retry:false,
    queryFn:async({signal})=>permissionsFrom(await configurationRead(actor!,'permissions',signal))});
  return {roles,permissions,gate};
}
/** Ma trận có snapshot riêng theo actor, chỉ đọc khi đã xác nhận quản trị hệ thống. */
export function useRoleMatrix(){
  const session=useSession(),actor=session.data?.user.userId,gate=useConfigurationGate();
  return useQuery({queryKey:['connected','admin-roles',actor,'matrix'],enabled:!!actor&&gate.data?.systemAdmin===true&&!session.switching,retry:false,
    queryFn:async({signal})=>matrixFrom(await configurationRead(actor!,'admin/role-permissions',signal))});
}
