import { Card, EmptyState, InlineAlert, tableClass, tdClass, thClass } from '@/components/project-ui/kit';
import type { Burndown, ReportSprint, Summary, Velocity } from './queries';

const unavailable = 'Chưa có dữ liệu';
const points = (value: number | null) => value === null ? unavailable : value.toLocaleString('vi-VN');
const remainingColor = '#bf2600';
const scopeColor = '#0052cc';

/** LocalDateTime từ BE là giờ lịch. Hiển thị các thành phần gốc, không đổi múi giờ trình duyệt. */
function reportTime(value: string | null) {
  if (!value) return '—';
  const [date, time] = value.split('T');
  return date.split('-').reverse().join('/') + (time ? ' ' + time.split('.')[0] : '');
}

function Stat({ label, value, count }: { label: string; value: number | null; count?: number | null }) {
  return (
    <div className="rounded border border-[#dfe1e6] px-4 py-3">
      <dt className="text-xs text-[#42526e]">{label}</dt>
      <dd className={value === null ? 'mt-1 text-sm' : 'mt-1 text-2xl font-semibold'}>{points(value)}</dd>
      {count != null && <dd className="mt-1 text-xs text-[#42526e]">{count.toLocaleString('vi-VN')} công việc</dd>}
    </div>
  );
}

export function SummaryPanel({ sprint, data }: { sprint: ReportSprint; data: Summary }) {
  const { current } = data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#42526e]">{reportTime(sprint.startDate)} – {reportTime(sprint.endDate)}</p>
      <Card title="Số liệu hiện tại">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tổng điểm" value={current.totalPoints} />
          <Stat label="Điểm còn lại" value={current.remainingPoints} />
          <Stat label="Tổng số việc" value={current.issueCount} />
          <Stat label="Việc chưa xong" value={current.remainingCount} />
        </dl>
        {current.invalidEstimateCount > 0 && (
          <p className="mt-3 text-sm text-[#974f0c]">{current.invalidEstimateCount} công việc có estimate không hợp lệ.</p>
        )}
      </Card>
      <Card title="Số liệu chốt theo sprint">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Stat label="Commitment lúc bắt đầu (điểm)" value={data.baselineAvailable ? data.committedPoints : null} count={data.baselineAvailable ? data.committedCount : null} />
          <Stat label="Hoàn thành khi đóng (điểm)" value={data.completedPoints} count={data.completedCount} />
        </dl>
        {!data.baselineAvailable && <p className="mt-3 text-sm text-[#42526e]">Sprint thiếu snapshot lúc bắt đầu.</p>}
        {data.completedPoints === null && (
          <p className="mt-3 text-sm text-[#42526e]">
            {data.state === 'CLOSED' ? 'Sprint đã đóng nhưng thiếu snapshot hoàn thành.' : 'Số điểm hoàn thành được chốt khi đóng sprint.'}
          </p>
        )}
      </Card>
    </div>
  );
}

/** Dùng cùng thang giờ lịch cho mọi event để khoảng cách theo thời gian giữ đúng tỷ lệ. */
function localTimeCoordinate(value: string) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) + second * 1000;
}

function BurndownChart({ events }: { events: Burndown['points'] }) {
  const times = events.map((event) => localTimeCoordinate(event.recordedAt));
  const first = times[0];
  const last = times[times.length - 1];
  const max = events.reduce((highest, event) => Math.max(highest, event.totalPoints, event.remainingPoints), 0);
  const left = 72;
  const right = 692;
  const top = 24;
  const bottom = 188;
  const x = (index: number) => left + (times[index] - first) / (last - first || 1) * (right - left);
  const y = (value: number) => bottom - value / (max || 1) * (bottom - top);
  const series = [
    { field: 'totalPoints', label: 'Tổng phạm vi', color: scopeColor, dash: '5 4' },
    { field: 'remainingPoints', label: 'Điểm còn lại', color: remainingColor },
  ] as const;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4 text-sm">
        {series.map(({ label, color }) => <span key={label} style={{ color }}>{label}</span>)}
      </div>
      <svg role="img" aria-label="Biểu đồ bậc thang tổng phạm vi và điểm còn lại theo thời điểm" viewBox="0 0 716 232" className="block w-full min-w-[480px]">
        <path d={'M' + left + ' ' + top + 'V' + bottom + 'H' + right} fill="none" stroke="#b3bac5" />
        {max > 0 && <text x={left - 8} y={top + 5} textAnchor="end" fontSize="12" fill="#42526e">{max.toLocaleString('vi-VN')}</text>}
        <text x={left - 8} y={bottom + 5} textAnchor="end" fontSize="12" fill="#42526e">0</text>
        <text x={left} y={bottom + 24} fontSize="12" fill="#42526e">{reportTime(events[0].recordedAt)}</text>
        {last !== first && <text x={right} y={bottom + 24} textAnchor="end" fontSize="12" fill="#42526e">{reportTime(events[events.length - 1].recordedAt)}</text>}
        {series.map((item) => {
          const { field, color } = item;
          const path = events.map((event, index) => index === 0 ? 'M' + x(index) + ' ' + y(event[field]) : 'H' + x(index) + 'V' + y(event[field])).join(' ');
          return (
            <g key={field}>
              <path d={path} stroke={color} strokeDasharray={'dash' in item ? item.dash : undefined} strokeWidth="2" fill="none" />
              {events.map((event, index) => <circle key={index} cx={x(index)} cy={y(event[field])} r="2.5" fill={color} />)}
            </g>
          );
        })}
      </svg>
    </>
  );
}

