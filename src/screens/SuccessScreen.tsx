import { useEffect, useRef, useState } from 'react';
import type { OrderResult, TrackResult } from '../../shared/cards';
import { formatRupees } from '../../shared/sizes';
import { api, ApiError } from '../api';
import { PoweredByInstamart } from '../brand/PoweredByInstamart';
import { ErrorBanner, Icon } from '../components/ui';
import { useApp } from '../context';

export function SuccessScreen({ order, onClose }: { order: OrderResult; onClose: () => void }) {
  const app = useApp();
  const [track, setTrack] = useState<TrackResult | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'ask' | 'saving' | 'saved' | 'dismissed'>(order.offerSaveAsList ? 'ask' : 'dismissed');
  const [savedLabel, setSavedLabel] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const eta = track?.etaText ?? order.etaText;

  return (
    <main className="success" data-testid="success-screen">
      <div className="success__icon">{Icon.bigCheck}</div>
      <h1 tabIndex={-1} ref={heading}>
        Order placed
      </h1>
      <dl className="kv">
        <dt>Order ID</dt>
        <dd data-testid="order-id">{order.orderId}</dd>
        {order.addressLine && (
          <>
            <dt>Deliver to</dt>
            <dd>{order.addressLine}</dd>
          </>
        )}
        {order.total !== null && (
          <>
            <dt>Total</dt>
            <dd>{formatRupees(order.total)}</dd>
          </>
        )}
        <dt>Payment</dt>
        <dd>{order.paymentMethod === 'Cash' ? 'Cash on delivery' : order.paymentMethod}</dd>
        {/* ETA only when the service response contains one. */}
        {eta && (
          <>
            <dt>Arriving in</dt>
            <dd data-testid="eta">{eta}</dd>
          </>
        )}
        {track && (
          <>
            <dt>Status</dt>
            <dd data-testid="track-status">
              {track.statusMessage}
              {track.subStatusMessage ? ` · ${track.subStatusMessage}` : ''}
            </dd>
          </>
        )}
      </dl>

      <div className="pbi-row">
        <PoweredByInstamart variant="standard" />
      </div>

      {error && <ErrorBanner message={error} />}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={tracking}
        onClick={async () => {
          setTracking(true);
          setError(null);
          try {
            setTrack((await api.track(order.orderId)).track);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not fetch tracking.');
          } finally {
            setTracking(false);
          }
        }}
      >
        {tracking ? 'Checking…' : track ? 'Refresh status' : 'Track order'}
      </button>

      {saveState === 'ask' || saveState === 'saving' ? (
        <div className="banner banner--info" data-testid="save-nudge">
          <p>
            <strong>Save this as a list?</strong> Reorder it next time with one tap.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={saveState === 'saving'}
              onClick={async () => {
                setSaveState('saving');
                try {
                  const { list } = await api.saveOrderAsList();
                  setSavedLabel(`${list.badge} · ${list.name}`);
                  setSaveState('saved');
                  await app.refreshLists();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : 'Could not save.');
                  setSaveState('ask');
                }
              }}
            >
              Save list
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setSaveState('dismissed')}>
              Not now
            </button>
          </div>
        </div>
      ) : saveState === 'saved' ? (
        <div className="banner banner--success" role="status">
          <p>Saved as {savedLabel}</p>
        </div>
      ) : null}

      <button type="button" className="btn btn--block" onClick={onClose}>
        Back to chat
      </button>
      <p className="disclaimer">To cancel or change an order, contact Swiggy customer care from the Swiggy app.</p>
    </main>
  );
}
