'use client';

import { useState } from 'react';
import type { BurndownEvent } from '../types';

/*
 * Biểu đồ SVG tự vẽ, không thêm thư viện. Mỗi điểm dữ liệu focus được bằng Tab để hiện tooltip;
 * bảng số liệu thay thế nằm ở màn Báo cáo. Không nội suy hay điền 0 cho khoảng chưa có dữ liệu.
 */

const W = 760;
const H = 300;
const PAD = { l: 44, r: 16, t: 16, b: 36 };
const day = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');
// Định dạng ngày cố định dd/MM để trục không đổi theo locale ICU của trình duyệt.
const fmt = (t: number) => {
  const d = new Date(t);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
};
const fmtFull = (t: number) => {
  const d = new Date(t);
  return `${fmt(t)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
/** Bước vạch trục Y tròn (1, 2, 5, 10…) để có khoảng 4–6 vạch số nguyên. */
const niceStep = (v: number) => [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => v / s <= 6) ?? 1000;
const niceMax = (v: number) => Math.max(5, Math.ceil(v / niceStep(v)) * niceStep(v));
const yTicks = (max: number) => Array.from({ length: Math.round(max / niceStep(max)) + 1 }, (_, i) => i * niceStep(max));

function Tooltip({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const width = 170;
  const left = Math.min(Math.max(x - width / 2, PAD.l), W - PAD.r - width);
  const height = lines.length * 16 + 10;
  // Điểm sát mép trên thì đặt tooltip bên dưới để không che đường dữ liệu.
  const top = y - 12 - height < PAD.t ? y + 12 : y - 12 - height;
  return (
    <g pointerEvents="none">
      <rect x={left} y={top} width={width} height={height} rx={3} fill="#172b4d" opacity={0.95} />
      {lines.map((l, i) => (
        <text key={i} x={left + 8} y={top + 18 + i * 16} fill="#fff" fontSize={11}>
          {l}
        </text>
      ))}
    </g>
  );
}

/** Step chart: đường đỏ là điểm còn lại, đường xám đứt là tổng phạm vi; đường tham chiếu xám nhạt từ commitment về 0. */
export function BurndownChart({ events, start, end, committed }: { events: BurndownEvent[]; start: string | null; end: string | null; committed: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  const points = events.map((e) => ({ ...e, t: new Date(e.recordedAt).getTime() }));
  const t0 = Math.min(start ? new Date(`${start}T00:00:00`).getTime() : Infinity, points[0]?.t ?? Infinity);
  const t1 = Math.max(end ? new Date(`${end}T23:59:59`).getTime() : -Infinity, points.at(-1)?.t ?? -Infinity);
  const yMax = niceMax(Math.max(committed ?? 0, ...points.map((p) => p.totalPoints)));
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const step = (key: 'remainingPoints' | 'totalPoints') =>
    points.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p[key])}` : `H${x(p.t)}V${y(p[key])}`)).join('');
  const days = Math.ceil((t1 - t0) / day);
  const every = Math.max(1, Math.ceil(days / 8));
  const ticks = Array.from({ length: Math.floor(days / every) + 1 }, (_, i) => t0 + i * every * day);
  const a = active !== null ? points[active] : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[900px]" role="group" aria-label="Biểu đồ burndown">
      {yTicks(yMax).map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ebecf0" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b778c">
            {v}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="#6b778c">
          {fmt(t)}
        </text>
      ))}
      <text x={12} y={PAD.t + 4} fontSize={11} fill="#6b778c" transform={`rotate(-90 12 ${PAD.t + 4})`} textAnchor="end">
        Story points
      </text>
      {committed !== null && start && end && <line x1={x(t0)} y1={y(committed)} x2={x(t1)} y2={y(0)} stroke="#c1c7d0" strokeWidth={1.5} />}
      <path d={step('totalPoints')} fill="none" stroke="#97a0af" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d={step('remainingPoints')} fill="none" stroke="#de350b" strokeWidth={2} />
      {points.map((p, i) => (
        <circle
          key={p.id}
          cx={x(p.t)}
          cy={y(p.remainingPoints)}
          r={active === i ? 6 : 4}
          fill="#fff"
          stroke="#de350b"
          strokeWidth={2}
          tabIndex={0}
          role="img"
          aria-label={`${fmtFull(p.t)}: còn ${p.remainingPoints}/${p.totalPoints} điểm, ${p.remainingCount}/${p.issueCount} việc`}
          onMouseEnter={() => setActive(i)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          className="cursor-pointer outline-none focus:stroke-[#0052cc]"
        />
      ))}
      {a && <Tooltip x={x(a.t)} y={y(a.remainingPoints)} lines={[fmtFull(a.t), `Còn lại: ${a.remainingPoints} điểm`, `Tổng phạm vi: ${a.totalPoints} điểm`]} />}
    </svg>
  );
}

export type VelocityRow = { id: number; name: string; committed: number | null; completed: number | null; available: boolean };

/** Cặp cột commitment (xám) / hoàn thành (xanh) cho mỗi sprint đã đóng; sprint thiếu lịch sử ghi chú, không vẽ 0. */
export function VelocityChart({ rows }: { rows: VelocityRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const yMax = niceMax(Math.max(0, ...rows.flatMap((r) => [r.committed ?? 0, r.completed ?? 0])));
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / Math.max(1, rows.length);
  const bar = Math.min(28, slot / 3);
  const tip = rows.flatMap((r, i) => {
    const values = [
      ['committed', 'Commitment', r.committed],
      ['completed', 'Hoàn thành', r.completed],
    ] as const;
    return values.map(([k, label, v], j) => ({ key: `${r.id}-${k}`, x: PAD.l + slot * i + slot / 2 + (j === 0 ? -bar / 2 - 2 : bar / 2 + 2), v, label, name: r.name }));
  });
  const a = tip.find((t) => t.key === active);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[900px]" role="group" aria-label="Biểu đồ velocity">
      {yTicks(yMax).map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ebecf0" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b778c">
            {v}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        return (
          <g key={r.id}>
            <text x={cx} y={H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="#42526e">
              {r.name}
            </text>
            {!r.available && (
              <text x={cx} y={y(0) - 8} textAnchor="middle" fontSize={10} fill="#6b778c">
                Không có số liệu
              </text>
            )}
          </g>
        );
      })}
      {tip.map(
        (t) =>
          t.v !== null && (
            <rect
              key={t.key}
              x={t.x - bar / 2}
              y={y(t.v)}
              width={bar}
              height={Math.max(1, y(0) - y(t.v))}
              fill={t.label === 'Commitment' ? '#c1c7d0' : '#36b37e'}
              tabIndex={0}
              role="img"
              aria-label={`${t.name}: ${t.label} ${t.v} điểm`}
              onMouseEnter={() => setActive(t.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(t.key)}
              onBlur={() => setActive(null)}
              className="cursor-pointer outline-none focus:stroke-[#0052cc] focus:stroke-2"
            />
          ),
      )}
      {a && a.v !== null && <Tooltip x={a.x} y={y(a.v)} lines={[a.name, `${a.label}: ${a.v} điểm`]} />}
    </svg>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-[#42526e]" aria-label="Chú giải">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 5px, transparent 5px 9px)` : i.color, height: 3 }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
