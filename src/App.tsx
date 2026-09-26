import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Settings } from './game/rules';
import { useI18n } from './i18n';
import {
  GuestSession,
  HostSession,
  LocalSession,
  type Session,
  type SessionError,
  type SessionSnapshot,
  savedSoloGame,
} from './net/session';
import { Home } from './ui/Home';
import { Lobby } from './ui/Lobby';
import { RulesModal } from './ui/RulesModal';
import { ScoreSheet } from './ui/ScoreSheet';
import { Table } from './ui/Table';
import { TopBar } from './ui/TopBar';
import { useTheme } from './ui/theme';

const ID_KEY = 'kw.clientId';
const NAME_KEY = 'kw.name';
const SETTINGS_KEY = 'kw.settings';
const ACTIVE_ROOM_KEY = 'kw.activeRoom';

function clientId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

function savedSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function setRoomParam(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

const noSubscribe = () => () => {};
const noSnapshot = (): SessionSnapshot | null => null;

export function App() {
  const { t } = useI18n();
  const [theme, toggleTheme] = useTheme();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [roomParam] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '');

  const snapshot = useSyncExternalStore(session?.subscribe ?? noSubscribe, session?.getSnapshot ?? noSnapshot);
  const view = snapshot?.view ?? null;

  const updateName = (n: string) => {
    setName(n);
    localStorage.setItem(NAME_KEY, n.trim());
  };

  const open = useCallback((s: Session) => {
    setError(null);
    setSession(s);
  }, []);

  const join = useCallback(
    (code: string) => {
      sessionStorage.setItem(ACTIVE_ROOM_KEY, code);
      setRoomParam(code);
      open(new GuestSession(code, name.trim(), clientId()));
    },
    [name, open],
  );

  const leave = useCallback(() => {
    session?.leave();
    setSession(null);
    setScoresOpen(false);
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    setRoomParam(null);
  }, [session]);

  // After a reload during an online game, go straight back to the same table (the seat is kept for us).
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    if (roomParam && name.trim() && sessionStorage.getItem(ACTIVE_ROOM_KEY) === roomParam) join(roomParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close connections when the tab goes away, so the others hear about it right away.
  useEffect(() => {
    if (!session) return;
    const bye = () => session.leave(true);
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [session]);

  useEffect(() => {
    if (snapshot?.status !== 'error') return;
    setError(snapshot.error);
    session?.leave();
    setSession(null);
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
  }, [snapshot, session]);

  useEffect(() => {
    if (view && snapshot?.role !== 'guest') localStorage.setItem(SETTINGS_KEY, JSON.stringify(view.settings));
  }, [view?.settings, snapshot?.role, view]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (snapshot?.role === 'host' && view && view.phase !== 'lobby' && view.phase !== 'gameOver') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [snapshot?.role, view]);

  const confirmLeave = () => {
    if (!view || view.phase === 'lobby' || view.phase === 'gameOver' || window.confirm(t('leaveConfirm'))) leave();
  };

  const inGame = !!view && view.phase !== 'lobby';
  // Re-read whenever we are back on the home screen.
  const savedSolo = session ? null : savedSoloGame();

  return (
    <div className="app">
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        code={snapshot?.role !== 'local' ? (snapshot?.code ?? null) : null}
        onRules={() => setRulesOpen(true)}
        onScores={inGame ? () => setScoresOpen(true) : undefined}
        onLeave={session ? confirmLeave : undefined}
      />
      <main className="main">
        {!session && (
          <Home
            name={name}
            onName={updateName}
            initialCode={roomParam}
            error={error}
            onLocal={() => open(new LocalSession(name.trim(), clientId(), savedSettings()))}
            onResume={
              savedSolo
                ? () => open(new LocalSession(name.trim(), clientId(), savedSolo.settings, savedSolo))
                : undefined
            }
            onHost={() => open(new HostSession(name.trim(), clientId(), savedSettings()))}
            onJoin={join}
          />
        )}
        {session && !view && (
          <div className="connecting">
            <span className="spinner" /> {t('connecting')}
            <button className="btn ghost" onClick={leave}>
              {t('cancel')}
            </button>
          </div>
        )}
        {session && snapshot && view?.phase === 'lobby' && <Lobby snapshot={snapshot} view={view} send={session.send.bind(session)} />}
        {session && view && inGame && <Table view={view} send={session.send.bind(session)} />}
      </main>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {view && <ScoreSheet view={view} open={scoresOpen} onClose={() => setScoresOpen(false)} />}
    </div>
  );
}
