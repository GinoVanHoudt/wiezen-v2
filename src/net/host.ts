import { type Seat, SEATS } from '../game/cards';
import { botAction } from '../game/bot';
import { type GameState, type Player, IllegalAction, applyAction, createGame } from '../game/engine';
import type { Settings } from '../game/rules';
import { viewFor } from '../game/view';
import type { ClientAction } from './protocol';

export const BOT_NAMES = ['Jef', 'Mieke', 'Staf', 'Lieve'];

const BID_DELAY = 750;
const PLAY_DELAY = 650;
const COLLECT_DELAY = 1300;
const REDEAL_DELAY = 2600;
const SEAT_RESERVATION = 2 * 60 * 1000;

const botPlayer = (seat: Seat): Player => ({ name: BOT_NAMES[seat], bot: true, connected: true, id: null });

/**
 * The authoritative game: runs on the host's browser (or locally for a solo game).
 * Validates every action, drives the bots and the trick/redeal timers.
 */
export class GameHost {
  state: GameState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  /** When each disconnected player left, by client id. */
  private leftAt = new Map<string, number>();

  /** Pass `resume` to continue a saved game (solo games survive a page reload). */
  constructor(hostName: string, hostId: string, settings: Settings, resume?: GameState) {
    const players = SEATS.map((s) => (s === 0 ? { name: hostName, bot: false, connected: true, id: hostId } : botPlayer(s)));
    this.state = resume ?? createGame(players, settings);
    if (resume) this.schedule();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  /**
   * Seats a human: they reclaim their old seat if they had one, otherwise take a bot's place.
   * A player who dropped out keeps their seat reserved for a while so a newcomer can't take it.
   */
  addPlayer(name: string, id: string, now = Date.now()): Seat | null {
    const players = this.state.players;
    const reservationOver = (p: Player) => p.id !== null && now - (this.leftAt.get(p.id) ?? 0) > SEAT_RESERVATION;
    let seat = SEATS.find((s) => players[s].id === id);
    if (seat === undefined) seat = SEATS.find((s) => players[s].bot && players[s].id === null);
    if (seat === undefined) seat = SEATS.find((s) => players[s].bot && !players[s].connected && reservationOver(players[s]));
    if (seat === undefined) return null;
    this.leftAt.delete(id);
    this.setPlayer(seat, { name: name.slice(0, 20) || 'Speler', bot: false, connected: true, id });
    return seat;
  }

  /** A human left: in the lobby the seat is freed, during a game a bot takes over until they return. */
  removePlayer(id: string, now = Date.now()) {
    const seat = SEATS.find((s) => this.state.players[s].id === id);
    if (seat === undefined || seat === 0) return;
    const p = this.state.players[seat];
    this.leftAt.set(id, now);
    this.setPlayer(seat, this.state.phase === 'lobby' ? botPlayer(seat) : { ...p, bot: true, connected: false });
    this.advanceWhenReady();
  }

  /** Humans (connected, not replaced by a bot) that still have to confirm the hand result. */
  private waitingFor(): Seat[] {
    if (this.state.phase !== 'handEnd') return [];
    return SEATS.filter((s) => !this.state.players[s].bot && !this.state.ready.includes(s));
  }

  private advanceWhenReady() {
    const s = this.state;
    if (s.phase !== 'handEnd' || !s.history[s.history.length - 1]?.contract) return;
    if (this.waitingFor().length === 0) this.apply({ type: 'nextHand' });
  }

  seatOf(id: string): Seat | null {
    const seat = SEATS.find((s) => this.state.players[s].id === id);
    return seat === undefined ? null : seat;
  }

  handle(seat: Seat, action: ClientAction) {
    const isHost = seat === 0;
    try {
      switch (action.type) {
        case 'bid':
          return this.apply({ type: 'bid', seat, bid: action.bid });
        case 'play':
          return this.apply({ type: 'play', seat, card: action.card });
        case 'start':
          if (isHost) this.apply({ type: 'start' });
          return;
        case 'nextHand':
          // Every human at the table confirms they have seen the result.
          if (this.state.phase === 'handEnd' && !this.state.ready.includes(seat)) {
            this.update({ ...this.state, ready: [...this.state.ready, seat], version: this.state.version + 1 });
            this.advanceWhenReady();
          }
          return;
        case 'settings':
          if (isHost && this.state.phase === 'lobby') this.update({ ...this.state, settings: action.settings });
          return;
        case 'toLobby':
          if (isHost) {
            // Free the seats of players who are gone, keep everyone who is still here.
            const players = this.state.players.map((p, i) => (p.bot ? botPlayer(i as Seat) : p));
            this.update({ ...createGame(players, this.state.settings), version: this.state.version + 1 });
          }
          return;
      }
    } catch (e) {
      if (!(e instanceof IllegalAction)) throw e;
      // Stale or duplicate click: ignore.
    }
  }

  private setPlayer(seat: Seat, player: Player) {
    const players = this.state.players.slice();
    players[seat] = player;
    this.update({ ...this.state, players, version: this.state.version + 1 });
  }

  private apply(action: Parameters<typeof applyAction>[1]) {
    this.update(applyAction(this.state, action));
  }

  private update(state: GameState) {
    this.state = state;
    this.schedule();
    this.listeners.forEach((l) => l());
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    const later = (ms: number, fn: () => void) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        try {
          fn();
        } catch (e) {
          if (!(e instanceof IllegalAction)) throw e;
        }
      }, ms);
    };

    if (s.phase === 'handEnd') {
      const last = s.history[s.history.length - 1];
      if (last && !last.contract) later(REDEAL_DELAY, () => this.apply({ type: 'nextHand' }));
      return;
    }
    if (s.phase === 'playing' && s.trick?.winner != null) {
      later(COLLECT_DELAY, () => this.apply({ type: 'collect' }));
      return;
    }
    const turn = s.phase === 'bidding' ? s.bidding?.turn : s.phase === 'playing' ? s.turn : null;
    if (turn == null || !s.players[turn].bot) return;
    later(s.phase === 'bidding' ? BID_DELAY : PLAY_DELAY, () => {
      const action = botAction(viewFor(this.state, turn));
      if (action) this.apply(action);
    });
  }
}
