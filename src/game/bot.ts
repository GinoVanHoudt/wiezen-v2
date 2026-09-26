import { type Card, type Seat, type Suit, SUITS, beats, fullDeck, rankOf, suitOf, winningIndex, nextSeat } from './cards';
import { type Action, type BidAction, legalBids, legalCards } from './engine';
import { CONTRACTS } from './rules';
import type { PlayerView } from './view';

/** Decides the bot's move for `view.seat`, or null when it isn't this seat's turn. */
export function botAction(view: PlayerView): Action | null {
  const seat = view.seat;
  if (view.phase === 'bidding' && view.bidding?.turn === seat) {
    return { type: 'bid', seat, bid: chooseBid(view) };
  }
  if (view.phase === 'playing' && view.turn === seat) {
    return { type: 'play', seat, card: chooseCard(view) };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Hand evaluation
// ---------------------------------------------------------------------------------------------

const ranksIn = (hand: Card[], suit: Suit) =>
  hand.filter((c) => suitOf(c) === suit).map(rankOf).sort((a, b) => b - a);

/** Rough number of tricks this hand takes on its own with `trump` as trump suit. */
export function estimateTricks(hand: Card[], trump: Suit): number {
  let tricks = 0;
  const trumps = ranksIn(hand, trump);
  const tl = trumps.length;
  if (tl >= 4) {
    const missingTop = [14, 13, 12].filter((r) => !trumps.includes(r)).length;
    tricks += Math.max(0, tl - 0.8 * missingTop);
  } else {
    if (trumps.includes(14)) tricks += 1;
    if (trumps.includes(13)) tricks += tl >= 2 ? 0.8 : 0.3;
    if (trumps.includes(12)) tricks += tl >= 3 ? 0.5 : 0.1;
  }
  for (const s of SUITS) {
    if (s === trump) continue;
    const ranks = ranksIn(hand, s);
    const l = ranks.length;
    const a = ranks.includes(14);
    const k = ranks.includes(13);
    if (a) tricks += l <= 6 ? 1 : 0.8;
    if (k) tricks += a ? 0.9 : l >= 2 ? 0.5 : 0.1;
    if (ranks.includes(12)) tricks += a && k ? 0.6 : l >= 3 ? 0.25 : 0;
    // Short side suits let spare trumps ruff.
    if (tl >= 3 && l === 0) tricks += 0.6;
    if (tl >= 3 && l === 1) tricks += 0.25;
  }
  return tricks;
}

function bestSuit(hand: Card[]): { suit: Suit; tricks: number } {
  let best = { suit: 'H' as Suit, tricks: -1 };
  for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) {
    const tricks = estimateTricks(hand, suit) + ranksIn(hand, suit).length * 0.01;
    if (tricks > best.tricks) best = { suit, tricks };
  }
  return best;
}

/**
 * How likely this hand is to be forced to take a trick without trump.
 * The k-th lowest card of a suit should stay under a threshold; every point above it adds risk.
 */
export function miserieRisk(hand: Card[], base = 3): number {
  let risk = 0;
  let voids = 0;
  for (const s of SUITS) {
    const ranks = ranksIn(hand, s).reverse();
    if (!ranks.length) voids++;
    ranks.forEach((r, i) => {
      risk += Math.max(0, r - (base + 2 * (i + 1)));
    });
  }
  return Math.max(0, risk - voids);
}

const MISERIE_OK = (hand: Card[]) => miserieRisk(hand) <= 1;
const OPEN_MISERIE_OK = (hand: Card[]) => miserieRisk(hand, 2) === 0;

function piccoloCandidate(hand: Card[]): boolean {
  const aces = hand.filter((c) => rankOf(c) === 14);
  if (aces.length !== 1) return false;
  return miserieRisk(hand.filter((c) => c !== aces[0])) <= 1;
}

function chooseBid(view: PlayerView): BidAction {
  const hand = view.hands[view.seat] ?? [];
  const legal = legalBids(view, view.seat);
  const has = (pred: (b: BidAction) => boolean) => legal.find(pred);
  const b = view.bidding!;
  const best = bestSuit(hand);

  if (b.askerDecision) {
    return estimateTricks(hand, b.high!.suit!) >= 4.9 ? { kind: 'alone' } : { kind: 'pass' };
  }

  const options: BidAction[] = [];
  if (best.tricks >= 12.5) options.push({ kind: 'bid', contract: 'soloSlim', suit: best.suit });
  if (OPEN_MISERIE_OK(hand)) options.push({ kind: 'bid', contract: 'openMiserie' });
  if (MISERIE_OK(hand)) options.push({ kind: 'bid', contract: 'miserie' });
  if (best.tricks >= 8.8) options.push({ kind: 'bid', contract: 'abondance', suit: best.suit });
  if (piccoloCandidate(hand)) options.push({ kind: 'bid', contract: 'piccolo' });

  // Join a miserie/piccolo that suits this hand as well.
  const high = b.high;
  if (high && high.type !== 'ask' && high.type !== 'samen' && high.type !== 'troel' && CONTRACTS[high.type].joinable) {
    const fits =
      (high.type === 'miserie' && MISERIE_OK(hand)) ||
      (high.type === 'openMiserie' && OPEN_MISERIE_OK(hand)) ||
      (high.type === 'piccolo' && piccoloCandidate(hand));
    const join = has((l) => l.kind === 'join');
    if (fits && join) return join;
  }

  for (const option of options) {
    const found = has(
      (l) => l.kind === 'bid' && option.kind === 'bid' && l.contract === option.contract && l.suit === option.suit,
    );
    if (found) return found;
  }

  if (high?.type === 'ask') {
    const join = has((l) => l.kind === 'join');
    if (join && estimateTricks(hand, high.suit!) >= 2.8) return join;
  }
  if (!high && best.tricks >= 4.5 && ranksIn(hand, best.suit).length >= 4) {
    return { kind: 'ask', suit: best.suit };
  }
  return { kind: 'pass' };
}

// ---------------------------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------------------------

interface Ctx {
  view: PlayerView;
  me: Seat;
  hand: Card[];
  legal: Card[];
  trump: Suit | null;
  trick: Card[];
  leader: Seat;
  unseen: Set<Card>;
}

const seatOfTrickCard = (leader: Seat, index: number) => nextSeat(leader, index);
const lowest = (cards: Card[]) => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
const highest = (cards: Card[]) => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));

