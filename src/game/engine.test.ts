import { describe, expect, it } from 'vitest';
import { type Card, type Seat, deal, fullDeck, winningIndex } from './cards';
import { botAction } from './bot';
import {
  type BidAction,
  type GameState,
  type Player,
  applyAction,
  createGame,
  findTroel,
  legalBids,
  legalCards,
} from './engine';
import { DEFAULT_SETTINGS, type Contract, outcomeDecided, scoreContract } from './rules';
import { viewFor } from './view';

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bots = (): Player[] =>
  [0, 1, 2, 3].map((i) => ({ name: `Bot ${i}`, bot: true, connected: true, id: null }));

function playGame(seed: number, hands = 16) {
  const random = rng(seed);
  let state: GameState = createGame(bots(), { ...DEFAULT_SETTINGS, hands });
  state = applyAction(state, { type: 'start' }, random);
  let steps = 0;
  while (state.phase !== 'gameOver') {
    if (++steps > 20000) throw new Error('game did not finish');
    if (state.phase === 'handEnd') {
      state = applyAction(state, { type: 'nextHand' }, random);
      continue;
    }
    if (state.phase === 'playing' && state.trick?.winner != null) {
      state = applyAction(state, { type: 'collect' }, random);
      continue;
    }
    const seat = (state.phase === 'bidding' ? state.bidding!.turn : state.turn) as Seat;
    const action = botAction(viewFor(state, seat));
    expect(action).not.toBeNull();
    state = applyAction(state, action!, random);
  }
  return state;
}

describe('cards', () => {
  it('deals 13 unique cards to every player', () => {
    const hands = deal(0, rng(1));
    expect(hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(hands.flat()).size).toBe(52);
    expect(new Set(fullDeck()).size).toBe(52);
  });

  it('determines the trick winner with and without trump', () => {
    expect(winningIndex(['H5', 'HK', 'S2', 'HA'], null)).toBe(3);
    expect(winningIndex(['H5', 'HK', 'S2', 'HA'], 'S')).toBe(2);
    expect(winningIndex(['H5', 'D9', 'C2', 'H4'], 'S')).toBe(0);
    expect(winningIndex(['H5', 'ST', 'SJ', 'HA'], 'S')).toBe(2);
  });
});

describe('scoring', () => {
  const c = (type: Contract['type'], declarers: Seat[], multiplier = 1): Contract => ({
    type,
    trump: 'H',
    declarers,
    multiplier,
  });

  it('scores samen with overtricks, undertricks and all 13 tricks', () => {
    expect(scoreContract(c('samen', [0, 2]), [5, 2, 4, 2]).deltas).toEqual([3, -3, 3, -3]);
    expect(scoreContract(c('samen', [0, 2]), [3, 4, 3, 3]).deltas).toEqual([-4, 4, -4, 4]);
    expect(scoreContract(c('samen', [0, 2]), [7, 0, 6, 0]).deltas).toEqual([14, -14, 14, -14]);
  });

  it('scores solo contracts three times for the declarer', () => {
    expect(scoreContract(c('alleen', [1]), [3, 6, 2, 2]).deltas).toEqual([-4, 12, -4, -4]);
    expect(scoreContract(c('abondance', [3]), [1, 1, 2, 9]).deltas).toEqual([-6, -6, -6, 18]);
    expect(scoreContract(c('piccolo', [2]), [4, 4, 1, 4]).deltas).toEqual([-5, -5, 15, -5]);
    expect(scoreContract(c('piccolo', [2]), [4, 4, 2, 3]).deltas).toEqual([5, 5, -15, 5]);
  });

  it('settles several miserie players separately', () => {
    // Seat 0 makes it, seat 1 fails.
    const { deltas } = scoreContract(c('miserie', [0, 1]), [0, 3, 5, 5]);
    expect(deltas).toEqual([21 + 7, -7 - 21, -7 + 7, -7 + 7]);
    expect(deltas.reduce((a, b) => a + b)).toBe(0);
  });

  it('doubles after an all-pass round', () => {
    expect(scoreContract(c('miserie', [0], 2), [0, 5, 4, 4]).deltas).toEqual([42, -14, -14, -14]);
  });

  it('stops early once a fixed contract is decided', () => {
    expect(outcomeDecided(c('miserie', [0]), [1, 0, 0, 0], 1)).toBe(true);
    expect(outcomeDecided(c('miserie', [0, 1]), [1, 0, 0, 0], 1)).toBe(false);
    expect(outcomeDecided(c('abondance', [0]), [9, 0, 0, 0], 9)).toBe(true);
    expect(outcomeDecided(c('abondance', [0]), [3, 5, 0, 0], 8)).toBe(true);
    expect(outcomeDecided(c('samen', [0, 2]), [8, 0, 0, 0], 8)).toBe(false);
  });
});

