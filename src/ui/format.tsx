import { type Card, type Seat, type Suit, isRed, rankOf, suitOf } from '../game/cards';
import type { BidLogEntry, HighBid } from '../game/engine';
import { CONTRACTS, type Contract } from '../game/rules';
import type { T, TKey } from '../i18n';

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

export function SuitIcon({ suit, className = '' }: { suit: Suit; className?: string }) {
  return <span className={`suit-icon ${isRed(suit) ? 'red' : 'black'} ${className}`}>{SUIT_SYMBOL[suit]}</span>;
}

export function rankLabel(card: Card, t: T): string {
  const r = rankOf(card);
  return r >= 11 ? t(`rank.${r}` as TKey) : String(r);
}

export const cardLabel = (card: Card, t: T) => `${SUIT_SYMBOL[suitOf(card)]}${rankLabel(card, t)}`;

export const contractName = (type: Contract['type'] | HighBid['type'], t: T) => t(`contract.${type}` as TKey);

/** Contract name for the role tags at the table, where long names don't fit. */
export const shortContractName = (type: Contract['type'], t: T) =>
  type === 'samen' ? t('short.samen') : contractName(type, t);

/** Short text for a bid in the speech bubbles and bidding log. */
export function BidText({ entry, t }: { entry: BidLogEntry; t: T }) {
  const bid = entry.bid;
  switch (bid.kind) {
    case 'pass':
      return <>{t('pass')}</>;
    case 'ask':
      return (
        <>
          {t('ask')} <SuitIcon suit={bid.suit} />
        </>
      );
    case 'join':
      return <>{t('joinAsk')}</>;
    case 'alone':
      return <>{t('alone')}</>;
    case 'troel':
      return (
        <>
          {t('contract.troel')} <SuitIcon suit={bid.suit} />
        </>
      );
    case 'bid':
      return (
        <>
          {contractName(bid.contract, t)} {bid.suit && <SuitIcon suit={bid.suit} />}
        </>
      );
  }
}

export function HighBidText({ high, t }: { high: HighBid; t: T }) {
  return (
    <>
      {high.type === 'ask' ? t('ask') : contractName(high.type, t)} {high.suit && <SuitIcon suit={high.suit} />}
    </>
  );
}

export function targetText(contract: Contract, t: T): string {
  const def = CONTRACTS[contract.type];
  if (def.exact) return def.target === 0 ? t('needsNone') : t('needsExactly', { n: def.target });
  return t('needs', { n: def.target });
}

/** Screen position of a seat relative to the viewer: 0 bottom, 1 left, 2 top, 3 right. */
export const relPos = (seat: Seat, me: Seat) => ((seat - me + 4) % 4) as 0 | 1 | 2 | 3;
