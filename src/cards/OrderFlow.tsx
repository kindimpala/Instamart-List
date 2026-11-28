import { useEffect, useRef, useState } from 'react';
import type { OrderPreview } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';
import { api, ApiError } from '../api';
import { PoweredByInstamart } from '../brand/PoweredByInstamart';
import { BudgetBar, ErrorBanner, Icon } from '../components/ui';
import { useApp, type OrderStart } from '../context';

const STEPS = ['Checking availability', 'Adding to cart', 'Fetching bill'];

/** Animated checklist shown while the server runs the order pipeline. */
export function OrderProgress({ done }: { done: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (done) {
      setStep(STEPS.length);
      return;
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, [done]);
  return (
    <div className="card" aria-live="polite" data-testid="order-progress">
      <ol className="checklist">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step && !done ? 'active' : step >= STEPS.length ? 'done' : 'todo';
          return (
            <li key={label}>
              <span className={`check-dot ${state === 'done' ? 'check-dot--done' : state === 'active' ? 'check-dot--active' : ''}`} aria-hidden="true">
                {state === 'done' && Icon.check}
              </span>
              <span>
                {label}
                <span className="sr-only">{state === 'done' ? ' done' : state === 'active' ? ' in progress' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Starts an order (from a list or draft) and shows progress then the preview. */
export function OrderFlow({ start }: { start: OrderStart }) {
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    setError(null);
    api
      .prepare({ listId: start.listId, draftId: start.draftId, budget: start.budget })
      .then((r) => setPreview(r.preview))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not prepare the order.'));
  }, [attempt, start]);

  if (error) return <div className="card"><ErrorBanner message={error} onRetry={() => setAttempt((a) => a + 1)} /></div>;
  if (!preview) return <OrderProgress done={false} />;
  return <OrderPreviewCard initial={preview} />;
}

export function OrderPreviewCard({ initial }: { initial: OrderPreview }) {
  const app = useApp();
  const [p, setP] = useState(initial);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [state, setState] = useState<'open' | 'cancelled' | 'placed'>('open');

  const pendingSubs = p.substitutions.filter((s) => !accepted.has(s.substitute.spinId));
  const priceBySpin = new Map(p.priceChanges.map((c) => [c.spinId, c]));

  const adjust = async (action: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.adjust(p.previewId, action);
      setP(r.preview);
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : 'Could not update the cart.', code: e instanceof ApiError ? e.code : undefined });
      if (e instanceof ApiError && e.code === 'empty_cart') setState('cancelled');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.confirm(p.confirmToken, [...accepted]);
      setState('placed');
      app.orderPlaced(order);
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : 'Could not place the order.', code: e instanceof ApiError ? e.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancel(p.previewId);
      setState('cancelled');
      app.announce('Order cancelled. Cart cleared.');
    } catch (e) {
      setError({ message: e instanceof ApiError ? e.message : 'Could not cancel.' });
    } finally {
      setBusy(false);
    }
  };

  if (state === 'cancelled') return <div className="card" role="status">Order cancelled. I’ve cleared your Instamart cart.</div>;
  if (state === 'placed') return <div className="card" role="status">Order placed. See the confirmation.</div>;

  const surge = p.bill.surgeFee;
  return (
    <section className="card" aria-label="Order summary" data-testid="order-summary">
      <div className="card__head">
        <h3>Order summary</h3>
        <span className="small muted">{p.source.name}</span>
      </div>

      {p.substitutions.map((s) => {
        const ok = accepted.has(s.substitute.spinId);
        return (
          <div className="banner banner--amber" key={s.originalSpinId} data-testid="substitution-banner">
            <p>
              <strong>{s.originalName} ({s.originalSize})</strong> is out of stock. Swapped for <strong>{s.substitute.name} ({s.substitute.size})</strong> at {formatRupees(s.substitute.price)}.
            </p>
            {ok ? (
              <p className="small">Accepted</p>
            ) : (
              <div className="btn-row">
                <button type="button" className="btn btn--sm btn--primary" onClick={() => setAccepted((a) => new Set(a).add(s.substitute.spinId))} disabled={busy}>
                  Accept
                </button>
                <button type="button" className="btn btn--sm" onClick={() => adjust({ type: 'remove', spinId: s.substitute.spinId })} disabled={busy}>
                  Remove item
                </button>
              </div>
            )}
          </div>
        );
      })}

      {p.unavailable.length > 0 && (
        <div className="banner banner--info">
          <p className="small">
            Not included: {p.unavailable.map((u) => `${u.name} ${u.size} (${u.reason.toLowerCase()})`).join(', ')}.
          </p>
        </div>
      )}
      {p.warnings.map((w) => (
        <div className="banner banner--info" key={w}>
          <p className="small">{w}</p>
        </div>
      ))}

      <div>
        {p.items.map((i) => {
          const pc = priceBySpin.get(i.spinId);
          return (
            <div className="item-row" key={i.spinId} style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="item-row__main">
                <div className="item-row__name">
                  {i.quantity} × {i.name}
                </div>
                <div className="item-row__meta">
                  <span>{i.size}</span>
                  {pc && (
                    <span className="tag tag--price" data-testid="price-tag">
                      Price updated {formatRupees(pc.oldPrice)} to {formatRupees(pc.newPrice)}
                    </span>
                  )}
                </div>
              </div>
              <strong>{formatRupees(i.lineTotal)}</strong>
            </div>
          );
        })}
      </div>

      <dl className="kv">
        <dt>Deliver to</dt>
        <dd>
          {p.address.line.startsWith(p.address.label) ? p.address.line : `${p.address.label}, ${p.address.line}`}
        </dd>
        <dt>Payment</dt>
        <dd>{p.payment === 'Cash' ? 'Cash on delivery' : p.payment ?? 'Default method on your Swiggy account'}</dd>
      </dl>

      <div className="bill" data-testid="bill">
        {p.bill.lines.map((l) => (
          <div
            key={l.label}
            className={`bill__line ${l.kind === 'surge' ? 'bill__line--surge' : ''} ${l.kind === 'delivery' && p.bill.deliveryFree ? 'bill__line--free' : ''}`}
            data-testid={l.kind === 'surge' ? 'surge-line' : undefined}
          >
            <span>{l.label}</span>
            <span>{l.value}</span>
          </div>
        ))}
        <div className="bill__line bill__total">
          <span>To pay</span>
          <span data-testid="to-pay">{p.bill.toPayLabel}</span>
        </div>
      </div>

      {p.budget && <BudgetBar status={p.budget} busy={busy} onSuggestion={(s) => adjust(s.kind === 'remove' ? { type: 'remove', spinId: s.spinId } : { type: 'replace', fromSpinId: s.fromSpinId, toSpinId: s.toSpinId })} />}

      {error && (
        <ErrorBanner
          message={error.message}
          onRetry={
            error.code && ['cart_changed', 'confirm_superseded', 'confirm_expired', 'preview_gone'].includes(error.code) && p.source
              ? () => app.startOrder(p.source.kind === 'list' ? { listId: p.source.id, label: p.source.name } : { draftId: p.source.id, label: p.source.name })
              : undefined
          }
        />
      )}

      {pendingSubs.length > 0 && <p className="small muted" style={{ margin: 0 }}>Accept or remove the swapped item to continue.</p>}

      {surge ? (
        <div className="banner banner--amber" role="note" data-testid="surge-banner">
          <p>
            <strong>A surge fee of {formatRupees(surge)} is applied right now</strong>
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={confirm} disabled={busy || pendingSubs.length > 0}>
              {busy ? 'Placing order…' : 'Order anyway'}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={confirm} disabled={busy || pendingSubs.length > 0}>
            {busy ? 'Placing order…' : 'Confirm order'}
          </button>
          <button type="button" className="btn" onClick={cancel} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      <div className="pbi-row">
        <PoweredByInstamart variant="compact" />
      </div>
    </section>
  );
}
