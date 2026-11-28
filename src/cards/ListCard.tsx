import { useState } from 'react';
import { withAttribution } from '../../shared/brand';
import type { GroceryList } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';
import { api, ApiError } from '../api';
import { BudgetEditor, ErrorBanner } from '../components/ui';
import { useApp } from '../context';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export function ListCard({ list, defaultOpen = false }: { list: GroceryList; defaultOpen?: boolean }) {
  const app = useApp();
  const [open, setOpen] = useState(defaultOpen);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const est = list.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shown = open ? list.items : list.items.slice(0, 3);

  const del = async () => {
    setBusy(true);
    try {
      await api.deleteList(list.id);
      await app.refreshLists();
      app.announce(`${list.badge} deleted`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the list.');
      setBusy(false);
    }
  };

  return (
    <article className="card" aria-labelledby={`lt-${list.id}`} data-testid="list-card">
      <div className="card__head">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="list-badge">{list.badge}</span>
          <h3 id={`lt-${list.id}`}>{list.name}</h3>
        </div>
        <span className="small muted">
          {list.items.length} item{list.items.length === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="list-card__items" id={`li-${list.id}`}>
        {shown.map((i) => (
          <li key={i.spinId} className="small">
            {i.quantity} × {i.name} <span className="muted">({i.size})</span>
          </li>
        ))}
        {!open && list.items.length > 3 && <li className="small muted">+{list.items.length - 3} more</li>}
      </ul>
      {list.items.length > 3 && (
        <button type="button" className="linkish" aria-expanded={open} aria-controls={`li-${list.id}`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show all items'}
        </button>
      )}

      <dl className="kv">
        <dt>Estimated total</dt>
        <dd>
          {formatRupees(est)} <span className="small muted">(saved prices)</span>
        </dd>
        <dt>Last ordered</dt>
        <dd>{fmtDate(list.lastOrderedAt) ?? 'Not ordered yet'}</dd>
      </dl>
      <BudgetEditor
        value={list.budget}
        onSave={async (b) => {
          await api.setBudget(list.id, b);
          await app.refreshLists();
        }}
      />

      {error && <ErrorBanner message={error} />}

      {confirming ? (
        <div className="confirm-inline" role="group" aria-label={`Confirm delete ${list.badge}`}>
          <strong>Delete?</strong>
          <button type="button" className="btn btn--sm btn--danger" onClick={del} disabled={busy} autoFocus>
            Yes
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)} disabled={busy}>
            No
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => app.startOrder({ listId: list.id, label: `${list.badge} · ${list.name}` })} disabled={!list.items.length}>
            Order this list
          </button>
          <button type="button" className="btn" onClick={() => app.prefill(`Edit ${list.badge}: `)}>
            Edit
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                const { text } = await api.exportList(list.id);
                await navigator.clipboard.writeText(text);
                app.toast(withAttribution(`Copied ${list.badge} to clipboard`));
              } catch {
                app.toast(withAttribution('Could not copy the list'));
              }
            }}
          >
            Copy
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
