'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Btn, EmptyState, Field, PageHeading, SelectInput, StatusLozenge, TextInput, tdClass } from '@/components/project-ui/kit';
import { useSession } from '../session';
import { categories, type Category } from './contract';
import { categoryLabel, ConfigTable, EditDialog, QueryData, RemoveDialog } from './components';
import { useConfiguration, useConfigurationWrite, type IssueType, type Status, type WorkflowRule } from './queries';

const sections = {
  types: { href: '/app/admin/issue-types', label: 'Loại công việc' },
  statuses: { href: '/app/admin/statuses', label: 'Trạng thái' },
  workflow: { href: '/app/admin/workflows', label: 'Workflow' },
};
type Section = keyof typeof sections;

export function ConfigurationAdmin({ section }: { section: Section }) {
  const session = useSession();
  if (!session.data || session.switching) return null;
  if (!session.data.systemAdmin) return <EmptyState title="Bạn không có quyền quản trị hệ thống" />;
  const actor = session.data.user.userId;
  return (
    <section className="max-w-5xl space-y-4">
      <nav aria-label="Cấu hình hệ thống" className="flex flex-wrap gap-2 border-b border-[#dfe1e6] pb-2 text-sm">
        {Object.entries(sections).map(([key, item]) => (
          <Link key={key} href={item.href} aria-current={key === section ? 'page' : undefined}
            className={'rounded px-3 py-2 ' + (key === section ? 'bg-[#e9f2ff] text-[#0052cc]' : 'hover:bg-[#ebecf0]')}>{item.label}</Link>
        ))}
      </nav>
      {section === 'workflow' ? <WorkflowScreen key={actor} actor={actor} /> : <CatalogScreen key={actor + ':' + section} actor={actor} section={section} />}
    </section>
  );
}

type CatalogItem = { id: number; name: string; category?: Category };

function CatalogScreen({ actor, section }: { actor: number; section: 'types' | 'statuses' }) {
  const statuses = section === 'statuses';
  const endpoint = statuses ? 'issue-statuses' : 'issue-types';
  const subject = statuses ? 'trạng thái' : 'loại công việc';
  const query = useConfiguration<(IssueType | Status)[]>(actor, endpoint);
  const write = useConfigurationWrite(actor);
  const [editor, setEditor] = useState<{ target?: CatalogItem; name: string; category: Category } | null>(null);
  const [removing, setRemoving] = useState<CatalogItem | null>(null);
  const [validation, setValidation] = useState<string>();

  function close() {
    setEditor(null);
    setRemoving(null);
    setValidation(undefined);
    write.clearError();
  }

  function edit(target?: CatalogItem) {
    close();
    setEditor({ target, name: target?.name ?? '', category: target?.category ?? 'TO_DO' });
  }

  return (
    <div className="space-y-4">
      <PageHeading title={sections[section].label} actions={
        <Btn variant="primary" disabled={!query.isSuccess || write.busy} onClick={() => edit()}><Plus /> Thêm {subject}</Btn>
      } />
      <QueryData query={query}>{(rows) => {
        const items: CatalogItem[] = rows.map((row) => 'statusId' in row
          ? { id: row.statusId, name: row.statusName, category: row.statusCategory }
          : { id: row.issueTypeId, name: row.typeName });
        if (items.length === 0) return <EmptyState title={'Chưa có ' + subject} />;
        return <ConfigTable label={sections[section].label} headings={statuses ? ['Tên', 'Nhóm', 'Thao tác'] : ['Tên', 'Thao tác']}>
          {items.map((item) => <tr key={item.id}>
            <td className={tdClass}>{item.category ? <StatusLozenge name={item.name} category={item.category} /> : item.name}</td>
            {statuses && <td className={tdClass}>{item.category && categoryLabel[item.category]}</td>}
            <td className={tdClass}><div className="flex gap-1">
              <Btn variant="subtle" disabled={write.busy} aria-label={'Sửa ' + item.name} onClick={() => edit(item)}>Sửa</Btn>
              <Btn variant="subtle" disabled={write.busy} aria-label={'Xóa ' + item.name} onClick={() => { close(); setRemoving(item); }}>Xóa</Btn>
            </div></td>
          </tr>)}
        </ConfigTable>;
      }}</QueryData>
      {editor && (
        <EditDialog title={(editor.target ? 'Sửa ' : 'Thêm ') + subject} form="catalog-form" confirm="Lưu" busy={write.busy} error={write.error} close={close}>
          <form id="catalog-form" className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            const name = editor.name.trim();
            if (!name || name.length > 50) { setValidation('Tên cần từ 1 đến 50 ký tự.'); return; }
            void write.submit({
              path: editor.target ? endpoint + '/' + editor.target.id : endpoint,
              method: editor.target ? 'PUT' : 'POST',
              body: statuses ? { statusName: name, statusCategory: editor.category } : { typeName: name },
            }, close);
          }}>
            <Field label="Tên" required error={validation}>{(props) => (
              <TextInput {...props} autoFocus required maxLength={50} disabled={write.busy} value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            )}</Field>
            {statuses && <Field label="Nhóm trạng thái">{(props) => (
              <SelectInput {...props} value={editor.category} disabled={write.busy}
                onChange={(event) => setEditor({ ...editor, category: event.target.value as Category })}>
                {categories.map((category) => <option key={category} value={category}>{categoryLabel[category]}</option>)}
              </SelectInput>
            )}</Field>}
          </form>
        </EditDialog>
      )}
      {removing && <RemoveDialog title={'Xóa ' + removing.name + '?'}
        description={statuses ? 'Chỉ xóa được trạng thái không còn được tham chiếu.' : 'Chỉ xóa được loại chưa gán cho dự án và chưa có công việc sử dụng.'}
        busy={write.busy} error={write.error} close={close}
        remove={() => void write.submit({ path: endpoint + '/' + removing.id, method: 'DELETE' }, close)} />}
    </div>
  );
}

