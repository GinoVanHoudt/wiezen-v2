import { motion } from 'motion/react';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n';
import { useMobileData } from '../net/network';
import type { SessionError } from '../net/session';
import { CardFace } from './CardView';

interface Props {
  name: string;
  onName: (name: string) => void;
  initialCode: string;
  error: SessionError | null;
  onLocal: () => void;
  onResume?: () => void;
  onHost: () => void;
  onJoin: (code: string) => void;
}

const HERO_CARDS = ['HA', 'SK', 'DQ', 'CJ'];

export function Home({ name, onName, initialCode, error, onLocal, onResume, onHost, onJoin }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState(initialCode);
  const nameOk = name.trim().length > 0;
  const mobileData = useMobileData();

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (nameOk && code.trim().length >= 4) onJoin(code.trim().toUpperCase());
  };

  return (
    <div className="home">
      <div className="hero">
        <div className="hero-cards" aria-hidden>
          {HERO_CARDS.map((c, i) => (
            <motion.div
              key={c}
              className="hero-card"
              initial={{ opacity: 0, y: 40, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: (i - 1.5) * 12 }}
              transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 220, damping: 18 }}
              style={{ zIndex: i }}
            >
              <CardFace card={c} />
            </motion.div>
          ))}
        </div>
        <h1>Kleurenwiezen</h1>
        <p className="muted">{t('tagline')}</p>
      </div>

      {error && <div className="alert">{t(`error.${error}`)}</div>}

      <div className="panel home-panel">
        <label className="field">
          <span>{t('yourName')}</span>
          <input
            value={name}
            maxLength={20}
            placeholder={t('namePlaceholder')}
            onChange={(e) => onName(e.target.value)}
            autoFocus={!name}
          />
        </label>

        <div className="home-actions">
          {onResume && (
            <button className="btn big primary" disabled={!nameOk} onClick={onResume}>
              <span>▶ {t('resumeGame')}</span>
              <small>{t('resumeGameHint')}</small>
            </button>
          )}
          <button className={`btn big ${onResume ? '' : 'primary'}`} disabled={!nameOk} onClick={onLocal}>
            <span>🤖 {t('playBots')}</span>
            <small>{t('playBotsHint')}</small>
          </button>
          <button className="btn big" disabled={!nameOk || mobileData} onClick={onHost}>
            <span>🌐 {t('createRoom')}</span>
            <small>{t('createRoomHint')}</small>
          </button>
          {mobileData && <div className="alert warn">{t('mobileDataHost')}</div>}
        </div>

        <div className="divider">
          <span>{t('or')}</span>
        </div>

        <form className="join-form" onSubmit={join}>
          <label className="field">
            <span>{t('joinRoom')}</span>
            <input
              value={code}
              maxLength={8}
              placeholder={t('roomCode')}
              className="code-input"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </label>
          <button className="btn" type="submit" disabled={!nameOk || code.trim().length < 4}>
            {t('join')}
          </button>
        </form>
        <p className="muted small">{t('noBackend')}</p>
      </div>
    </div>
  );
}
