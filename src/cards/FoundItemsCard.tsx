import { useMemo, useState } from 'react';
import { computeBudget } from '../../shared/budget';
import type { Alternative, Card, DraftItem } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';
import { api, ApiError } from '../api';
import { PoweredByInstamart } from '../brand/PoweredByInstamart';
import { BottomSheet, BudgetBar, BudgetEditor, ErrorBanner, QtyStepper, Thumb } from '../components/ui';
import { useApp } from '../context';

type FoundCard = Extract<Card, { type: 'found_items' }>;

interface Row {
  original: DraftItem;
  chosen: Alternative;
  qty: number;
}

const asAlt = (d: DraftItem): Alternative => ({ spinId: d.spinId, productId: d.productId, name: d.name, size: d.size, price: d.price, inStock: d.inStock });

export function FoundItemsCard({ card }: { card: FoundCard }) {
  const app = useApp();
  const [rows, setRows] = useState<Row[]>(() => card.items.map((i) => ({ original: i, chosen: asAlt(i), qty: i.quantity })));
  const [name, setName] = useState(card.suggestedName);
  const [budget, setBudget] = useState<number | null>(card.budget?.limit ?? null);
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [state, setState] = useState<'open' | 'saving' | 'saved' | 'discarded'>('open');
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = rows.filter((r) => r.qty > 0);
  const total = active.reduce((s, r) => s + r.chosen.price * r.qty, 0);
  const budgetStatus = useMemo(
    () =>
      budget
        ? computeBudget(
            budget,
            total,
            active.map((r) => ({
              spinId: r.chosen.spinId,
              name: r.chosen.name,
              size: r.chosen.size,
              price: r.chosen.price,
              quantity: r.qty,
              alternatives: [asAlt(r.original), ...r.original.alternatives],
            })),
            'estimate',
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budget, total, rows],
  );

  const choose = (idx: number, alt: Alternative) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, chosen: alt } : r)));

  if (state === 'discarded') return <div className="card"><p className="muted" style={{ margin: 0 }}>Discarded.</p></div>;
  if (state === 'saved' && saved) {
    return (
      <div className="card" data-testid="saved-card">
        <div className="banner banner--success" role="status">
          <p>
            <strong>Saved as {saved.label}</strong>
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => app.startOrder({ listId: saved.id, label: saved.label })}>
            Order this list
          </button>
          <button type="button" className="btn" onClick={app.openLists}>
            View my lists
          </button>
        </div>
      </div>
    );
  }

  const save = async () => {
    setState('saving');
    setError(null);
    try {
      const { list } = await api.saveDraft(card.draftId, {
        name: name.trim() || null,
        items: rows.map((r) => ({ spinId: r.chosen.spinId, quantity: r.qty })),
      });
      if (budget) await api.setBudget(list.id, budget);
      setSaved({ id: list.id, label: `${list.badge} · ${list.name}` });
      setState('saved');
      await app.refreshLists();
      app.announce(`Saved as ${list.badge}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the list.');
      setState('open');
    }
  };

  return (
    <section className="card" aria-label="Found these for you" data-testid="found-card">
      <div className="card__head">
        <h3>Found these for you</h3>
        <span className="list-badge">{card.badge}</span>
      </div>

      <div>
        {rows.map((r, idx) => (
          <div className="item-row" key={r.original.spinId + idx} data-testid="found-row" style={{ opacity: r.qty === 0 ? 0.55 : 1 }}>
            <Thumb name={r.chosen.name} />
            <div className="item-row__main">
              <div className="item-row__name">{r.chosen.name}</div>
              <div className="item-row__meta">
                <span>{r.chosen.size}</span>
                <span>{formatRupees(r.chosen.price)}</span>
                {!r.chosen.inStock && <span className="tag tag--oos">Out of stock</span>}
              </div>
              {(r.original.alternatives.length > 0 || r.chosen.spinId !== r.original.spinId) && (
                <button type="button" className="linkish" onClick={() => setSwapIdx(idx)} aria-label={`Swap variant for ${r.chosen.name}`}>
                  Swap variant
                </button>
              )}
            </div>
            <div className="item-row__side">
              <QtyStepper value={r.qty} label={r.chosen.name} onChange={(n) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, qty: n } : x)))} />
            </div>
          </div>
        ))}
      </div>

      {card.notFound.length > 0 && (
        <div className="banner banner--info">
          <p className="small">Couldn’t find: {card.notFound.join(', ')}. Try another name?</p>
        </div>
      )}

      <div className="total-row">
        <span>Estimated total</span>
        <span data-testid="found-total">{formatRupees(total)}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Prices from Instamart right now. Fees are added at checkout.
      </p>

      {budgetStatus && (
        <BudgetBar
          status={budgetStatus}
          onSuggestion={(s) => {
            if (s.kind === 'remove') setRows((rs) => rs.map((r) => (r.chosen.spinId === s.spinId ? { ...r, qty: 0 } : r)));
            else
              setRows((rs) =>
                rs.map((r) => {
                  if (r.chosen.spinId !== s.fromSpinId) return r;
                  const alt = [asAlt(r.original), ...r.original.alternatives].find((a) => a.spinId === s.toSpinId);
                  return alt ? { ...r, chosen: alt } : r;
                }),
              );
          }}
        />
      )}
      <div className="inline-form">
        <BudgetEditor value={budget} onSave={(v) => setBudget(v)} />
      </div>

      <div className="inline-form">
        <label htmlFor={`name-${card.draftId}`} className="small">
          List name
        </label>
        <input id={`name-${card.draftId}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} style={{ flex: 1, width: 'auto' }} />
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={save} disabled={state === 'saving' || active.length === 0}>
          {state === 'saving' ? 'Saving…' : `Save as ${card.badge}`}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await api.discardDraft(card.draftId).catch(() => undefined);
            setState('discarded');
          }}
        >
          Discard
        </button>
      </div>

      <div className="pbi-row">
        <PoweredByInstamart variant="compact" />
      </div>

      {swapIdx !== null && (
        <BottomSheet title={`Swap variant: ${rows[swapIdx].original.name}`} onClose={() => setSwapIdx(null)}>
          {[asAlt(rows[swapIdx].original), ...rows[swapIdx].original.alternatives].slice(0, 4).map((alt) => (
            <button
              type="button"
              key={alt.spinId}
              className="option"
              aria-pressed={alt.spinId === rows[swapIdx].chosen.spinId}
              disabled={!alt.inStock}
              onClick={() => {
                choose(swapIdx, alt);
                setSwapIdx(null);
              }}
            >
              <Thumb name={alt.name} />
              <span>
                <strong>{alt.name}</strong>
                <br />
                <span className="small muted">
                  {alt.size}
                  {!alt.inStock && ' · Out of stock'}
                </span>
              </span>
              <strong>{formatRupees(alt.price)}</strong>
            </button>
          ))}
        </BottomSheet>
      )}
    </section>
  );
}