function chooseCard(view: PlayerView): Card {
  const me = view.seat;
  const hand = view.hands[me] ?? [];
  const legal = legalCards(view, me);
  if (legal.length === 1) return legal[0];
  const trick = view.trick!;
  const known = new Set<Card>([...hand, ...view.playedCards, ...trick.cards]);
  view.hands.forEach((h, i) => i !== me && h?.forEach((c) => known.add(c)));
  const ctx: Ctx = {
    view,
    me,
    hand,
    legal,
    trump: view.contract!.trump,
    trick: trick.cards,
    leader: trick.leader,
    unseen: new Set(fullDeck().filter((c) => !known.has(c))),
  };
  const contract = view.contract!;
  const type = contract.type;
  if (type === 'miserie' || type === 'openMiserie' || type === 'piccolo') {
    const declarer = contract.declarers.includes(me);
    if (type === 'piccolo' && declarer && view.tricksWon[me] === 0) return piccoloGrab(ctx);
    return declarer ? duck(ctx) : catchMiserie(ctx);
  }
  return playForTricks(ctx);
}

/** Whether nobody else can still hold a higher card of this suit. */
const isTop = (ctx: Ctx, card: Card) => {
  const s = suitOf(card);
  const r = rankOf(card);
  for (const c of ctx.unseen) if (suitOf(c) === s && rankOf(c) > r) return false;
  return true;
};

function currentWinner(ctx: Ctx): { seat: Seat; card: Card } | null {
  if (!ctx.trick.length) return null;
  const i = winningIndex(ctx.trick, ctx.trump);
  return { seat: seatOfTrickCard(ctx.leader, i), card: ctx.trick[i] };
}

function sameSide(ctx: Ctx, a: Seat, b: Seat): boolean {
  const declarers = ctx.view.contract!.declarers;
  return declarers.includes(a) === declarers.includes(b);
}

/** Lowest card to throw away when we can't (or don't want to) win: keep trumps and winners. */
function discard(ctx: Ctx, cards: Card[]): Card {
  const nonTrump = cards.filter((c) => suitOf(c) !== ctx.trump);
  const pool = nonTrump.length ? nonTrump : cards;
  const losers = pool.filter((c) => !isTop(ctx, c));
  return lowest(losers.length ? losers : pool);
}

