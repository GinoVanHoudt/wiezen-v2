import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect } from 'react';
import { type Seat, nextSeat } from '../game/cards';
import { legalCards } from '../game/engine';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import type { ClientAction } from '../net/protocol';
import { BiddingPanel } from './BiddingPanel';
import { CardBack, CardFace } from './CardView';
import { ContractInfo } from './ContractInfo';
import { BidText, cardLabel, relPos } from './format';
import { GameOver, HandResult } from './HandResult';

interface Props {
  view: PlayerView;
  send: (action: ClientAction) => void;
}

/** Unit vectors from the table centre towards each screen position (bottom, left, top, right). */
const DIR = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
];
const TILT = [-4, 3, -2, 5];

const trickVariants = {
  exit: (pos: number | null) =>
    pos === null
      ? { opacity: 0, transition: { duration: 0.2 } }
      : {
          x: DIR[pos].x * 280,
          y: DIR[pos].y * 220,
          opacity: 0,
          scale: 0.45,
          transition: { duration: 0.5, ease: [0.5, 0, 0.75, 0.4] as const },
        },
};

export function Table({ view, send }: Props) {
  const { t } = useI18n();
  const me = view.seat;
  const seatAt = (pos: number) => nextSeat(me, pos);
  const lastResult = view.history[view.history.length - 1];
  const allPassed = view.phase === 'handEnd' && lastResult && !lastResult.contract;
  const myTurn =
    (view.phase === 'playing' && view.turn === me) || (view.phase === 'bidding' && view.bidding?.turn === me);

  useEffect(() => {
    document.title = myTurn ? `● ${t('yourTurn')} — Kleurenwiezen` : 'Kleurenwiezen';
    return () => {
      document.title = 'Kleurenwiezen';
    };
  }, [myTurn, t]);

  return (
    <LayoutGroup>
      <div className="table">
        <div className="felt">
          <ContractInfo view={view} />
          {[1, 2, 3].map((pos) => (
            <Opponent key={pos} view={view} seat={seatAt(pos)} pos={pos} />
          ))}
          <div className="area-center">
            <TrickArea view={view} />
            <AnimatePresence>
              {view.phase === 'bidding' && <BiddingPanel key={`bid-${view.handNo}`} view={view} send={send} />}
              {allPassed && (
                <motion.div
                  key="allpass"
                  className="panel center-msg"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <strong>{t('allPass')}</strong>
                  <span>{t('redealing')}</span>
                  {view.nextMultiplier > 1 && <span className="badge gold">{t('redealDouble')}</span>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="area-me">
            <div className="me-anchor">
              <Nameplate view={view} seat={me} />
              <AnimatePresence>
                {view.phase === 'playing' && view.turn === me && (
                  <motion.span
                    className="turn-hint"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                  >
                    {t('yourTurn')}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <MyHand view={view} send={send} />
      </div>
      <HandResult view={view} send={send} />
      <GameOver view={view} send={send} />
    </LayoutGroup>
  );
}

function Nameplate({ view, seat }: { view: PlayerView; seat: Seat }) {
  const { t } = useI18n();
  const p = view.players[seat];
  const active =
    (view.phase === 'bidding' && view.bidding?.turn === seat) || (view.phase === 'playing' && view.turn === seat);
  const inPlay = view.phase === 'playing' || view.phase === 'handEnd';
  const declarer = inPlay && !!view.contract?.declarers.includes(seat);
  const log = view.bidding?.log ?? [];
  let lastIndex = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].seat === seat) {
      lastIndex = i;
      break;
    }
  }
  const showBubble = view.phase === 'bidding' && lastIndex >= 0;

  return (
    <div className={`nameplate ${active ? 'active' : ''} ${declarer ? 'declarer' : ''}`}>
      <span className="avatar">{p.bot ? '🤖' : p.name.slice(0, 1).toUpperCase()}</span>
      <span className="np-name">
        {p.name}
        {seat === view.seat && <span className="muted"> ({t('you')})</span>}
      </span>
      {view.dealer === seat && (
        <span className="chip dealer" title={t('dealer')}>
          {t('dealer').slice(0, 1)}
        </span>
      )}
      {!p.connected && <span className="tag warn">{t('offline')}</span>}
      {inPlay && (
        <motion.span
          key={view.tricksWon[seat]}
          className="chip tricks"
          title={t('tricks')}
          initial={{ scale: 1.6 }}
          animate={{ scale: 1 }}
        >
          {view.tricksWon[seat]}
        </motion.span>
      )}
      <AnimatePresence>
        {showBubble && (
          <motion.div
            key={lastIndex}
            className="bubble"
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          >
            <BidText entry={log[lastIndex]} t={t} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Opponent({ view, seat, pos }: { view: PlayerView; seat: Seat; pos: number }) {
  const visible = view.hands[seat];
  const count = view.handSizes[seat];
  return (
    <div className={`seat seat-p${pos}`}>
      <Nameplate view={view} seat={seat} />
      <div className={`opp-hand ${pos === 2 ? 'horizontal' : 'vertical'} ${visible ? 'open' : ''}`}>
        {visible
          ? visible.map((c) => (
              <motion.div key={c} layoutId={c} layout className="opp-card">
                <CardFace card={c} />
              </motion.div>
            ))
          : Array.from({ length: count }, (_, i) => (
              <motion.div
                key={`${view.handNo}-${i}`}
                layout
                className="opp-card"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.03 } }}
              >
                <CardBack />
              </motion.div>
            ))}
      </div>
    </div>
  );
}

function TrickArea({ view }: { view: PlayerView }) {
  const trick = view.trick;
  const me = view.seat;
  const cards = trick?.cards ?? [];
  // While the trick is on the table its winner is known; once it is cleared, lastTrick holds it.
  const winner = trick && trick.winner !== null ? trick.winner : (view.lastTrick?.winner ?? null);
  const exitPos = winner === null ? null : relPos(winner, me);

  return (
    <div className="trick-area">
      <AnimatePresence custom={exitPos}>
        {trick &&
          cards.map((card, i) => {
            const seat = nextSeat(trick.leader, i);
            const pos = relPos(seat, me);
            const fromVisibleHand = seat === me || !!view.hands[seat];
            return (
              <motion.div
                key={card}
                layoutId={fromVisibleHand ? card : undefined}
                className={`trick-card tp${pos} ${trick.winner === seat ? 'winning' : ''}`}
                style={{ zIndex: i + 1 }}
                custom={exitPos}
                variants={trickVariants}
                initial={
                  fromVisibleHand
                    ? { rotate: 0 }
                    : { opacity: 0, x: DIR[pos].x * 180, y: DIR[pos].y * 150, scale: 0.6, rotate: TILT[pos] * 4 }
                }
                animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: TILT[(i + trick.leader) % 4] }}
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <CardFace card={card} />
              </motion.div>
            );
          })}
      </AnimatePresence>
    </div>
  );
}

function MyHand({ view, send }: Props) {
  const { t } = useI18n();
  const hand = view.hands[view.seat] ?? [];
  const legal = new Set(legalCards(view, view.seat));
  const myTurn = view.phase === 'playing' && view.turn === view.seat;

  return (
    <div className={`my-hand-wrap ${myTurn ? 'my-turn' : ''}`}>
      <div className="my-hand" key={view.handNo}>
        {hand.map((card, i) => {
          const playable = myTurn && legal.has(card);
          return (
            <motion.button
              key={card}
              layoutId={card}
              layout
              className={`hand-card ${playable ? 'playable' : ''} ${myTurn && !playable ? 'dim' : ''}`}
              initial={{ opacity: 0, y: -160, scale: 0.5, rotate: -8 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                rotate: 0,
                transition: { delay: 0.15 + i * 0.04, type: 'spring', stiffness: 260, damping: 24 },
              }}
              whileHover={playable ? { y: -16, transition: { duration: 0.15 } } : undefined}
              whileTap={playable ? { scale: 0.96 } : undefined}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              disabled={!playable}
              aria-label={cardLabel(card, t)}
              onClick={() => playable && send({ type: 'play', card })}
            >
              <CardFace card={card} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
