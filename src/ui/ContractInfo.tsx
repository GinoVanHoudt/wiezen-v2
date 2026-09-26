import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { nextSeat } from '../game/cards';
import { playedHands } from '../game/engine';
import { CONTRACTS } from '../game/rules';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import { CardFace } from './CardView';
import { SuitIcon, contractName, targetText } from './format';

export function ContractInfo({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const [showLast, setShowLast] = useState(false);
  const contract = view.contract;
  const name = (s: number) => (s === view.seat ? t('you') : view.players[s].name);
  // Once a played hand is scored it is already counted in the history.
  const scored = view.phase !== 'bidding' && view.phase !== 'playing' && !!view.history[view.history.length - 1]?.contract;
  const n = playedHands(view) + (scored ? 0 : 1);
  const handLabel =
    view.settings.hands > 0
      ? t('handOf', { n: Math.min(n, view.settings.hands), total: view.settings.hands })
      : t('handN', { n });

  const def = contract && CONTRACTS[contract.type];
  const teamTricks = contract ? contract.declarers.reduce<number>((sum, s) => sum + view.tricksWon[s], 0) : 0;
  const last = view.lastTrick;

  return (
    <div className="contract-info panel">
      <div className="muted small">{handLabel}</div>
      {contract && def ? (
        <>
          <div className="contract-name">
            {contractName(contract.type, t)}
            {contract.trump ? <SuitIcon suit={contract.trump} /> : <span className="muted small"> · {t('noTrump')}</span>}
            {contract.multiplier > 1 && <span className="badge gold">×{contract.multiplier}</span>}
          </div>
          <div className="small">
            {def.kind === 'team' ? (
              <>
                {contract.declarers.map(name).join(' + ')}: <strong>{teamTricks}</strong> / {def.target}
              </>
            ) : (
              contract.declarers.map((s) => (
                <div key={s}>
                  {name(s)}: <strong>{view.tricksWon[s]}</strong> <span className="muted">({targetText(contract, t)})</span>
                </div>
              ))
            )}
          </div>
          {last && (
            <button className="link-btn small" onClick={() => setShowLast((v) => !v)}>
              {t('lastTrick')} {showLast ? '▴' : '▾'}
            </button>
          )}
          <AnimatePresence>
            {showLast && last && (
              <motion.div
                className="last-trick"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {last.cards.map((c, i) => {
                  const seat = nextSeat(last.leader, i);
                  return (
                    <div key={c} className={`mini ${seat === last.winner ? 'won' : ''}`}>
                      <CardFace card={c} />
                      <span>{name(seat)}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="small">
          {t('dealer')}: <strong>{name(view.dealer)}</strong>
        </div>
      )}
    </div>
  );
}
