import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import { Modal } from './Modal';
import { SuitIcon, contractName } from './format';

export function ScoreSheet({ view, open, onClose }: { view: PlayerView; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const running = [0, 0, 0, 0];
  const rows = view.history.map((h, i) => {
    h.deltas.forEach((d, s) => (running[s] += d));
    return { h, totals: running.slice(), key: i };
  });

  return (
    <Modal open={open} onClose={onClose} title={t('scoreSheet')} wide>
      {rows.length === 0 ? (
        <p className="muted">{t('noHandsYet')}</p>
      ) : (
        <div className="table-scroll">
          <table className="score-table">
            <thead>
              <tr>
                <th>#</th>
                <th />
                {view.players.map((p, i) => (
                  <th key={i}>{i === view.seat ? `${p.name} (${t('you')})` : p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ h, totals, key }) => (
                <tr key={key} className={h.contract ? '' : 'muted'}>
                  <td>{key + 1}</td>
                  <td className="contract-cell">
                    {h.contract ? (
                      <>
                        {contractName(h.contract.type, t)} {h.contract.trump && <SuitIcon suit={h.contract.trump} />}
                        {h.contract.multiplier > 1 && <span className="badge gold">×{h.contract.multiplier}</span>}
                        <span className={h.outcomes.some((o) => o.made) ? 'ok' : 'ko'}>
                          {' '}
                          {h.outcomes.every((o) => o.made) ? '✓' : h.outcomes.some((o) => o.made) ? '±' : '✗'}
                        </span>
                      </>
                    ) : (
                      t('allPass')
                    )}
                  </td>
                  {totals.map((total, s) => (
                    <td key={s} className={h.contract && h.contract.declarers.includes(s as 0) ? 'declarer' : ''}>
                      <span className="total">{total}</span>
                      {h.contract && (
                        <span className={`delta ${h.deltas[s] > 0 ? 'ok' : h.deltas[s] < 0 ? 'ko' : ''}`}>
                          {h.deltas[s] > 0 ? '+' : ''}
                          {h.deltas[s]}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