describe('troel', () => {
  it('pairs the three-ace holder with the fourth ace', () => {
    const hands: Card[][] = [['HA', 'DA', 'CA'], ['SA'], [], []];
    expect(findTroel(hands)).toMatchObject({ seat: 0, partner: 1, trump: 'S', aces: 3 });
  });

  it('with four aces hearts are trump and the highest missing heart is partner', () => {
    const hands: Card[][] = [['HA', 'DA', 'CA', 'SA', 'HK'], ['H2'], ['HQ'], []];
    expect(findTroel(hands)).toMatchObject({ seat: 0, partner: 2, trump: 'H', partnerCard: 'HQ' });
  });
});

describe('bidding', () => {
  function started(seed: number) {
    let state = createGame(bots(), DEFAULT_SETTINGS);
    state = applyAction(state, { type: 'start' }, rng(seed));
    return state;
  }

  it('lets the first player ask and a later player join', () => {
    let seed = 1;
    let state = started(seed);
    while (state.bidding!.troel) state = started(++seed);
    const first = state.bidding!.turn!;
    state = applyAction(state, { type: 'bid', seat: first, bid: { kind: 'ask', suit: 'H' } });
    const second = state.bidding!.turn!;
    expect(legalBids(state, second)).toContainEqual({ kind: 'join' });
    state = applyAction(state, { type: 'bid', seat: second, bid: { kind: 'join' } });
    state = applyAction(state, { type: 'bid', seat: state.bidding!.turn!, bid: { kind: 'pass' } });
    state = applyAction(state, { type: 'bid', seat: state.bidding!.turn!, bid: { kind: 'pass' } });
    expect(state.phase).toBe('playing');
    expect(state.contract).toMatchObject({ type: 'samen', trump: 'H', declarers: [first, second] });
  });

  it('offers the unanswered asker to play alone', () => {
    let seed = 1;
    let state = started(seed);
    while (state.bidding!.troel) state = started(++seed);
    const first = state.bidding!.turn!;
    state = applyAction(state, { type: 'bid', seat: first, bid: { kind: 'ask', suit: 'S' } });
    for (let i = 0; i < 3; i++) state = applyAction(state, { type: 'bid', seat: state.bidding!.turn!, bid: { kind: 'pass' } });
    expect(state.bidding!.turn).toBe(first);
    expect(legalBids(state, first)).toEqual([{ kind: 'alone' }, { kind: 'pass' }]);
    state = applyAction(state, { type: 'bid', seat: first, bid: { kind: 'alone' } });
    expect(state.contract).toMatchObject({ type: 'alleen', trump: 'S', declarers: [first] });
  });

  it('redeals with doubled points when everybody passes, and hides piccolo when disabled', () => {
    let seed = 1;
    let state = started(seed);
    while (state.bidding!.troel) state = started(++seed);
    const dealer = state.dealer;
    for (let i = 0; i < 4; i++) state = applyAction(state, { type: 'bid', seat: state.bidding!.turn!, bid: { kind: 'pass' } });
    expect(state.phase).toBe('handEnd');
    expect(state.nextMultiplier).toBe(2);
    state = applyAction(state, { type: 'nextHand' });
    expect(state.dealer).toBe(dealer);

    const noPiccolo = { ...state, settings: { ...state.settings, piccolo: false } };
    const turn = noPiccolo.bidding!.turn;
    if (turn !== null) {
      expect(legalBids(noPiccolo, turn).some((b) => b.kind === 'bid' && b.contract === 'piccolo')).toBe(false);
      expect(legalBids(state, turn).some((b) => b.kind === 'bid' && b.contract === 'piccolo')).toBe(true);
    }
  });

  it('rejects out-of-turn and illegal actions', () => {
    const state = started(3);
    const turn = state.bidding!.turn!;
    const other = ((turn + 1) % 4) as Seat;
    expect(() => applyAction(state, { type: 'bid', seat: other, bid: { kind: 'pass' } })).toThrow();
    expect(() => applyAction(state, { type: 'play', seat: turn, card: state.hands[turn][0] })).toThrow();
  });
});

