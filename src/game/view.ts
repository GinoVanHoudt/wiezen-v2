import type { Card, Seat } from './cards';
import type { GameState } from './engine';

/** What one player is allowed to see: the full state minus the other players' cards. */
export interface PlayerView extends Omit<GameState, 'hands'> {
  seat: Seat;
  /** Visible hands (own hand, open miserie hands); null when hidden. */
  hands: (Card[] | null)[];
  handSizes: number[];
}

export function viewFor(state: GameState, seat: Seat): PlayerView {
  const open =
    state.phase === 'playing' && state.contract?.type === 'openMiserie' ? state.contract.declarers : [];
  return {
    ...state,
    seat,
    hands: state.hands.map((h, i) => (i === seat || open.includes(i as Seat) ? h : null)),
    handSizes: state.hands.map((h) => h.length),
  };
}
