import { type Card, type Seat, type Suit, SEATS, deal, makeCard, nextSeat, rankOf, suitOf, winningIndex } from './cards';
import {
  CONTRACTS,
  type Contract,
  type ContractType,
  type DeclarerOutcome,
  type Settings,
  outcomeDecided,
  scoreContract,
} from './rules';

export type Phase = 'lobby' | 'bidding' | 'playing' | 'handEnd' | 'gameOver';

export type DirectBid = 'piccolo' | 'abondance' | 'miserie' | 'openMiserie' | 'soloSlim';

export type BidAction =
  | { kind: 'pass' }
  | { kind: 'ask'; suit: Suit }
  /** Join the highest bid: "meegaan" with an ask, or declare the same miserie/piccolo too. */
  | { kind: 'join' }
  /** The asker nobody joined plays alone. */
  | { kind: 'alone' }
  | { kind: 'bid'; contract: DirectBid; suit?: Suit };

export interface Player {
  name: string;
  bot: boolean;
  connected: boolean;
  /** Client id of the human owning this seat, so they can reclaim it after a disconnect. */
  id: string | null;
}

export interface HighBid {
  type: 'ask' | 'samen' | 'troel' | DirectBid;
  suit: Suit | null;
  declarers: Seat[];
}

export type BidLogEntry = { seat: Seat; bid: BidAction } | { seat: Seat; bid: { kind: 'troel'; suit: Suit } };

export interface Troel {
  seat: Seat;
  partner: Seat;
  aces: number;
  trump: Suit;
  /** The card that identifies the partner (the fourth ace, or the highest heart with four aces). */
  partnerCard: Card;
}

export interface Bidding {
  turn: Seat | null;
  passed: boolean[];
  high: HighBid | null;
  log: BidLogEntry[];
  askerDecision: boolean;
  troel: Troel | null;
}

export interface Trick {
  leader: Seat;
  /** In play order, starting with the leader. */
  cards: Card[];
  winner: Seat | null;
}

export interface HandResult {
  handNo: number;
  dealer: Seat;
  contract: Contract | null;
  tricksWon: number[];
  outcomes: DeclarerOutcome[];
  deltas: number[];
}

export interface GameState {
  phase: Phase;
  settings: Settings;
  players: Player[];
  dealer: Seat;
  handNo: number;
  hands: Card[][];
  bidding: Bidding | null;
  contract: Contract | null;
  trick: Trick | null;
  lastTrick: Trick | null;
  tricksPlayed: number;
  tricksWon: number[];
  playedCards: Card[];
  turn: Seat | null;
  scores: number[];
  history: HandResult[];
  nextMultiplier: number;
  /** Humans who clicked "next hand" after the current hand ended. */
  ready: Seat[];
  version: number;
}

export type Action =
  | { type: 'start' }
  | { type: 'bid'; seat: Seat; bid: BidAction }
  | { type: 'play'; seat: Seat; card: Card }
  | { type: 'collect' }
  | { type: 'nextHand' };

export class IllegalAction extends Error {}

export function createGame(players: Player[], settings: Settings): GameState {
  return {
    phase: 'lobby',
    settings,
    players,
    dealer: 3,
    handNo: 0,
    hands: [[], [], [], []],
    bidding: null,
    contract: null,
    trick: null,
    lastTrick: null,
    tricksPlayed: 0,
    tricksWon: [0, 0, 0, 0],
    playedCards: [],
    turn: null,
    scores: [0, 0, 0, 0],
    history: [],
    nextMultiplier: 1,
    ready: [],
    version: 0,
  };
}

export const playedHands = (state: Pick<GameState, 'history'>) => state.history.filter((h) => h.contract).length;

export function applyAction(state: GameState, action: Action, random: () => number = Math.random): GameState {
  const next = reduce(state, action, random);
  return { ...next, version: state.version + 1 };
}

function reduce(state: GameState, action: Action, random: () => number): GameState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'lobby' && state.phase !== 'gameOver') throw new IllegalAction('Game already running');
      const dealer = Math.floor(random() * 4) as Seat;
      return startHand({ ...state, scores: [0, 0, 0, 0], history: [], nextMultiplier: 1, handNo: 0 }, dealer, random);
    }
    case 'bid':
      return applyBid(state, action.seat, action.bid);
    case 'play':
      return applyPlay(state, action.seat, action.card);
    case 'collect':
      return collectTrick(state);
    case 'nextHand': {
      if (state.phase !== 'handEnd') throw new IllegalAction('Hand not finished');
      const { hands } = state.settings;
      if (hands > 0 && playedHands(state) >= hands) return { ...state, phase: 'gameOver', turn: null, ready: [] };
      const last = state.history[state.history.length - 1];
      // Everybody passed: the same dealer deals again.
      const dealer = last && !last.contract ? state.dealer : nextSeat(state.dealer);
      return startHand(state, dealer, random);
    }
  }
}

