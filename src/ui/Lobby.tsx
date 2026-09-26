import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Settings } from '../game/rules';
import type { PlayerView } from '../game/view';
import { useI18n } from '../i18n';
import type { ClientAction } from '../net/protocol';
import type { SessionSnapshot } from '../net/session';

interface Props {
  snapshot: SessionSnapshot;
  view: PlayerView;
  send: (action: ClientAction) => void;
}

const HAND_OPTIONS = [4, 8, 12, 16, 20, 0];

export const inviteUrl = (code: string) => {
  const url = new URL(window.location.href);
  url.search = `?room=${code}`;
  url.hash = '';
  return url.toString();
};

export function Lobby({ snapshot, view, send }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isHost = view.seat === 0;
  const online = snapshot.role !== 'local';
  const code = snapshot.code;
  const settings = view.settings;

  const setSettings = (patch: Partial<Settings>) => send({ type: 'settings', settings: { ...settings, ...patch } });

  const copy = async () => {
    if (!code) return;
    const url = inviteUrl(code);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Kleurenwiezen', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <div className="lobby">
      {online && (
        <div className="panel invite">
          {code ? (
            <>
              <div className="invite-code">
                <span className="muted small">{t('roomCode')}</span>
                <strong>{code}</strong>
              </div>
              <div className="invite-link">
                <input readOnly value={inviteUrl(code)} onFocus={(e) => e.target.select()} aria-label={t('inviteLink')} />
                <button className="btn primary" onClick={copy}>
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            </>
          ) : (
            <div className="muted">
              <span className="spinner" /> {t('creatingRoom')}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>{t('seats')}</h2>
        <ul className="seat-list">
          {view.players.map((p, i) => (
            <li key={i} className={p.bot ? 'is-bot' : ''}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={p.name + p.bot}
                  className="seat-name"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                >
                  <span className="avatar">{p.bot ? '🤖' : p.name.slice(0, 1).toUpperCase()}</span>
                  {p.name}
                  {i === view.seat && <span className="tag">{t('you')}</span>}
                  {i === 0 && online && <span className="tag">{t('host')}</span>}
                  {p.bot && <span className="tag muted">{t('bot')}</span>}
                </motion.span>
              </AnimatePresence>
            </li>
          ))}
        </ul>
        {online && <p className="muted small">{t('seatsHint')}</p>}
      </div>

      <div className="panel">
        <h2>{t('rulesOptions')}</h2>
        <fieldset disabled={!isHost} className="options">
          <label className="check">
            <input type="checkbox" checked={settings.piccolo} onChange={(e) => setSettings({ piccolo: e.target.checked })} />
            <span>
              {t('optPiccolo')}
              <small className="muted"> — {t('optPiccoloHint')}</small>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.passDoubles}
              onChange={(e) => setSettings({ passDoubles: e.target.checked })}
            />
            <span>{t('optPassDoubles')}</span>
          </label>
          <div className="field-row">
            <span>{t('optHands')}</span>
            <div className="segmented">
              {HAND_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={settings.hands === n ? 'active' : ''}
                  onClick={() => setSettings({ hands: n })}
                >
                  {n === 0 ? '∞' : n}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        {!isHost && <p className="muted small">{t('hostControls')}</p>}
      </div>

      {isHost ? (
        <button className="btn big primary start-btn" onClick={() => send({ type: 'start' })} disabled={online && !code}>
          {t('startGame')}
        </button>
      ) : (
        <p className="waiting">
          <span className="spinner" /> {t('waitingForHost')}
        </p>
      )}
    </div>
  );
}