function WorkflowScreen({ actor }: { actor: number }) {
  const rules = useConfiguration<WorkflowRule[]>(actor, 'workflows/rules');
  const statuses = useConfiguration<Status[]>(actor, 'issue-statuses');
  const write = useConfigurationWrite(actor);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<WorkflowRule | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [validation, setValidation] = useState<string>();

  function close() {
    setAdding(false); setRemoving(null); setFrom(''); setTo(''); setValidation(undefined);
    write.clearError();
  }

  return (
    <div className="space-y-4">
      <PageHeading title="Workflow" description="Quy tắc chuyển trạng thái dùng chung cho các dự án."
        actions={<Btn variant="primary" disabled={!rules.isSuccess || !statuses.data || statuses.data.length < 2 || write.busy} onClick={() => { close(); setAdding(true); }}>
          <Plus /> Thêm quy tắc
        </Btn>} />
      {statuses.isError && <QueryData query={statuses}>{() => null}</QueryData>}
      <QueryData query={rules}>{(rows) => rows.length === 0 ? <EmptyState title="Chưa có quy tắc chuyển trạng thái" /> :
        <ConfigTable label="Quy tắc chuyển trạng thái" headings={['Nguồn', 'Đích', 'Thao tác']}>
          {rows.map((rule) => <tr key={rule.ruleId}>
            <td className={tdClass}><StatusLozenge name={rule.fromStatus.statusName} category={rule.fromStatus.statusCategory} /></td>
            <td className={tdClass}><StatusLozenge name={rule.toStatus.statusName} category={rule.toStatus.statusCategory} /></td>
            <td className={tdClass}><Btn variant="subtle" disabled={write.busy}
              aria-label={'Xóa quy tắc ' + rule.fromStatus.statusName + ' đến ' + rule.toStatus.statusName}
              onClick={() => { close(); setRemoving(rule); }}>Xóa</Btn></td>
          </tr>)}
        </ConfigTable>
      }</QueryData>
      {adding && <EditDialog title="Thêm quy tắc chuyển trạng thái" form="workflow-form" confirm="Thêm" busy={write.busy} error={write.error} close={close}>
        <form id="workflow-form" className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (!from || !to || from === to) { setValidation('Chọn hai trạng thái nguồn và đích khác nhau.'); return; }
          void write.submit({ path: 'workflows/rules', method: 'POST', body: { fromStatusId: Number(from), toStatusId: Number(to) } }, close);
        }}>
          <Field label="Trạng thái nguồn" required>{(props) => (
            <SelectInput {...props} required value={from} disabled={write.busy} onChange={(event) => setFrom(event.target.value)}>
              <option value="">Chọn nguồn</option>
              {statuses.data?.map((item) => <option key={item.statusId} value={item.statusId}>{item.statusName}</option>)}
            </SelectInput>
          )}</Field>
          <Field label="Trạng thái đích" required error={validation}>{(props) => (
            <SelectInput {...props} required value={to} disabled={write.busy} onChange={(event) => setTo(event.target.value)}>
              <option value="">Chọn đích</option>
              {statuses.data?.map((item) => <option key={item.statusId} value={item.statusId}>{item.statusName}</option>)}
            </SelectInput>
          )}</Field>
        </form>
      </EditDialog>}
      {removing && <RemoveDialog title="Xóa quy tắc chuyển trạng thái?"
        description={removing.fromStatus.statusName + ' → ' + removing.toStatus.statusName}
        busy={write.busy} error={write.error} close={close}
        remove={() => void write.submit({ path: 'workflows/rules/' + removing.ruleId, method: 'DELETE' }, close)} />}
    </div>
  );
}
