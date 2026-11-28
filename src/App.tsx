import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withAttribution } from '../shared/brand';
import type { Card, GroceryList, OrderPreview, OrderResult, SessionInfo } from '../shared/cards';
import { api, ApiError, setAuthListener } from './api';
import { PoweredByInstamart } from './brand/PoweredByInstamart';
import { FoundItemsCard } from './cards/FoundItemsCard';
import { ListCard } from './cards/ListCard';
import { OrderFlow, OrderPreviewCard, OrderProgress } from './cards/OrderFlow';
import { ConfirmDeleteCard, DiffCard, ListsCard, NoticeCard } from './cards/SmallCards';
import { DemoScenarios } from './components/DemoScenarios';
import { ErrorBanner, Icon } from './components/ui';
import { AppCtx, type AppActions, type OrderStart } from './context';
import { useSpeech } from './hooks/useSpeech';
import { SuccessScreen } from './screens/SuccessScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text?: string;
  cards?: Card[];
  order?: OrderStart;
  preview?: OrderPreview;
  error?: { message: string; retry?: string };
}

let nextId = 1;

function renderCard(card: Card, key: string) {
  switch (card.type) {
    case 'found_items':
      return <FoundItemsCard key={key} card={card} />;
    case 'lists':
      return <ListsCard key={key} card={card} />;
    case 'diff':
      return <DiffCard key={key} card={card} />;
    case 'order_preview':
      return <OrderPreviewCard key={key} initial={card.preview} />;
    case 'confirm_delete':
      return <ConfirmDeleteCard key={key} card={card} />;
    case 'notice':
      return <NoticeCard key={key} card={card} />;
    case 'error':
      return <ErrorBanner key={key} message={card.message} />;
  }
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      if (theme) localStorage.setItem('theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  const effective = theme ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  return { effective, toggle: () => setTheme(effective === 'dark' ? 'light' : 'dark') };
}

export default function App() {
  const [session, setSession] = useState<(SessionInfo & { authMessage?: string }) | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(() => new URLSearchParams(window.location.search).get('auth_error'));
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'lists'>('chat');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<null | 'typing' | 'order'>(null);
  const [input, setInput] = useState('');
  const [success, setSuccess] = useState<OrderResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const loadSession = useCallback(async () => {
    setSessionError(null);
    try {
      const s = await api.session();
      setSession(s);
      if (s.authMessage) setAuthMessage(s.authMessage);
    } catch (e) {
      setSessionError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    setAuthListener((message) => {
      setAuthMessage(message);
      setSession((s) => (s ? { ...s, signedIn: false } : s));
    });
    loadSession();
    if (window.location.search.includes('auth_error')) {
      const u = new URL(window.location.href);
      u.searchParams.delete('auth_error');
      window.history.replaceState(null, '', u.toString());
    }
  }, [loadSession]);

  const refreshLists = useCallback(async () => {
    setListsLoading(true);
    setListsError(null);
    try {
      setLists((await api.lists()).lists);
    } catch (e) {
      setListsError(e instanceof ApiError ? e.message : 'Could not load your lists.');
    } finally {
      setListsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.signedIn) refreshLists();
  }, [session?.signedIn, refreshLists]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending, view, success]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const push = (m: Omit<Msg, 'id'>) => setMessages((ms) => [...ms, { ...m, id: nextId++ }]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;
      setView('chat');
      setInput('');
      const history = messages
        .filter((m) => m.text)
        .slice(-10)
        .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), text: m.text! }));
      push({ role: 'user', text });
      setPending(/\b(order|reorder|buy|checkout)\b/i.test(text) ? 'order' : 'typing');
      try {
        const r = await api.chat(text, history);
        push({ role: 'bot', text: r.reply, cards: r.cards });
        if (r.cards.some((c) => c.type !== 'notice' && c.type !== 'error')) refreshLists();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) push({ role: 'bot', error: { message: e instanceof ApiError ? e.message : 'Something went wrong.', retry: text } });
      } finally {
        setPending(null);
      }
    },
    [messages, pending, refreshLists],
  );

  const actions: AppActions = useMemo(
    () => ({
      lists,
      refreshLists,
      startOrder: (start) => {
        setView('chat');
        push({ role: 'user', text: `Order ${start.label}` });
        push({ role: 'bot', order: start });
      },
      showPreview: (preview) => push({ role: 'bot', preview }),
      orderPlaced: (order) => {
        setSuccess(order);
        push({ role: 'bot', text: `Order ${order.orderId} placed.` });
        setToast(withAttribution(`Order ${order.orderId} placed`));
        setLive(order.message); // includes "Powered by Instamart"
        refreshLists();
      },
      prefill: (text) => {
        setView('chat');
        setInput(text);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(text.length, text.length);
        }, 0);
      },
      send,
      pushBot: (text, cards) => push({ role: 'bot', text, cards }),
      toast: setToast,
      announce: setLive,
      openLists: () => setView('lists'),
    }),
    [lists, refreshLists, send],
  );

  const speech = useSpeech((t) => setInput((v) => (v ? `${v} ${t}` : t)));

  /* ---------- screens ---------- */
  if (!session) {
    return (
      <div className="phone">
        <main className="welcome" aria-busy={!sessionError}>
          {sessionError ? <ErrorBanner message={sessionError} onRetry={loadSession} /> : <div className="skeleton" aria-label="Loading" />}
        </main>
        <div className="pbi-strip">
          <PoweredByInstamart variant="standard" />
        </div>
      </div>
    );
  }

  return (
    <AppCtx.Provider value={actions}>
      <div className="phone">
        <div className="sr-only" aria-live="polite" role="status" data-testid="live-region">
          {live}
        </div>
        {!session.signedIn ? (
          <WelcomeScreen mode={session.mode} message={authMessage} />
        ) : success ? (
          <SuccessScreen order={success} onClose={() => setSuccess(null)} />
        ) : (
          <>
            <header className="topbar">
              <h1 className="topbar__title">Lists Assistant</h1>
              <div className="topbar__actions">
                <button type="button" className="icon-btn" onClick={theme.toggle} aria-label={`Switch to ${theme.effective === 'dark' ? 'light' : 'dark'} theme`}>
                  {Icon.theme}
                </button>
                <button
                  type="button"
                  className="btn btn--sm mylists-btn"
                  onClick={() => setView((v) => (v === 'lists' ? 'chat' : 'lists'))}
                  aria-pressed={view === 'lists'}
                  aria-label={`My lists, ${lists.length} saved`}
                >
                  {Icon.list} My lists <span className="count-badge" aria-hidden="true">{lists.length}</span>
                </button>
              </div>
              {session.address && (
                <div className="addr-pill" title={session.address.line}>
                  {Icon.pin}
                  <span>
                    <strong>{session.address.label}</strong>
                    {session.address.line.startsWith(session.address.label) ? session.address.line.slice(session.address.label.length).replace(/^[,\s]+/, ' · ') : ` · ${session.address.line}`}
                  </span>
                </div>
              )}
            </header>

            {view === 'lists' ? (
              <main className="view" data-testid="lists-view">
                <div className="view__head">
                  <button type="button" className="icon-btn" onClick={() => setView('chat')} aria-label="Back to chat">
                    {Icon.back}
                  </button>
                  <h2>My lists</h2>
                </div>
                {listsError && <ErrorBanner message={listsError} onRetry={refreshLists} />}
                {listsLoading && !lists.length ? (
                  <>
                    <div className="skeleton" />
                    <div className="skeleton" />
                  </>
                ) : lists.length === 0 ? (
                  <div className="empty card">
                    <p style={{ margin: 0 }}>No lists yet. Tell me what you buy often and I’ll make one.</p>
                    <button type="button" className="chip" onClick={() => actions.prefill('Create a list with ')}>
                      Create a list
                    </button>
                  </div>
                ) : (
                  lists.map((l) => <ListCard key={l.id} list={l} />)
                )}
                {session.mode === 'stub' && <DemoScenarios />}
              </main>
            ) : (
              <main className="chat" aria-label="Conversation" data-testid="chat">
                <div className="msg msg--bot greeting">
                  <div className="bubble">
                    <h2>Hi! What are we shopping for?</h2>
                    <p>I can build grocery lists, edit them in plain words, and reorder a whole list. Nothing is ordered until you tap Confirm order.</p>
                    <div className="chips">
                      <button type="button" className="chip" onClick={() => actions.prefill('Create a list with ')}>
                        Create a list
                      </button>
                      <button type="button" className="chip" onClick={() => send('Order a list')}>
                        Order a list
                      </button>
                      <button type="button" className="chip" onClick={() => setView('lists')}>
                        Show my lists
                      </button>
                      <button type="button" className="chip" onClick={() => actions.prefill(lists[0] ? `Edit ${lists[0].badge}: ` : 'Edit L1: ')}>
                        Edit a list
                      </button>
                    </div>
                  </div>
                </div>
                {messages.map((m) => (
                  <div key={m.id} className={`msg msg--${m.role}`}>
                    {m.text && <div className="bubble">{m.text}</div>}
                    {m.cards?.map((c, i) => renderCard(c, `${m.id}-${i}`))}
                    {m.order && <OrderFlow start={m.order} />}
                    {m.preview && <OrderPreviewCard initial={m.preview} />}
                    {m.error && (
                      <div className="card" style={{ width: '100%' }}>
                        <ErrorBanner message={m.error.message} onRetry={m.error.retry ? () => send(m.error!.retry!) : undefined} />
                      </div>
                    )}
                  </div>
                ))}
                {pending && (
                  <div className="msg msg--bot" aria-live="polite">
                    {pending === 'order' ? (
                      <OrderProgress done={false} />
                    ) : (
                      <div className="bubble" aria-label="Assistant is typing">
                        <span className="typing">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div ref={chatEnd} />
              </main>
            )}

            <div className="bottom">
              {/* Persistent attribution strip: own row, directly above the input bar, 8px+ clear space. */}
              <div className="pbi-strip" data-testid="pbi-strip">
                <PoweredByInstamart variant="standard" />
              </div>
              <form
                className="inputbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <label htmlFor="chat-input" className="sr-only">
                  Message Lists Assistant
                </label>
                <input
                  id="chat-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. Create a list with milk, bread and 6 eggs"
                  autoComplete="off"
                  maxLength={1000}
                />
                {speech.supported && (
                  <button type="button" className="icon-btn mic-btn" onClick={speech.toggle} aria-pressed={speech.listening} aria-label={speech.listening ? 'Stop voice input' : 'Voice input'}>
                    {Icon.mic}
                  </button>
                )}
                <button type="submit" className="icon-btn send-btn" aria-label="Send message" disabled={!input.trim() || !!pending}>
                  {Icon.send}
                </button>
              </form>
            </div>
          </>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </AppCtx.Provider>
  );
}