function startHand(state: GameState, dealer: Seat, random: () => number): GameState {
  const hands = deal(dealer, random);
  const troel = findTroel(hands);
  const bidding: Bidding = {
    turn: null,
    passed: [false, false, false, false],
    high: troel ? { type: 'troel', suit: troel.trump, declarers: [troel.seat, troel.partner] } : null,
    log: troel ? [{ seat: troel.seat, bid: { kind: 'troel', suit: troel.trump } }] : [],
    askerDecision: false,
    troel,
  };
  bidding.turn = nextBidder(bidding, dealer);
  return {
    ...state,
    phase: 'bidding',
    dealer,
    handNo: state.handNo + 1,
    hands,
    bidding,
    contract: null,
    trick: null,
    lastTrick: null,
    tricksPlayed: 0,
    tricksWon: [0, 0, 0, 0],
    playedCards: [],
    turn: null,
    ready: [],
  };
}

export function findTroel(hands: Card[][]): Troel | null {
  for (const seat of SEATS) {
    const aces = hands[seat].filter((c) => rankOf(c) === 14);
    if (aces.length < 3) continue;
    let partnerCard: Card;
    let trump: Suit;
    if (aces.length === 3) {
      trump = (['H', 'D', 'C', 'S'] as Suit[]).find((s) => !aces.some((a) => suitOf(a) === s))!;
      partnerCard = makeCard(trump, 14);
    } else {
      // Four aces: hearts are trump, the partner holds the highest heart the troel player is missing.
      trump = 'H';
      let rank = 13;
      while (hands[seat].includes(makeCard('H', rank))) rank--;
      partnerCard = makeCard('H', rank);
    }
    const partner = SEATS.find((s) => hands[s].includes(partnerCard))!;
    return { seat, partner, aces: aces.length, trump, partnerCard };
  }
  return null;
}

function nextBidder(b: Bidding, from: Seat): Seat | null {
  for (let i = 1; i <= 4; i++) {
    const s = nextSeat(from, i);
    if (!b.passed[s] && !b.high?.declarers.includes(s)) return s;
  }
  return null;
}

const highRank = (high: HighBid | null): number => {
  if (!high) return 0;
  if (high.type === 'ask') return CONTRACTS.samen.rank;
  return CONTRACTS[high.type].rank;
};

/** Either the full state or a player's view of it. */
export type StateLike = Omit<GameState, 'hands'> & { hands: readonly (readonly Card[] | null)[] };

export function legalBids(state: StateLike, seat: Seat): BidAction[] {
  const b = state.bidding;
  if (state.phase !== 'bidding' || !b || b.turn !== seat) return [];
  if (b.askerDecision) return [{ kind: 'alone' }, { kind: 'pass' }];

  const bids: BidAction[] = [{ kind: 'pass' }];
  const high = b.high;
  if (!high) for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) bids.push({ kind: 'ask', suit });
  if (high && !high.declarers.includes(seat)) {
    if (high.type === 'ask') bids.push({ kind: 'join' });
    else if (high.type !== 'samen' && high.type !== 'troel' && CONTRACTS[high.type].joinable) bids.push({ kind: 'join' });
  }
  const rank = highRank(high);
  for (const contract of ['piccolo', 'abondance', 'miserie', 'openMiserie', 'soloSlim'] as DirectBid[]) {
    if (contract === 'piccolo' && !state.settings.piccolo) continue;
    if (CONTRACTS[contract].rank <= rank) continue;
    if (CONTRACTS[contract].hasTrump) {
      for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) bids.push({ kind: 'bid', contract, suit });
    } else {
      bids.push({ kind: 'bid', contract });
    }
  }
  return bids;
}

const sameBid = (a: BidAction, b: BidAction) =>
  a.kind === b.kind &&
  (a.kind !== 'ask' || a.suit === (b as typeof a).suit) &&
  (a.kind !== 'bid' || (a.contract === (b as typeof a).contract && a.suit === (b as typeof a).suit));

