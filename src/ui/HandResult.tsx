import { motion } from 'motion/react';
import type { Seat } from '../game/cards';
import { CONTRACTS } from '../game/rules';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import type { ClientAction } from '../net/protocol';
import { Modal } from './Modal';
import { SuitIcon, contractName } from './format';

interface Props {
  view: PlayerView;
  send: (action: ClientAction) => void;
}

export function HandResult({ view, send }: Props) {
  const { t } = useI18n();
  const result = view.history[view.history.length - 1];
  const open = view.phase === 'handEnd' && !!result?.contract;
  const name = (s: number) => (s === view.seat ? t('you') : view.players[s].name);
  const team = !!result?.contract && CONTRACTS[result.contract.type].kind === 'team';

  return (
    <Modal open={open} title={t('resultTitle')}>
      {result?.contract && (
        <div className="hand-result">
          <div className="result-contract">
            {contractName(result.contract.type, t)} {result.contract.trump && <SuitIcon suit={result.contract.trump} />}
            {result.contract.multiplier > 1 && <span className="badge gold">×{result.contract.multiplier}</span>}
          </div>
          <div className="outcomes">
            {(team ? [result.outcomes[0]] : result.outcomes).map((o) => (
              <motion.div
                key={o.seat}
                className={`outcome ${o.made ? 'ok' : 'ko'}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.15 }}
              >
                <strong>{o.made ? t('made') : t('failed')}</strong>
                <span>
                  {team ? result.contract!.declarers.map(name).join(' + ') : name(o.seat)}{' '}
                  · {o.tricks === 1 ? t('trickSingular') : t('tricksTaken', { n: o.tricks })}
                </span>
              </motion.div>
            ))}
          </div>
          <table className="result-table">
            <thead>
              <tr>
                <th />
                <th>{t('points')}</th>
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((p, s) => (
                <tr key={s} className={s === view.seat ? 'me' : ''}>
                  <td>
                    {p.name}
                    {s === view.seat && <span className="tag">{t('you')}</span>}
                  </td>
                  <td className={result.deltas[s] > 0 ? 'ok' : result.deltas[s] < 0 ? 'ko' : ''}>
                    {result.deltas[s] > 0 ? '+' : ''}
                    {result.deltas[s]}
                  </td>
                  <td>
                    <strong>{view.scores[s]}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.ready.includes(view.seat) ? (
            <button className="btn primary big" onClick={() => send({ type: 'nextHand' })} autoFocus>
              {t('nextHand')}
            </button>
          ) : (
            <p className="waiting">
              <span className="spinner" />{' '}
              {t('waitingFor', {
                name: view.players
                  .filter((p, s) => !p.bot && !view.ready.includes(s as Seat))
                  .map((p) => p.name)
                  .join(', '),
              })}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function GameOver({ view, send }: Props) {
  const { t } = useI18n();
  const isHost = view.seat === 0;
  const ranking = view.players.map((p, s) => ({ p, s, score: view.scores[s] })).sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉', ''];

  return (
    <Modal open={view.phase === 'gameOver'} title={t('gameOver')}>
      <div className="game-over">
        <motion.div
          className="winner"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        >
          🏆 {t('wins', { name: ranking[0].p.name })}
        </motion.div>
        <ol className="ranking">
          {ranking.map(({ p, s, score }, i) => (
            <motion.li
              key={s}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              <span>
                {medals[i]} {p.name} {s === view.seat && <span className="tag">{t('you')}</span>}
              </span>
              <strong>{score}</strong>
            </motion.li>
          ))}
        </ol>
        {isHost ? (
          <div className="btn-row">
            <button className="btn primary" onClick={() => send({ type: 'start' })}>
              {t('playAgain')}
            </button>
            <button className="btn" onClick={() => send({ type: 'toLobby' })}>
              {t('backToLobby')}
            </button>
          </div>
        ) : (
          <p className="waiting">
            <span className="spinner" /> {t('waitingNextHand')}
          </p>
        )}
      </div>
    </Modal>
  );
}