export function BurndownPanel({ data }: { data: Burndown }) {
  if (data.points.length === 0) return <EmptyState title="Chưa có sự kiện burndown" description="Sprint này chưa có lịch sử điểm để vẽ biểu đồ." />;
  return (
    <div className="space-y-4">
      {!data.baselineAvailable && (
        <InlineAlert tone="warning">Sprint thiếu snapshot lúc bắt đầu. Lịch sử hiển thị từ lần quan sát đầu tiên.</InlineAlert>
      )}
      <Card title="Burndown theo sự kiện">
        <p className="mb-3 text-sm text-[#42526e]">
          Bắt đầu ghi nhận {reportTime(data.observedStart)}
          {data.finishedAt && ' · Đóng sprint ' + reportTime(data.finishedAt)}
        </p>
        <div className="overflow-x-auto"><BurndownChart events={data.points} /></div>
      </Card>
      <Card title="Lịch sử thay đổi">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead><tr>
              <th scope="col" className={thClass}>Thời điểm</th>
              <th scope="col" className={thClass}>Tổng phạm vi (điểm)</th>
              <th scope="col" className={thClass}>Còn lại (điểm)</th>
              <th scope="col" className={thClass}>Việc còn lại / tổng</th>
            </tr></thead>
            <tbody>{data.points.map((event, index) => (
              <tr key={index}>
                <td className={tdClass}><time dateTime={event.recordedAt}>{reportTime(event.recordedAt)}</time></td>
                <td className={tdClass}>{points(event.totalPoints)}</td>
                <td className={tdClass}>{points(event.remainingPoints)}</td>
                <td className={tdClass}>{event.remainingCount} / {event.issueCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function VelocityPanel({ rows }: { rows: Velocity[] }) {
  if (rows.length === 0) return <EmptyState title="Chưa có sprint đã đóng" />;
  const values = rows.map((row) => ({
    ...row,
    commitment: row.baselineAvailable ? row.committedPoints : null,
    completion: row.completionAvailable ? row.completedPoints : null,
  }));
  const max = Math.max(1, ...values.flatMap((row) => [row.commitment ?? 0, row.completion ?? 0]));
  const hasData = values.some((row) => row.commitment !== null || row.completion !== null);
  const series = [
    { field: 'commitment', label: 'Commitment', color: scopeColor },
    { field: 'completion', label: 'Hoàn thành', color: '#216e4e' },
  ] as const;

  return (
    <div className="space-y-4">
      {hasData && (
        <Card title="Velocity theo sprint đã đóng">
          <ul aria-label="Điểm commitment và hoàn thành theo sprint" className="space-y-4">
            {values.map((row) => (
              <li key={row.sprintId} className="space-y-1">
                <p className="break-words text-sm font-semibold">{row.sprintName}</p>
                {series.map(({ field, label, color }) => (
                  <div key={field} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
                    <span className="text-[#42526e]">{label}</span>
                    {row[field] === null ? <span>{unavailable}</span> : (
                      <div className="flex items-center gap-2">
                        <div aria-hidden="true" className="h-2 flex-1 rounded bg-[#ebecf0]">
                          <div className="h-full rounded" style={{ width: (row[field] / max * 100) + '%', backgroundColor: color }} />
                        </div>
                        <span>{points(row[field])} điểm</span>
                      </div>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Snapshot sprint đã đóng">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead><tr>
              <th scope="col" className={thClass}>Sprint</th>
              <th scope="col" className={thClass}>Đóng lúc</th>
              <th scope="col" className={thClass}>Commitment (điểm)</th>
              <th scope="col" className={thClass}>Hoàn thành (điểm)</th>
            </tr></thead>
            <tbody>{values.map((row) => (
              <tr key={row.sprintId}>
                <th scope="row" className={tdClass}>{row.sprintName}</th>
                <td className={tdClass}>{reportTime(row.finishedAt)}</td>
                <td className={tdClass}>{points(row.commitment)}</td>
                <td className={tdClass}>{points(row.completion)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
