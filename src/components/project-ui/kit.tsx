'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Link from 'next/link';
import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Equal,
  FileQuestion,
  Bookmark,
  Lock,
  Search,
  SquareCheck,
  Split,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Bộ component trình bày dùng chung cho giao diện quản lý dự án (phong cách Jira gọn).
 * Chỉ nhận props, không đọc dữ liệu hay gọi API. Màu: chữ #172b4d, phụ #6b778c, primary #0052cc, viền #dfe1e6.
 */

export const FONT = { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif' };

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c9aff] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';
const buttonVariant = {
  primary: 'bg-[#0052cc] text-white hover:bg-[#0065ff] active:bg-[#0747a6]',
  secondary: 'bg-[#091e420f] text-[#42526e] hover:bg-[#091e4224]',
  subtle: 'bg-transparent text-[#42526e] hover:bg-[#091e420f]',
  danger: 'bg-[#de350b] text-white hover:bg-[#ff5630]',
  link: 'bg-transparent px-0 text-[#0052cc] hover:underline',
};
const buttonSize = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3 text-sm', icon: 'size-8 text-sm' };

export type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariant;
  size?: keyof typeof buttonSize;
};
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'secondary', size = 'sm', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonBase, buttonVariant[variant], buttonSize[size], className)} {...props} />;
});

export function LinkBtn({ href, children, variant = 'secondary', className }: { href: string; children: ReactNode; variant?: keyof typeof buttonVariant; className?: string }) {
  return (
    <Link href={href} className={cn(buttonBase, buttonVariant[variant], buttonSize.sm, className)}>
      {children}
    </Link>
  );
}

export const inputClass =
  'h-9 w-full rounded-[3px] border-2 border-[#dfe1e6] bg-[#fafbfc] px-2 text-sm text-[#172b4d] outline-none transition placeholder:text-[#7a869a] hover:bg-[#ebecf0] focus:border-[#4c9aff] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#f4f5f7] disabled:text-[#a5adba] aria-[invalid=true]:border-[#de350b]';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputClass, 'h-auto py-2 leading-6', className)} {...props} />;
});
export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput({ className, ...props }, ref) {
  return <select ref={ref} className={cn(inputClass, 'pr-7', className)} {...props} />;
});

