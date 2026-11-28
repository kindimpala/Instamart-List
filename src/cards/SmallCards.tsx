import { useState } from 'react';
import type { Card, ListItem } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';
import { api, ApiError } from '../api';
import { ErrorBanner } from '../components/ui';
import { useApp } from '../context';
import { ListCard } from './ListCard';

type DiffCardT = Extract<Card, { type: 'diff' }>;

const label = (i: ListItem) => `${i.quantity} × ${i.name} (${i.size})`;

export function DiffCard({ card }: { card: DiffCardT }) {
  const app = useApp();
  const [state, setState] = useState<'pending' | 'applied' | 'discarded' | 'reverted'>('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const run = async (fn: () => Promise<unknown>, next: typeof state, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setState(next);
      await app.refreshLists();
      app.announce(msg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label={`Changes to ${card.listName}`} data-testid="diff-card">
      <div className="card__head">
        <h3>Changes to {card.listName}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {card.rename && (
          <div className="diff-line diff-line--change">
            <span className="diff-sign" aria-hidden="true">
              ✎
            </span>
            <span>
              Rename “{card.rename.from}” to “{card.rename.to}”
            </span>
          </div>
        )}
        {card.added.map((i) => (
          <div className="diff-line diff-line--add" key={`a-${i.spinId}`} data-testid="diff-added">
            <span className="diff-sign" aria-hidden="true">
              +
            </span>
            <span className="diff-line__text">
              <span className="sr-only">Added: </span>
              {label(i)} · {formatRupees(i.price)}
            </span>
          </div>
        ))}
        {card.removed.map((i) => (
          <div className="diff-line diff-line--remove" key={`r-${i.spinId}`} data-testid="diff-removed">
            <span className="diff-sign" aria-hidden="true">
              −
            </span>
            <span className="diff-line__text">
              <span className="sr-only">Removed: </span>
              {label(i)}
            </span>
          </div>
        ))}
        {card.changed.map((c) => (
          <div className="diff-line diff-line--change" key={`c-${c.item.spinId}`} data-testid="diff-changed">
            <span className="diff-sign" aria-hidden="true">
              ↻
            </span>
            <span>
              {c.item.name} ({c.item.size}): quantity {c.from} → {c.to}
            </span>
          </div>
        ))}
        {card.budgetChange && (
          <div className="diff-line diff-line--change">
            <span className="diff-sign" aria-hidden="true">
              ₹
            </span>
            <span>
              Budget {card.budgetChange.from ? formatRupees(card.budgetChange.from) : 'none'} → {card.budgetChange.to ? formatRupees(card.budgetChange.to) : 'none'}
            </span>
          </div>
        )}
        {card.unchanged.length > 0 && (
          <>
            <button type="button" className="linkish" aria-expanded={showUnchanged} onClick={() => setShowUnchanged((s) => !s)}>
              {card.unchanged.length} unchanged
            </button>
            {showUnchanged &&
              card.unchanged.map((i) => (
                <div className="diff-line small muted" key={`u-${i.spinId}`}>
                  <span className="diff-sign" />
                  <span>{label(i)}</span>
                </div>
              ))}
          </>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {state === 'pending' && (
        <div className="btn-row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => run(() => api.applyEdit(card.editId), 'applied', 'Changes applied')}>
            Apply changes
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.undoEdit(card.editId), 'discarded', 'Changes discarded')}>
            Undo
          </button>
        </div>
      )}
      {state === 'applied' && (
        <div className="inline-form" style={{ justifyContent: 'space-between' }}>
          <span className="banner banner--success" role="status" style={{ flex: 1 }}>
            Changes applied
          </span>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.undoEdit(card.editId), 'reverted', 'Changes undone')}>
            Undo
          </button>
        </div>
      )}
      {state === 'discarded' && <p className="muted small" style={{ margin: 0 }}>Changes discarded. Nothing was saved.</p>}
      {state === 'reverted' && <p className="muted small" style={{ margin: 0 }}>Undone. The list is back to how it was.</p>}
    </section>
  );
}

export function ConfirmDeleteCard({ card }: { card: Extract<Card, { type: 'confirm_delete' }> }) {
  const app = useApp();
  const [state, setState] = useState<'ask' | 'deleted' | 'kept'>('ask');
  const [error, setError] = useState<string | null>(null);
  if (state === 'deleted') return <div className="card" role="status">{card.badge} · {card.listName} deleted.</div>;
  if (state === 'kept') return <div className="card muted">Kept {card.badge}.</div>;
  return (
    <div className="card">
      <div className="confirm-inline" role="group" aria-label={`Confirm delete ${card.badge}`}>
        <strong>
          Delete {card.badge} · {card.listName}?
        </strong>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={async () => {
            try {
              await api.deleteList(card.listId);
              setState('deleted');
              await app.refreshLists();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Could not delete.');
            }
          }}
        >
          Yes
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setState('kept')}>
          No
        </button>
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

export function ListsCard({ card }: { card: Extract<Card, { type: 'lists' }> }) {
  const app = useApp();
  // Show the latest version of each list (they may have changed since this message).
  const lists = card.lists.map((l) => app.lists.find((x) => x.id === l.id)).filter(Boolean) as typeof card.lists;
  if (!lists.length) {
    return (
      <div className="card empty">
        <p style={{ margin: 0 }}>No lists yet.</p>
        <button type="button" className="chip" onClick={() => app.prefill('Create a list with ')}>
          Create a list
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {lists.map((l) => (
        <ListCard key={l.id} list={l} />
      ))}
    </div>
  );
}

export function NoticeCard({ card }: { card: Extract<Card, { type: 'notice' }> }) {
  const cls = card.tone === 'success' ? 'banner--success' : card.tone === 'warning' ? 'banner--amber' : 'banner--info';
  return (
    <div className={`banner ${cls}`} role="status">
      <p>{card.text}</p>
    </div>
  );
}
