import type { Card } from '../game/cards';
import type { BidAction } from '../game/engine';
import type { Settings } from '../game/rules';
import type { PlayerView } from '../game/view';
import type { Seat } from '../game/cards';

/** What a human at the table can ask the host to do. Host-only actions are ignored from guests. */
export type ClientAction =
  | { type: 'bid'; bid: BidAction }
  | { type: 'play'; card: Card }
  | { type: 'start' }
  | { type: 'nextHand' }
  | { type: 'settings'; settings: Settings }
  | { type: 'toLobby' };

export type GuestMessage =
  | { t: 'hello'; name: string; id: string }
  | { t: 'action'; action: ClientAction }
  | { t: 'ping' };

export type HostMessage =
  | { t: 'welcome'; seat: Seat }
  | { t: 'state'; view: PlayerView }
  | { t: 'full' }
  | { t: 'pong' };

export const PEER_PREFIX = 'kleurenwiezen-v2-';