/** Nhãn + control + lỗi; lỗi gắn aria-describedby để trình đọc màn hình đọc được. */
export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-semibold text-[#6b778c]">
        {label}
        {required && <span className="ml-0.5 text-[#de350b]">*</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-xs text-[#de350b]">
          <AlertTriangle size={12} /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[#6b778c]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeading({ title, description, actions, breadcrumbs }: { title: string; description?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-5">
      {breadcrumbs && (
        <nav aria-label="Đường dẫn" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-[#6b778c]">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} aria-hidden />}
              {b.href ? (
                <Link href={b.href} className="hover:text-[#0052cc] hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span className="max-w-[240px] truncate">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-medium leading-8 text-[#172b4d]">{title}</h1>
          {description && <p className="mt-1 text-sm text-[#6b778c]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const avatarColors = ['bg-[#deebff] text-[#0747a6]', 'bg-[#ffebe6] text-[#bf2600]', 'bg-[#eae6ff] text-[#403294]', 'bg-[#e3fcef] text-[#006644]', 'bg-[#fffae6] text-[#974f0c]'];
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
/** name null: chưa phân công (vòng nét đứt), không gán người giả. */
export function Avatar({ name, src, size = 24, title }: { name: string | null; src?: string | null; size?: number; title?: string }) {
  const label = title ?? name ?? 'Chưa phân công';
  const color = name ? avatarColors[[...name].reduce((t, c) => t + c.charCodeAt(0), 0) % avatarColors.length] : '';
  return (
    <span
      title={label}
      role="img"
      aria-label={label}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        name ? color : 'border border-dashed border-[#a5adba] bg-white text-[#a5adba]',
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : name ? initials(name) : '?'}
    </span>
  );
}

const categoryClass = {
  TO_DO: 'bg-[#dfe1e6] text-[#42526e]',
  IN_PROGRESS: 'bg-[#deebff] text-[#0747a6]',
  DONE: 'bg-[#e3fcef] text-[#006644]',
};
/** Màu theo category và luôn kèm chữ, không chỉ dựa vào màu. */
export function StatusLozenge({ name, category, className }: { name: string; category: keyof typeof categoryClass; className?: string }) {
  return (
    <span title={name} className={cn('inline-block max-w-[160px] truncate rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase leading-4', categoryClass[category], className)}>
      {name}
    </span>
  );
}

export function TypeIcon({ icon, name, color }: { icon: string; name: string; color?: string }) {
  const Icon = icon === 'bug' ? Bug : icon === 'story' ? Bookmark : icon === 'subtask' ? Split : SquareCheck;
  return (
    <span title={name} aria-label={name} role="img" style={{ background: color ?? '#4c9aff' }} className="inline-grid size-4 shrink-0 place-items-center rounded-[3px] text-white">
      <Icon size={11} strokeWidth={2.5} />
    </span>
  );
}

const priorityIcon = {
  HIGHEST: [ChevronsUp, 'text-[#de350b]'],
  HIGH: [ArrowUp, 'text-[#ff5630]'],
  MEDIUM: [Equal, 'text-[#ffab00]'],
  LOW: [ArrowDown, 'text-[#2684ff]'],
  LOWEST: [ChevronsDown, 'text-[#0065ff]'],
} as const;
export function PriorityIcon({ priority, label }: { priority: keyof typeof priorityIcon; label: string }) {
  const [Icon, color] = priorityIcon[priority];
  return (
    <span title={`Ưu tiên: ${label}`} aria-label={`Ưu tiên: ${label}`} role="img" className={cn('inline-flex shrink-0', color)}>
      <Icon size={16} />
    </span>
  );
}

export function PointsBadge({ points }: { points: number | null }) {
  return (
    <span title={points === null ? 'Chưa ước lượng' : `${points} story points`} className="inline-grid min-w-6 shrink-0 place-items-center rounded-full bg-[#dfe1e6] px-1.5 text-[11px] font-semibold leading-5 text-[#42526e]">
      {points ?? '–'}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-[220px]', className)}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-[#6b778c]" aria-hidden />
      <input aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'h-9 pl-8 pr-8')} />
      {value && (
        <button aria-label="Xóa tìm kiếm" onClick={() => onChange('')} className="absolute right-2 top-2.5 text-[#6b778c] hover:text-[#172b4d]">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[3px] border border-dashed border-[#dfe1e6] px-6 py-12 text-center">
      <div className="mb-3 text-[#97a0af]">{icon ?? <FileQuestion size={40} strokeWidth={1.5} />}</div>
      <p className="text-[15px] font-semibold text-[#172b4d]">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-[#6b778c]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Trạng thái trang: tải (skeleton giữ kích thước), lỗi có thử lại, 403, 404, chưa đăng nhập. */
export function StateView({
  kind,
  title,
  description,
  onRetry,
  action,
}: {
  kind: 'loading' | 'error' | 'forbidden' | 'not-found' | 'unauthenticated';
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  if (kind === 'loading')
    return (
      <div aria-busy="true" aria-label="Đang tải" className="space-y-3" role="status">
        <div className="h-8 w-56 animate-pulse rounded-[3px] bg-[#f4f5f7]" />
        <div className="h-9 w-full max-w-xl animate-pulse rounded-[3px] bg-[#f4f5f7]" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-[3px] bg-[#f4f5f7]" />
        ))}
        <span className="sr-only">Đang tải dữ liệu…</span>
      </div>
    );
  const preset = {
    error: ['Không tải được dữ liệu', 'Đã xảy ra lỗi khi tải trang. Thử lại sau giây lát.', <AlertTriangle key="i" size={40} strokeWidth={1.5} className="text-[#de350b]" />],
    forbidden: ['Bạn không có quyền truy cập', 'Vai trò hiện tại không được xem nội dung này. Liên hệ trưởng dự án hoặc quản trị viên.', <Lock key="i" size={40} strokeWidth={1.5} />],
    'not-found': ['Không tìm thấy nội dung', 'Đường dẫn không đúng hoặc dữ liệu đã bị xóa.', <FileQuestion key="i" size={40} strokeWidth={1.5} />],
    unauthenticated: ['Bạn chưa vào phiên demo', 'Đăng nhập bằng một tài khoản mẫu để tiếp tục.', <Lock key="i" size={40} strokeWidth={1.5} />],
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : undefined} className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={preset[2]}
        title={title ?? (preset[0] as string)}
        description={description ?? (preset[1] as string)}
        action={
          action ??
          (onRetry && (
            <Btn variant="primary" onClick={onRetry}>
              Thử lại
            </Btn>
          ))
        }
      />
    </div>
  );
}

/** Dialog Radix: giữ focus trong modal, Esc/overlay đóng (trừ khi đang chặn vì dữ liệu chưa lưu). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#091e42]/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          style={{ ...FONT, maxWidth: width }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[3px] bg-white text-[#172b4d] shadow-[0_8px_16px_-4px_rgba(9,30,66,0.25)] focus:outline-none"
        >
          <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-5">
            <div>
              <DialogPrimitive.Title className="text-[20px] font-medium leading-7">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-[#6b778c]">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close aria-label="Đóng" className="rounded-[3px] p-1 text-[#42526e] hover:bg-[#091e420f]">
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Xác nhận hành động khó hoàn tác; requireText buộc gõ đúng mã (vd. key dự án). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  danger = true,
  requireText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: (typed: string) => boolean | void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked = !!requireText && typed.trim().toUpperCase() !== requireText.toUpperCase();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width={460}
      footer={
        <>
          <Btn variant="subtle" onClick={() => onOpenChange(false)}>
            Hủy
          </Btn>
          <Btn
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked}
            onClick={() => {
              if (onConfirm(typed) !== false) onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="space-y-3 text-sm text-[#42526e]">
        <div>{description}</div>
        {requireText && (
          <Field label={`Nhập "${requireText}" để xác nhận`}>
            {(p) => <TextInput {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  size,
  onPage,
  onSize,
  sizes = [10, 20, 50],
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  size: number;
  onPage: (p: number) => void;
  onSize?: (s: number) => void;
  sizes?: number[];
}) {
  const from = totalItems ? (page - 1) * size + 1 : 0;
  const to = Math.min(page * size, totalItems);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px] text-[#6b778c]">
      <span>
        {from}–{to} / {totalItems} kết quả
      </span>
      <div className="flex items-center gap-2">
        {onSize && (
          <label className="flex items-center gap-1.5">
            Mỗi trang
            <select aria-label="Số dòng mỗi trang" value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-8 rounded-[3px] border border-[#dfe1e6] bg-white px-1.5 text-[13px]">
              {sizes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          <Btn size="icon" variant="subtle" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft />
          </Btn>
          <span aria-live="polite" className="min-w-16 text-center text-[#172b4d]">
            Trang {page}/{totalPages}
          </span>
          <Btn size="icon" variant="subtle" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            <ChevronRight />
          </Btn>
        </nav>
      </div>
    </div>
  );
}

/** Thanh tab dạng nút, dùng phím mũi tên trái/phải để chuyển như tablist. */
export function TabBar<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b-2 border-[#dfe1e6]">
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onChange(tab.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const enabled = tabs.filter((t) => !t.disabled);
            const current = enabled.findIndex((t) => t.value === tabs[index].value);
            const next = enabled[(current + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length];
            onChange(next.value);
            (e.currentTarget.parentElement?.querySelector(`[data-tab="${next.value}"]`) as HTMLElement | null)?.focus();
          }}
          data-tab={tab.value}
          className={cn(
            '-mb-[2px] whitespace-nowrap border-b-2 px-2 pb-2 pt-1 text-sm font-medium disabled:opacity-40',
            value === tab.value ? 'border-[#0052cc] text-[#0052cc]' : 'border-transparent text-[#42526e] hover:border-[#c1c7d0]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export const tableClass = 'w-full border-collapse text-left text-[13px] text-[#172b4d]';
export const thClass = 'whitespace-nowrap border-b-2 border-[#dfe1e6] px-2 py-2 text-xs font-semibold text-[#6b778c]';
export const tdClass = 'border-b border-[#ebecf0] px-2 py-1.5 align-middle';

export function Card({ title, children, action, className }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[3px] border border-[#dfe1e6] bg-white', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-[#ebecf0] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-[#172b4d]">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function InlineAlert({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-[#b3d4ff] bg-[#deebff] text-[#0747a6]',
    warning: 'border-[#ffe380] bg-[#fffae6] text-[#7a4a00]',
    error: 'border-[#ffbdad] bg-[#ffebe6] text-[#bf2600]',
    success: 'border-[#abf5d1] bg-[#e3fcef] text-[#006644]',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-[3px] border px-3 py-2 text-[13px]', styles[tone])}>
      {children}
    </div>
  );
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
