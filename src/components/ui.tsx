import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BudgetStatus } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';

export const Icon = {
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  bigCheck: (
    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
    </svg>
  ),
};

export function Thumb({ name }: { name: string }) {
  return (
    <div className="thumb" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function QtyStepper({ value, onChange, label, min = 0 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  return (
    <div className="stepper" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(20, value + 1))} disabled={value >= 20}>
        +
      </button>
    </div>
  );
}

export function BudgetBar({ status, onSuggestion, busy }: { status: BudgetStatus; onSuggestion?: (s: BudgetStatus['suggestions'][number]) => void; busy?: boolean }) {
  const pct = Math.min(100, (status.total / status.limit) * 100);
  return (
    <div className={`budget ${status.over ? 'budget--over' : ''}`} data-testid="budget-bar">
      <div className="budget__label">
        <span>
          {status.basis === 'bill' ? 'To pay' : 'Estimated'} {formatRupees(status.total)} of {formatRupees(status.limit)} budget
        </span>
        <span>{status.over ? `Over by ${formatRupees(-status.remaining)}` : `${formatRupees(status.remaining)} left`}</span>
      </div>
      <div className="budget__track" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={status.limit} aria-valuenow={Math.round(status.total)}>
        <div className="budget__fill" style={{ width: `${pct}%` }} />
      </div>
      {status.over && status.suggestions.length > 0 && (
        <div className="banner banner--info">
          <p className="small">
            <strong>To get under budget:</strong>
          </p>
          {status.suggestions.map((s) => (
            <div key={s.kind === 'cheaper' ? `c-${s.fromSpinId}` : `r-${s.spinId}`} className="inline-form" style={{ justifyContent: 'space-between' }}>
              <span className="small">
                {s.kind === 'cheaper' ? `Switch ${s.name} ${s.fromLabel} → ${s.toLabel}` : `Remove ${s.name}`} (save {formatRupees(s.saving)})
              </span>
              {onSuggestion && (
                <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onSuggestion(s)}>
                  {s.kind === 'cheaper' ? 'Switch' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BudgetEditor({ value, onSave, label = 'Set budget' }: { value: number | null; onSave: (v: number | null) => void | Promise<void>; label?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? String(value) : '');
  const id = useId();
  if (!open) {
    return (
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        {value ? `Budget ${formatRupees(value)} · Change` : label}
      </button>
    );
  }
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(text);
        await onSave(text.trim() === '' || !(n > 0) ? null : Math.round(n));
        setOpen(false);
      }}
    >
      <label htmlFor={id} className="small">
        Budget (₹)
      </label>
      <input id={id} inputMode="numeric" pattern="[0-9]*" value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))} autoFocus placeholder="e.g. 500" />
      <button type="submit" className="btn btn--sm btn--primary">
        Save
      </button>
      <button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {children}
        <button type="button" className="btn btn--block" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner--error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <div>
          <button type="button" className="btn btn--sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
