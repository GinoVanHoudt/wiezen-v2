import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { nextSeat } from '../game/cards';
import { playedHands } from '../game/engine';
import { CONTRACTS } from '../game/rules';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import { CardFace } from './CardView';
import { SuitIcon, contractName, targetText } from './format';

/** A boolean UI preference that survives reloads. */
function useStoredFlag(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === '1';
  });
  const toggle = () =>
    setValue((v) => {
      localStorage.setItem(key, v ? '0' : '1');
      return !v;
    });
  return [value, toggle];
}

const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2 },
};

export function ContractInfo({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const [minimized, toggleMinimized] = useStoredFlag('kw.infoMinimized', false);
  const [showLast, toggleLast] = useStoredFlag('kw.showLastTrick', false);
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
    <div className={`contract-info panel ${minimized ? 'minimized' : ''}`}>
      <div className="info-head">
        {minimized && contract ? (
          <span className="contract-name small">
            {contractName(contract.type, t)}
            {contract.trump && <SuitIcon suit={contract.trump} />}
            {def && (def.kind === 'team' || contract.declarers.length === 1) && (
              <span className="muted">
                {def.kind === 'team' ? teamTricks : view.tricksWon[contract.declarers[0]]}/{def.target}
              </span>
            )}
          </span>
        ) : (
          <span className="muted small">{handLabel}</span>
        )}
        <button
          className="info-toggle"
          onClick={toggleMinimized}
          title={minimized ? t('expand') : t('minimize')}
          aria-label={minimized ? t('expand') : t('minimize')}
          aria-expanded={!minimized}
        >
          {minimized ? '+' : '−'}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {!minimized && (
          <motion.div key="body" className="info-body" {...collapse}>
            {contract && def ? (
              <>
                <div className="contract-name">
                  {contractName(contract.type, t)}
                  {contract.trump ? (
                    <SuitIcon suit={contract.trump} />
                  ) : (
                    <span className="muted small"> · {t('noTrump')}</span>
                  )}
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
                        {name(s)}: <strong>{view.tricksWon[s]}</strong>{' '}
                        <span className="muted">({targetText(contract, t)})</span>
                      </div>
                    ))
                  )}
                </div>
                {last && (
                  <button className="link-btn small" onClick={toggleLast} aria-expanded={showLast}>
                    {t('lastTrick')} {showLast ? '▴' : '▾'}
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {showLast && last && (
                    <motion.button
                      key="last"
                      className="last-trick"
                      onClick={toggleLast}
                      title={t('minimize')}
                      {...collapse}
                    >
                      {last.cards.map((c, i) => {
                        const seat = nextSeat(last.leader, i);
                        return (
                          <span key={c} className={`mini ${seat === last.winner ? 'won' : ''}`}>
                            <CardFace card={c} />
                            <span>{name(seat)}</span>
                          </span>
                        );
                      })}
                    </motion.button>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="small">
                {t('dealer')}: <strong>{name(view.dealer)}</strong>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
