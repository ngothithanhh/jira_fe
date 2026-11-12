'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Btn, EmptyState, Field, InlineAlert, PageHeading, SelectInput, tdClass } from '@/components/project-ui/kit';
import { useConnectedProject } from '../projects/queries';
import { useSession } from '../session';
import { ConfigTable, EditDialog, QueryData, RemoveDialog } from './components';
import { useConfiguration, useConfigurationWrite, type IssueType, type ProjectType } from './queries';

export function ConnectedProjectTypes({ projectId }: { projectId: number }) {
  const session = useSession();
  const project = useConnectedProject(projectId);
  if (session.switching || !session.data || !project.data) return null;
  const { context } = project.data;
  const canEdit = !project.isError && (context.systemAdmin || context.projectPermissions.some((permission) =>
    permission === 'MANAGE_BOARD' || permission === 'UPDATE_PROJECT'));
  return <ProjectTypes key={session.data.user.userId + ':' + projectId} actor={session.data.user.userId}
    projectId={projectId} projectName={project.data.project.projectName} canEdit={canEdit} />;
}

function ProjectTypes({ actor, projectId, projectName, canEdit }: { actor: number; projectId: number; projectName: string; canEdit: boolean }) {
  const path = 'projects/' + projectId + '/issue-types';
  const query = useConfiguration<ProjectType[]>(actor, path, projectId);
  const write = useConfigurationWrite(actor, projectId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectType | null>(null);
  const close = () => { setAdding(false); setRemoving(null); write.clearError(); };

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeading title="Loại công việc" description={projectName}
        breadcrumbs={[{ label: 'Cài đặt dự án', href: '/app/projects/' + projectId + '/settings' }, { label: 'Loại công việc' }]}
        actions={canEdit && <Btn variant="primary" disabled={!query.isSuccess || write.busy} onClick={() => { close(); setAdding(true); }}>
          <Plus /> Gán loại công việc
        </Btn>} />
      {!canEdit && <InlineAlert tone="info">Bạn chỉ có quyền xem cấu hình loại công việc.</InlineAlert>}
      <QueryData query={query}>{(rows) => rows.length === 0 ? <EmptyState title="Chưa gán loại công việc cho dự án" /> :
        <ConfigTable label="Loại công việc của dự án" headings={canEdit ? ['Tên', 'Mặc định', 'Thao tác'] : ['Tên', 'Mặc định']}>
          {rows.map((row) => <tr key={row.issueTypeId}>
            <td className={tdClass}>{row.issueTypeName}</td>
            <td className={tdClass}>{canEdit ? (
              <input type="radio" name="project-default-type" aria-label={'Đặt ' + row.issueTypeName + ' làm mặc định'}
                checked={row.isDefault} disabled={write.busy}
                onChange={() => void write.submit({ path: path + '/' + row.issueTypeId + '/default', method: 'PUT' }, () => {})} />
            ) : row.isDefault ? 'Mặc định' : '—'}</td>
            {canEdit && <td className={tdClass}>
              <Btn variant="subtle" disabled={row.isDefault || write.busy} aria-label={'Gỡ ' + row.issueTypeName}
                title={row.isDefault ? 'Chọn loại mặc định khác trước khi gỡ' : undefined}
                onClick={() => { close(); setRemoving(row); }}>Gỡ</Btn>
            </td>}
          </tr>)}
        </ConfigTable>
      }</QueryData>
      {write.error && !adding && !removing && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {adding && canEdit && <AssignType actor={actor} assigned={query.data ?? []} busy={write.busy} error={write.error} close={close}
        assign={(id, makeDefault) => void write.submit({ path: path + '/' + id + '?isDefault=' + makeDefault, method: 'POST' }, close)} />}
      {removing && canEdit && <RemoveDialog title={'Gỡ ' + removing.issueTypeName + ' khỏi dự án?'}
        description="Chỉ gỡ được loại không phải mặc định và không còn công việc trong dự án sử dụng."
        confirm="Gỡ" busy={write.busy} error={write.error} close={close}
        remove={() => void write.submit({ path: path + '/' + removing.issueTypeId, method: 'DELETE' }, close)} />}
    </div>
  );
}

function AssignType({ actor, assigned, busy, error, close, assign }: {
  actor: number; assigned: ProjectType[]; busy: boolean; error: string | null; close: () => void;
  assign: (id: number, makeDefault: boolean) => void;
}) {
  const catalog = useConfiguration<IssueType[]>(actor, 'issue-types');
  const [selected, setSelected] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  return (
    <EditDialog title="Gán loại công việc" form="assign-type" confirm="Gán" busy={busy} error={error} close={close}>
      <QueryData query={catalog}>{(items) => {
        const available = items.filter((type) => !assigned.some((row) => row.issueTypeId === type.issueTypeId));
        if (available.length === 0) return <p className="text-sm">Không còn loại công việc có thể gán.</p>;
        return (
          <form id="assign-type" className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const id = Number(selected);
            if (available.some((type) => type.issueTypeId === id)) assign(id, makeDefault);
          }}>
            <Field label="Loại công việc" required>{(props) => (
              <SelectInput {...props} required value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
                <option value="">Chọn loại</option>
                {available.map((type) => <option key={type.issueTypeId} value={type.issueTypeId}>{type.typeName}</option>)}
              </SelectInput>
            )}</Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={makeDefault} disabled={busy} onChange={(event) => setMakeDefault(event.target.checked)} />
              Đặt làm mặc định
            </label>
          </form>
        );
      }}</QueryData>
    </EditDialog>
  );
}
