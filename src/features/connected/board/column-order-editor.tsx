'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Btn, InlineAlert } from '@/components/project-ui/kit';
import { validColumnOrderToken } from './contract';
import { orderedColumns, type BoardDto } from './model';
import type { useColumnOrderWrite } from './column-order-write';

const snapshot = (board: BoardDto) => ({ token: board.columnOrderToken, columns: orderedColumns(board.columns) });

export function ColumnOrderEditor({ board, write, blocked, selected, otherBusy }: {
  board: BoardDto;
  write: ReturnType<typeof useColumnOrderWrite>;
  blocked: boolean;
  selected: boolean;
  otherBusy: boolean;
}) {
  const [draft, setDraft] = useState<ReturnType<typeof snapshot> | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = write.busy || otherBusy;
  const changedRemotely = !!draft && draft.token !== board.columnOrderToken;
  const needsReload = changedRemotely || write.conflict;
  const disabled = busy || blocked || !selected || write.uncertain || needsReload;
  const savedColumns = orderedColumns(board.columns);
  const changed = !!draft && draft.columns.some((column, index) => column.columnId !== savedColumns[index]?.columnId);

  /** Chỉ đổi vị trí trong bản nháp; danh sách luôn giữ nguyên ID kể cả khi đọc nền thay đổi. */
  function move(index: number, offset: number) {
    if (disabled) return;
    setDraft((current) => {
      if (!current) return current;
      const target = index + offset;
      if (target < 0 || target >= current.columns.length) return current;
      const columns = [...current.columns];
      [columns[index], columns[target]] = [columns[target], columns[index]];
      return { ...current, columns };
    });
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Thứ tự cột">
      {saved && <InlineAlert tone="success">Đã lưu thứ tự cột.</InlineAlert>}
      {write.error && <InlineAlert tone="error">{write.error}</InlineAlert>}
      {!selected && <InlineAlert tone="warning">Board này không còn được chọn. Đóng cấu hình để chọn lại.</InlineAlert>}
      {!draft ? (
        write.conflict && !write.uncertain ? <Btn disabled={busy || !selected} onClick={() => void write.reload((updated) => setDraft(snapshot(updated)))}>Tải thứ tự mới</Btn>
        : <Btn disabled={disabled || savedColumns.length < 2 || !validColumnOrderToken(board.columnOrderToken)} onClick={() => {
          write.clearError();
          setSaved(false);
          setDraft(snapshot(board));
        }}>Đổi thứ tự cột</Btn>
      ) : <>
        {changedRemotely && !write.conflict && <InlineAlert tone="warning">Thứ tự hoặc tập cột đã thay đổi trên máy chủ.</InlineAlert>}
        <ol aria-label="Thứ tự cột đang sửa" className="space-y-2">
          {draft.columns.map((column, index) => (
            <li key={column.columnId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#dfe1e6] px-3 py-2">
              <span className="min-w-0 break-words">{column.columnName}</span>
              <div className="flex gap-1">
                <Btn size="icon" aria-label={`Sang trái ${column.columnName}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowLeft /></Btn>
                <Btn size="icon" aria-label={`Sang phải ${column.columnName}`} disabled={disabled || index === draft.columns.length - 1} onClick={() => move(index, 1)}><ArrowRight /></Btn>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Btn disabled={busy} onClick={() => { setDraft(null); write.clearError(); }}>Hủy đổi thứ tự</Btn>
          {(needsReload || blocked || !!write.error) && !write.uncertain && (
            <Btn disabled={busy || !selected} onClick={() => void write.reload((updated) => setDraft(snapshot(updated)))}>Tải thứ tự mới</Btn>
          )}
          <Btn variant="primary" disabled={disabled || !changed} onClick={() => void write.submit(draft.columns.map((column) => column.columnId), draft.token, () => {
            setDraft(null);
            setSaved(true);
          })}>{write.busy ? 'Đang xử lý thứ tự…' : 'Lưu thứ tự'}</Btn>
        </div>
      </>}
    </section>
  );
}
