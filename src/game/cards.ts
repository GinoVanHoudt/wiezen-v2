/** Cards are two-character strings: suit + rank, e.g. "HA" (ace of hearts), "ST" (ten of spades). */
export type Suit = 'S' | 'H' | 'C' | 'D';
export type Card = string;
export type Seat = 0 | 1 | 2 | 3;

export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];
export const RANK_CHARS = '23456789TJQKA';
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export const suitOf = (card: Card): Suit => card[0] as Suit;
/** 2..14 (ace high). */
export const rankOf = (card: Card): number => RANK_CHARS.indexOf(card[1]) + 2;
export const makeCard = (suit: Suit, rank: number): Card => suit + RANK_CHARS[rank - 2];

export const isRed = (suit: Suit) => suit === 'H' || suit === 'D';

export const nextSeat = (seat: Seat, steps = 1): Seat => (((seat + steps) % 4) + 4) % 4 as Seat;

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push(makeCard(s, r));
  return deck;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deals 4-4-5 clockwise, starting left of the dealer, like at a real table. */
export function deal(dealer: Seat, random: () => number = Math.random): Card[][] {
  const deck = shuffle(fullDeck(), random);
  const hands: Card[][] = [[], [], [], []];
  let pos = 0;
  for (const packet of [4, 4, 5]) {
    for (let i = 1; i <= 4; i++) {
      const seat = nextSeat(dealer, i);
      hands[seat].push(...deck.slice(pos, pos + packet));
      pos += packet;
    }
  }
  return hands.map(sortHand);
}

/** Display order: alternating colours (♠ ♥ ♣ ♦), high to low within a suit. */
export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => {
    const sa = SUITS.indexOf(suitOf(a));
    const sb = SUITS.indexOf(suitOf(b));
    return sa !== sb ? sa - sb : rankOf(b) - rankOf(a);
  });
}

/** Index in `cards` of the winning card, given the suit led (the first card) and the trump suit. */
export function winningIndex(cards: Card[], trump: Suit | null): number {
  const led = suitOf(cards[0]);
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    if (beats(cards[i], cards[best], led, trump)) best = i;
  }
  return best;
}

/** Whether `a` beats `b` when `led` was led. */
export function beats(a: Card, b: Card, led: Suit, trump: Suit | null): boolean {
  const sa = suitOf(a);
  const sb = suitOf(b);
  if (sa === sb) return rankOf(a) > rankOf(b);
  if (trump && sa === trump) return true;
  if (trump && sb === trump) return false;
  return sa === led && sb !== led;
}
