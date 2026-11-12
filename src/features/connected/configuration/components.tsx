'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Btn, InlineAlert, Modal, tableClass, thClass } from '@/components/project-ui/kit';
import type { Category } from './contract';

export const categoryLabel: Record<Category, string> = {
  TO_DO: 'Cần làm',
  IN_PROGRESS: 'Đang thực hiện',
  DONE: 'Hoàn thành',
};

export function QueryData<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <p role="status">Đang tải dữ liệu…</p>;
  if (query.isError) return <InlineAlert tone="error">{query.error.message} <Btn onClick={() => void query.refetch()}>Tải lại</Btn></InlineAlert>;
  return children(query.data);
}

export function ConfigTable({ label, headings, children }: { label: string; headings: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-[#dfe1e6]">
      <table className={tableClass} aria-label={label}>
        <thead><tr>{headings.map((heading) => <th key={heading} scope="col" className={thClass}>{heading}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EditDialog({ title, form, confirm, busy, error, close, children }: {
  title: string; form: string; confirm: string; busy: boolean; error: string | null; close: () => void; children: ReactNode;
}) {
  return (
    <Modal open title={title} onOpenChange={(open) => { if (!open && !busy) close(); }} footer={<>
      <Btn variant="subtle" disabled={busy} onClick={close}>Hủy</Btn>
      <Btn type="submit" form={form} variant="primary" disabled={busy}>{busy ? 'Đang lưu…' : confirm}</Btn>
    </>}>
      {children}
      {error && <div className="mt-3"><InlineAlert tone="error">{error}</InlineAlert></div>}
    </Modal>
  );
}

export function RemoveDialog({ title, description, confirm = 'Xóa', busy, error, close, remove }: {
  title: string; description: string; confirm?: string; busy: boolean; error: string | null; close: () => void; remove: () => void;
}) {
  return (
    <Modal open title={title} onOpenChange={(open) => { if (!open && !busy) close(); }} footer={<>
      <Btn variant="subtle" disabled={busy} onClick={close}>Hủy</Btn>
      <Btn variant="danger" disabled={busy} onClick={remove}>{busy ? 'Đang xử lý…' : confirm}</Btn>
    </>}>
      <p className="text-sm">{description}</p>
      {error && <div className="mt-3"><InlineAlert tone="error">{error}</InlineAlert></div>}
    </Modal>
  );
}