describe('contracts', () => {
  function fresh(seed: number, wantTroel = false) {
    for (let s = seed; s < seed + 500; s++) {
      const state = applyAction(createGame(bots(), DEFAULT_SETTINGS), { type: 'start' }, rng(s));
      if (!!state.bidding!.troel === wantTroel) return state;
    }
    throw new Error('no suitable deal');
  }
  const bid = (state: GameState, b: BidAction) => applyAction(state, { type: 'bid', seat: state.bidding!.turn!, bid: b });

  it('plays piccolo without trump, led by the player left of the dealer', () => {
    let state = fresh(10);
    const declarer = state.bidding!.turn!;
    state = bid(state, { kind: 'bid', contract: 'piccolo' });
    while (state.phase === 'bidding') state = bid(state, { kind: 'pass' });
    expect(state.contract).toMatchObject({ type: 'piccolo', trump: null, declarers: [declarer] });
    expect(state.turn).toBe((state.dealer + 1) % 4);
  });

  it('lets several players declare misère and settles them separately', () => {
    let state = fresh(20);
    const first = state.bidding!.turn!;
    state = bid(state, { kind: 'bid', contract: 'miserie' });
    const second = state.bidding!.turn!;
    expect(legalBids(state, second)).toContainEqual({ kind: 'join' });
    expect(legalBids(state, second).some((b) => b.kind === 'ask')).toBe(false);
    state = bid(state, { kind: 'join' });
    while (state.phase === 'bidding') state = bid(state, { kind: 'pass' });
    expect(state.contract).toMatchObject({ type: 'miserie', declarers: [first, second] });
  });

  it('gives an overbid asker another turn', () => {
    let state = fresh(30);
    const asker = state.bidding!.turn!;
    state = bid(state, { kind: 'ask', suit: 'H' });
    state = bid(state, { kind: 'bid', contract: 'miserie' });
    state = bid(state, { kind: 'pass' });
    state = bid(state, { kind: 'pass' });
    expect(state.bidding!.turn).toBe(asker);
    const legal = legalBids(state, asker);
    expect(legal).toContainEqual({ kind: 'join' });
    expect(legal).toContainEqual({ kind: 'bid', contract: 'openMiserie' });
    expect(legal.some((b) => b.kind === 'ask' || (b.kind === 'bid' && b.contract === 'abondance'))).toBe(false);
  });

  it('lets the abondance declarer lead and choose trump', () => {
    let state = fresh(40);
    const declarer = state.bidding!.turn!;
    state = bid(state, { kind: 'bid', contract: 'abondance', suit: 'C' });
    while (state.phase === 'bidding') state = bid(state, { kind: 'pass' });
    expect(state.contract).toMatchObject({ type: 'abondance', trump: 'C', declarers: [declarer] });
    expect(state.turn).toBe(declarer);
  });

  it('starts a troel automatically; passing confirms it, a higher bid overrides it', () => {
    const state = fresh(1, true);
    const troel = state.bidding!.troel!;
    expect(state.bidding!.high).toMatchObject({ type: 'troel', declarers: [troel.seat, troel.partner] });
    expect(state.hands[troel.partner]).toContain(troel.partnerCard);
    expect(legalBids(state, state.bidding!.turn!).some((b) => b.kind === 'ask')).toBe(false);

    let passed = state;
    while (passed.phase === 'bidding') passed = bid(passed, { kind: 'pass' });
    expect(passed.contract).toMatchObject({ type: 'troel', trump: troel.trump });

    const over = bid(state, { kind: 'bid', contract: 'miserie' });
    expect(over.bidding!.high!.type).toBe('miserie');
    // The troel players are free to speak again.
    let s = over;
    const spoke = new Set<number>();
    while (s.phase === 'bidding') {
      spoke.add(s.bidding!.turn!);
      s = bid(s, { kind: 'pass' });
    }
    expect(spoke.has(troel.seat)).toBe(true);
    expect(s.contract!.type).toBe('miserie');
  });

  it('reveals open misère hands to everybody, and only those', () => {
    let state = fresh(50);
    const declarer = state.bidding!.turn!;
    state = bid(state, { kind: 'bid', contract: 'openMiserie' });
    while (state.phase === 'bidding') state = bid(state, { kind: 'pass' });
    const other = ((declarer + 1) % 4) as Seat;
    const view = viewFor(state, other);
    expect(view.hands[declarer]).toEqual(state.hands[declarer]);
    expect(view.hands[other]).toEqual(state.hands[other]);
    expect(view.hands.filter((h) => h === null)).toHaveLength(2);
  });

  it('never shows other hands in a normal view', () => {
    const state = fresh(60);
    const view = viewFor(state, 2);
    expect(view.hands.map((h) => h !== null)).toEqual([false, false, true, false]);
    expect(view.handSizes).toEqual([13, 13, 13, 13]);
  });
});

describe('play', () => {
  it('forces following suit', () => {
    let state = playGame(7, 1);
    expect(state.phase).toBe('gameOver');
    // Rebuild a playing state by hand.
    state = createGame(bots(), DEFAULT_SETTINGS);
    state = {
      ...state,
      phase: 'playing',
      hands: [['H2', 'S3'], ['H4', 'D5'], ['C6', 'C7'], ['D8', 'D9']],
      contract: { type: 'samen', trump: 'S', declarers: [0, 2], multiplier: 1 },
      trick: { leader: 0, cards: ['H3'], winner: null },
      turn: 1,
    };
    expect(legalCards(state, 1)).toEqual(['H4']);
    expect(legalCards(state, 0)).toEqual([]);
  });

  it('plays complete bot games with a zero-sum score', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = playGame(seed);
      expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
      expect(state.history.filter((h) => h.contract).length).toBe(16);
      for (const h of state.history) expect(h.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('bots use a variety of contracts', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const h of playGame(seed).history) seen.add(h.contract?.type ?? 'pass');
    }
    for (const t of ['samen', 'alleen', 'miserie', 'abondance', 'pass']) expect(seen).toContain(t);
  });
});