function playForTricks(ctx: Ctx): Card {
  const { legal, trump, me } = ctx;
  const declaring = ctx.view.contract!.declarers.includes(me);

  if (!ctx.trick.length) {
    const myTrumps = trump ? legal.filter((c) => suitOf(c) === trump) : [];
    const unseenTrumps = trump ? [...ctx.unseen].filter((c) => suitOf(c) === trump).length : 0;
    if (declaring && myTrumps.length >= 2 && unseenTrumps > 0) {
      const top = highest(myTrumps);
      if (isTop(ctx, top)) return top;
      if (myTrumps.length >= 4) return lowest(myTrumps);
    }
    const winners = legal.filter((c) => suitOf(c) !== trump && isTop(ctx, c));
    if (winners.length) return highest(winners);
    // Low card from the longest side suit.
    const side = legal.filter((c) => suitOf(c) !== trump);
    const pool = side.length ? side : legal;
    const counts = new Map<Suit, number>();
    pool.forEach((c) => counts.set(suitOf(c), (counts.get(suitOf(c)) ?? 0) + 1));
    const longest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return lowest(pool.filter((c) => suitOf(c) === longest));
  }

  const led = suitOf(ctx.trick[0]);
  const win = currentWinner(ctx)!;
  const last = ctx.trick.length === 3;
  const beating = legal.filter((c) => beats(c, win.card, led, trump));

  if (sameSide(ctx, win.seat, me) && (last || isTop(ctx, win.card) || suitOf(win.card) === trump)) {
    return discard(ctx, legal);
  }
  if (!beating.length) return discard(ctx, legal);
  if (last) return lowest(beating);
  const following = suitOf(legal[0]) === led;
  if (following) {
    const safe = beating.filter((c) => isTop(ctx, c));
    if (safe.length) return lowest(safe);
    return sameSide(ctx, win.seat, me) ? discard(ctx, legal) : lowest(legal);
  }
  // Void in the led suit: ruff with the smallest winning trump.
  const ruffs = beating.filter((c) => suitOf(c) === trump);
  if (ruffs.length && !sameSide(ctx, win.seat, me)) return lowest(ruffs);
  return discard(ctx, legal);
}

/** Miserie declarer: never win a trick if it can be avoided. */
function duck(ctx: Ctx): Card {
  const { legal } = ctx;
  if (!ctx.trick.length) return lowest(legal);
  const led = suitOf(ctx.trick[0]);
  const win = currentWinner(ctx)!;
  const following = suitOf(legal[0]) === led;
  if (!following) return highest(legal); // get rid of the most dangerous card
  const under = legal.filter((c) => !beats(c, win.card, led, null));
  if (under.length) return highest(under);
  return ctx.trick.length === 3 ? highest(legal) : lowest(legal);
}

/** Piccolo declarer without a trick yet: take exactly one, preferably with a sure winner. */
function piccoloGrab(ctx: Ctx): Card {
  const { legal } = ctx;
  if (!ctx.trick.length) {
    const tops = legal.filter((c) => isTop(ctx, c) && rankOf(c) >= 12);
    return tops.length ? highest(tops) : lowest(legal);
  }
  const led = suitOf(ctx.trick[0]);
  const win = currentWinner(ctx)!;
  const winners = legal.filter((c) => beats(c, win.card, led, null) && (ctx.trick.length === 3 || isTop(ctx, c)));
  const remaining = 13 - ctx.view.tricksPlayed;
  // Grab it with a high card when safe; late in the hand take any trick we can get.
  if (winners.length && (rankOf(highest(winners)) >= 12 || remaining <= 4)) return highest(winners);
  return duck(ctx);
}

/** Opponents of miserie/piccolo: make a declarer who is still on track win a trick. */
function catchMiserie(ctx: Ctx): Card {
  const { legal, view } = ctx;
  const contract = view.contract!;
  const limit = CONTRACTS[contract.type].target;
  const targets = contract.declarers.filter((s) => view.tricksWon[s] <= limit);
  if (contract.type === 'piccolo' && targets.every((s) => view.tricksWon[s] === 0)) {
    return playForTricks(ctx);
  }

  if (!ctx.trick.length) {
    // Open miserie: lead the suit where our low card best undercuts the declarer's lowest card.
    let bestCard: Card | null = null;
    let bestGap = -Infinity;
    for (const c of legal) {
      for (const d of targets) {
        const dh = view.hands[d];
        if (!dh) continue;
        const theirs = dh.filter((x) => suitOf(x) === suitOf(c));
        if (!theirs.length) continue;
        const gap = rankOf(lowest(theirs)) - rankOf(c);
        if (gap > bestGap) {
          bestGap = gap;
          bestCard = c;
        }
      }
    }
    if (bestCard && bestGap > 0) return bestCard;
    return lowest(legal);
  }

  const led = suitOf(ctx.trick[0]);
  const win = currentWinner(ctx)!;
  const following = suitOf(legal[0]) === led;
  const declarerWinning = targets.includes(win.seat);
  const declarerStillToPlay = targets.some((d) => {
    for (let i = ctx.trick.length; i < 4; i++) if (seatOfTrickCard(ctx.leader, i) === d && d !== ctx.me) return true;
    return false;
  });

  if (!following) return highest(legal);
  if (declarerStillToPlay && !declarerWinning) return lowest(legal);
  // Stay under the current winner, shedding the highest card that still does.
  const under = legal.filter((c) => !beats(c, win.card, led, null));
  return under.length ? highest(under) : lowest(legal);
}