function applyBid(state: GameState, seat: Seat, bid: BidAction): GameState {
  if (!legalBids(state, seat).some((l) => sameBid(l, bid))) throw new IllegalAction('Illegal bid');
  const old = state.bidding!;
  const b: Bidding = { ...old, passed: old.passed.slice(), log: [...old.log, { seat, bid }] };

  if (old.askerDecision) {
    if (bid.kind === 'pass') return allPassed(state, b);
    return startPlay(state, b, { type: 'alleen', trump: old.high!.suit, declarers: [seat], multiplier: state.nextMultiplier });
  }

  switch (bid.kind) {
    case 'pass':
      b.passed[seat] = true;
      break;
    case 'ask':
      b.high = { type: 'ask', suit: bid.suit, declarers: [seat] };
      break;
    case 'join': {
      const high = old.high!;
      b.high =
        high.type === 'ask'
          ? { type: 'samen', suit: high.suit, declarers: [...high.declarers, seat] }
          : { ...high, declarers: [...high.declarers, seat] };
      break;
    }
    case 'bid':
      b.high = { type: bid.contract, suit: CONTRACTS[bid.contract].hasTrump ? bid.suit! : null, declarers: [seat] };
      break;
    case 'alone':
      throw new IllegalAction('Illegal bid');
  }

  b.turn = nextBidder(b, seat);
  if (b.turn !== null) return { ...state, bidding: b };

  // Auction over.
  const high = b.high;
  if (!high) return allPassed(state, b);
  if (high.type === 'ask') return { ...state, bidding: { ...b, askerDecision: true, turn: high.declarers[0] } };
  return startPlay(state, b, {
    type: high.type as ContractType,
    trump: high.suit,
    declarers: high.declarers,
    multiplier: state.nextMultiplier,
  });
}

function allPassed(state: GameState, bidding: Bidding): GameState {
  const result: HandResult = {
    handNo: state.handNo,
    dealer: state.dealer,
    contract: null,
    tricksWon: [0, 0, 0, 0],
    outcomes: [],
    deltas: [0, 0, 0, 0],
  };
  return {
    ...state,
    phase: 'handEnd',
    bidding: { ...bidding, turn: null },
    history: [...state.history, result],
    nextMultiplier: state.settings.passDoubles ? 2 : 1,
    turn: null,
  };
}

function startPlay(state: GameState, bidding: Bidding, contract: Contract): GameState {
  const leader = CONTRACTS[contract.type].declarerLeads ? contract.declarers[0] : nextSeat(state.dealer);
  return {
    ...state,
    phase: 'playing',
    bidding: { ...bidding, turn: null },
    contract,
    trick: { leader, cards: [], winner: null },
    turn: leader,
  };
}

export function legalCards(state: StateLike, seat: Seat): Card[] {
  if (state.phase !== 'playing' || state.turn !== seat || !state.trick) return [];
  const hand = [...(state.hands[seat] ?? [])];
  if (state.trick.cards.length === 0) return hand;
  const led = suitOf(state.trick.cards[0]);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand;
}

function applyPlay(state: GameState, seat: Seat, card: Card): GameState {
  if (!legalCards(state, seat).includes(card)) throw new IllegalAction('Illegal card');
  const trick = state.trick!;
  const cards = [...trick.cards, card];
  const hands = state.hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h));
  const playedCards = [...state.playedCards, card];
  if (cards.length < 4) {
    return { ...state, hands, playedCards, trick: { ...trick, cards }, turn: nextSeat(seat) };
  }
  const winner = nextSeat(trick.leader, winningIndex(cards, state.contract!.trump));
  const tricksWon = state.tricksWon.slice();
  tricksWon[winner]++;
  return {
    ...state,
    hands,
    playedCards,
    trick: { ...trick, cards, winner },
    tricksWon,
    tricksPlayed: state.tricksPlayed + 1,
    turn: null,
  };
}

function collectTrick(state: GameState): GameState {
  const trick = state.trick;
  if (state.phase !== 'playing' || !trick || trick.winner === null) throw new IllegalAction('No trick to collect');
  const contract = state.contract!;
  if (!outcomeDecided(contract, state.tricksWon, state.tricksPlayed)) {
    return { ...state, lastTrick: trick, trick: { leader: trick.winner, cards: [], winner: null }, turn: trick.winner };
  }
  const { deltas, outcomes } = scoreContract(contract, state.tricksWon);
  const result: HandResult = {
    handNo: state.handNo,
    dealer: state.dealer,
    contract,
    tricksWon: state.tricksWon,
    outcomes,
    deltas,
  };
  return {
    ...state,
    phase: 'handEnd',
    lastTrick: trick,
    trick: null,
    turn: null,
    scores: state.scores.map((s, i) => s + deltas[i]),
    history: [...state.history, result],
    nextMultiplier: 1,
  };
}

/** Seats on the declaring side (for team contracts both partners, otherwise the declarers). */
export const isDeclarer = (contract: Contract | null, seat: Seat) => !!contract && contract.declarers.includes(seat);
