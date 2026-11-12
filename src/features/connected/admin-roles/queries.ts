'use client';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '../session';
import {configurationRead,useConfigurationGate} from '../configuration/queries';
import {rolesFrom,permissionsFrom} from './contract';
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
