import Peer, { type DataConnection } from 'peerjs';
import type { Seat } from '../game/cards';
import type { GameState } from '../game/engine';
import type { Settings } from '../game/rules';
import { type PlayerView, viewFor } from '../game/view';
import { GameHost } from './host';
import { type ClientAction, type GuestMessage, type HostMessage, PEER_PREFIX } from './protocol';

export type SessionError = 'notFound' | 'full' | 'hostLeft' | 'connection' | 'network';

export interface SessionSnapshot {
  role: 'local' | 'host' | 'guest';
  status: 'connecting' | 'ready' | 'error';
  code: string | null;
  view: PlayerView | null;
  error: SessionError | null;
}

export interface Session {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SessionSnapshot;
  send(action: ClientAction): void;
  /** `keepSave`: the tab is going away, keep a resumable solo game. */
  leave(keepSave?: boolean): void;
}

abstract class BaseSession implements Session {
  protected snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();

  protected constructor(initial: SessionSnapshot) {
    this.snapshot = initial;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  protected set(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  abstract send(action: ClientAction): void;
  abstract leave(keepSave?: boolean): void;
}

const SOLO_SAVE_KEY = 'kw.soloGame';

/** A solo game in progress that was saved before the page was closed or reloaded. */
export function savedSoloGame(): GameState | null {
  try {
    const state = JSON.parse(localStorage.getItem(SOLO_SAVE_KEY) ?? 'null') as GameState | null;
    return state && state.phase !== 'lobby' && state.phase !== 'gameOver' && Array.isArray(state.ready) ? state : null;
  } catch {
    return null;
  }
}

export const discardSoloGame = () => localStorage.removeItem(SOLO_SAVE_KEY);

/** Solo game against three bots, entirely in this browser. */
export class LocalSession extends BaseSession {
  private host: GameHost;

  constructor(name: string, id: string, settings: Settings, resume?: GameState) {
    super({ role: 'local', status: 'ready', code: null, view: null, error: null });
    this.host = new GameHost(name, id, settings, resume);
    this.host.subscribe(() => {
      localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify(this.host.state));
      this.set({ view: viewFor(this.host.state, 0) });
    });
    this.snapshot = { ...this.snapshot, view: viewFor(this.host.state, 0) };
  }

  send(action: ClientAction) {
    this.host.handle(0, action);
  }

  /** Closing the tab keeps the save; leaving on purpose throws it away. */
  leave(keepSave = false) {
    this.host.dispose();
    if (!keepSave) discardSoloGame();
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const PING_INTERVAL = 4000;
const TIMEOUT = 15000;
const CONNECT_TIMEOUT = 20000;

/**
 * Online host: the game runs here and guests connect peer-to-peer over WebRTC.
 * The public PeerJS server is only used to find each other; no game data goes through a backend.
 */
export class HostSession extends BaseSession {
  private host: GameHost;
  private peer: Peer | null = null;
  private conns = new Map<DataConnection, { id: string | null; lastSeen: number }>();
  private watchdog: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(name: string, id: string, settings: Settings) {
    super({ role: 'host', status: 'connecting', code: null, view: null, error: null });
    this.host = new GameHost(name, id, settings);
    this.snapshot = { ...this.snapshot, view: viewFor(this.host.state, 0) };
    this.host.subscribe(() => this.broadcast());
    this.open(0);
    setTimeout(() => {
      if (!this.closed && this.snapshot.status === 'connecting') this.set({ status: 'error', error: 'network' });
    }, CONNECT_TIMEOUT);
    this.watchdog = setInterval(() => {
      const now = Date.now();
      for (const [conn, info] of this.conns) if (now - info.lastSeen > TIMEOUT) this.drop(conn);
    }, PING_INTERVAL);
  }

  private open(attempt: number) {
    const code = randomCode();
    const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => this.set({ status: 'ready', code }));
    peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        this.open(attempt + 1);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        if (this.snapshot.status === 'connecting') this.set({ status: 'error', error: 'network' });
      }
    });
    peer.on('disconnected', () => {
      // Lost the signalling server: existing peer connections keep working, but try to be findable again.
      if (!this.closed && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('connection', (conn) => this.accept(conn));
  }

  private accept(conn: DataConnection) {
    this.conns.set(conn, { id: null, lastSeen: Date.now() });
    conn.on('data', (raw) => {
      const info = this.conns.get(conn);
      if (!info) return;
      info.lastSeen = Date.now();
      const msg = raw as GuestMessage;
      if (msg.t === 'ping') {
        conn.send({ t: 'pong' } satisfies HostMessage);
      } else if (msg.t === 'hello') {
        // A second tab with the same id replaces the first connection.
        for (const [other, o] of this.conns) if (other !== conn && o.id === msg.id) this.forget(other);
        const seat = this.host.addPlayer(String(msg.name), String(msg.id));
        if (seat === null) {
          conn.send({ t: 'full' } satisfies HostMessage);
          setTimeout(() => conn.close(), 500);
          return;
        }
        info.id = String(msg.id);
        conn.send({ t: 'welcome', seat } satisfies HostMessage);
        this.sendView(conn, seat);
      } else if (msg.t === 'action' && info.id) {
        const seat = this.host.seatOf(info.id);
        if (seat !== null && seat !== 0) this.host.handle(seat, msg.action);
      }
    });
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }

  private forget(conn: DataConnection) {
    this.conns.delete(conn);
    conn.close();
  }

  private drop(conn: DataConnection) {
    const info = this.conns.get(conn);
    if (!info) return;
    this.forget(conn);
    if (info.id && ![...this.conns.values()].some((o) => o.id === info.id)) this.host.removePlayer(info.id);
  }

  private sendView(conn: DataConnection, seat: Seat) {
    if (conn.open) conn.send({ t: 'state', view: viewFor(this.host.state, seat) } satisfies HostMessage);
  }

  private broadcast() {
    this.set({ view: viewFor(this.host.state, 0) });
    for (const [conn, info] of this.conns) {
      if (!info.id) continue;
      const seat = this.host.seatOf(info.id);
      if (seat !== null) this.sendView(conn, seat);
    }
  }

  send(action: ClientAction) {
    this.host.handle(0, action);
  }

  leave() {
    this.closed = true;
    clearInterval(this.watchdog);
    this.host.dispose();
    for (const conn of this.conns.keys()) conn.close();
    this.peer?.destroy();
  }
}

/** A player at someone else's table. */
export class GuestSession extends BaseSession {
  private peer: Peer;
  private conn: DataConnection | null = null;
  private lastSeen = Date.now();
  private pinger: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(code: string, private name: string, private id: string) {
    super({ role: 'guest', status: 'connecting', code: code.toUpperCase(), view: null, error: null });
    this.peer = new Peer({ debug: 0 });
    this.peer.on('open', () => this.connect());
    this.peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'peer-unavailable') this.fail(this.snapshot.view ? 'hostLeft' : 'notFound');
      else if (this.snapshot.status === 'connecting') this.fail('network');
    });
    // WebRTC can fail silently (e.g. strict firewalls): give up instead of spinning forever.
    setTimeout(() => {
      if (!this.snapshot.view) this.fail('connection');
    }, CONNECT_TIMEOUT);
  }

  private connect() {
    const conn = this.peer.connect(PEER_PREFIX + this.snapshot.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      this.lastSeen = Date.now();
      conn.send({ t: 'hello', name: this.name, id: this.id } satisfies GuestMessage);
      this.pinger = setInterval(() => {
        if (Date.now() - this.lastSeen > TIMEOUT) return this.fail('connection');
        if (conn.open) conn.send({ t: 'ping' } satisfies GuestMessage);
      }, PING_INTERVAL);
    });
    conn.on('data', (raw) => {
      this.lastSeen = Date.now();
      const msg = raw as HostMessage;
      if (msg.t === 'state') this.set({ status: 'ready', view: msg.view });
      else if (msg.t === 'full') this.fail('full');
    });
    conn.on('close', () => this.fail(this.snapshot.view ? 'hostLeft' : 'notFound'));
  }

  private fail(error: SessionError) {
    if (this.closed || this.snapshot.status === 'error') return;
    this.set({ status: 'error', error });
    this.cleanup();
  }

  private cleanup() {
    this.closed = true;
    if (this.pinger) clearInterval(this.pinger);
    this.conn?.close();
    this.peer.destroy();
  }

  send(action: ClientAction) {
    if (this.conn?.open) this.conn.send({ t: 'action', action } satisfies GuestMessage);
  }

  leave() {
    this.cleanup();
  }
}
