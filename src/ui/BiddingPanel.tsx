import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Suit } from '../game/cards';
import { type BidAction, type DirectBid, legalBids } from '../game/engine';
import { CONTRACTS } from '../game/rules';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import type { ClientAction } from '../net/protocol';
import { HighBidText, SuitIcon, cardLabel, contractName } from './format';

const SUIT_ORDER: Suit[] = ['H', 'D', 'C', 'S'];

interface Props {
  view: PlayerView;
  send: (action: ClientAction) => void;
}

export function BiddingPanel({ view, send }: Props) {
  const { t } = useI18n();
  const [pending, setPending] = useState<DirectBid | null>(null);
  const b = view.bidding!;
  const me = view.seat;
  const myTurn = b.turn === me;
  const legal = legalBids(view, me);
  const name = (s: number) => (s === me ? t('you') : view.players[s].name);
  const bid = (action: BidAction) => {
    setPending(null);
    send({ type: 'bid', bid: action });
  };

  const canJoin = legal.some((l) => l.kind === 'join');
  const asks = legal.filter((l) => l.kind === 'ask');
  const directs = [...new Set(legal.flatMap((l) => (l.kind === 'bid' ? [l.contract] : [])))];
  const high = b.high;

  return (
    <motion.div
      className="panel bidding-panel"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
    >
      <div className="bidding-head">
        <h3>{t('bidding')}</h3>
        {view.nextMultiplier > 1 && <span className="badge gold">×{view.nextMultiplier} {t('doubled')}</span>}
      </div>

      {b.troel && (
        <div className="troel-banner">
          <strong>{t('troelAnnounce', { name: view.players[b.troel.seat].name, aces: b.troel.aces })}</strong>
          <span>
            {t('troelPartner', { partner: name(b.troel.partner), card: cardLabel(b.troel.partnerCard, t) })} ·{' '}
            {t('trump')} <SuitIcon suit={b.troel.trump} />
          </span>
        </div>
      )}

      <div className="high-bid">
        <span className="muted small">{t('highestBid')}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={high ? `${high.type}-${high.suit}-${high.declarers.join()}` : 'none'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {high ? (
              <>
                <strong>
                  <HighBidText high={high} t={t} />
                </strong>{' '}
                <span className="muted">— {high.declarers.map(name).join(' + ')}</span>
              </>
            ) : (
              <span className="muted">{t('noBidYet')}</span>
            )}
          </motion.span>
        </AnimatePresence>
      </div>

      {!myTurn && b.turn !== null && (
        <p className="waiting">
          <span className="spinner" /> {t('waitingFor', { name: view.players[b.turn].name })}
        </p>
      )}

      {myTurn && b.askerDecision && (
        <div className="bid-actions">
          <p>{t('aloneQuestion', { suit: t(`suit.${high!.suit!}`) })}</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => bid({ kind: 'alone' })}>
              {t('alone')} <SuitIcon suit={high!.suit!} />
            </button>
            <button className="btn" onClick={() => bid({ kind: 'pass' })}>
              {t('pass')}
            </button>
          </div>
        </div>
      )}

      {myTurn && !b.askerDecision && !pending && (
        <div className="bid-actions">
          <div className="your-turn">{t('yourTurn')}</div>
          <div className="btn-row">
            <button className="btn" onClick={() => bid({ kind: 'pass' })}>
              {t('pass')}
            </button>
            {canJoin && (
              <button className="btn primary" onClick={() => bid({ kind: 'join' })}>
                {high?.type === 'ask' ? (
                  <>
                    {t('joinAsk')} <SuitIcon suit={high.suit!} />
                  </>
                ) : (
                  <>
                    {t('meToo')} ({contractName(high!.type, t)})
                  </>
                )}
              </button>
            )}
          </div>
          {asks.length > 0 && (
            <div className="bid-group">
              <span className="muted small">{t('ask')}</span>
              <div className="btn-row">
                {SUIT_ORDER.map((suit) => (
                  <button
                    key={suit}
                    className="btn suit-btn"
                    title={t('askSuit', { suit: t(`suit.${suit}`) })}
                    onClick={() => bid({ kind: 'ask', suit })}
                  >
                    <SuitIcon suit={suit} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {directs.length > 0 && (
            <div className="bid-group">
              <span className="muted small">{t('higherContracts')}</span>
              <div className="btn-row wrap">
                {directs.map((c) => (
                  <button
                    key={c}
                    className="btn"
                    onClick={() => (CONTRACTS[c].hasTrump ? setPending(c) : bid({ kind: 'bid', contract: c }))}
                  >
                    {contractName(c, t)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {myTurn && pending && (
        <div className="bid-actions">
          <p>{t('chooseTrump', { contract: contractName(pending, t) })}</p>
          <div className="btn-row">
            {SUIT_ORDER.map((suit) => (
              <button
                key={suit}
                className="btn suit-btn"
                title={t(`suit.${suit}`)}
                onClick={() => bid({ kind: 'bid', contract: pending, suit })}
              >
                <SuitIcon suit={suit} />
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setPending(null)}>
            {t('cancel')}
          </button>
        </div>
      )}
    </motion.div>
  );
}
