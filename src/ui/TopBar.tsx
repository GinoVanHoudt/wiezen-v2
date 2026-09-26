import { type Lang, useI18n } from '../i18n';
import { BookIcon, ExitIcon, MoonIcon, ScoreIcon, SunIcon } from './icons';
import type { Theme } from './theme';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  code: string | null;
  onRules: () => void;
  onScores?: () => void;
  onLeave?: () => void;
}

export function TopBar({ theme, onToggleTheme, code, onRules, onScores, onLeave }: Props) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-suits" aria-hidden>
          ♠<i>♥</i>
        </span>
        <span className="brand-name">Kleurenwiezen</span>
      </div>
      {code && (
        <span className="room-chip" title={t('roomCode')}>
          {code}
        </span>
      )}
      <div className="spacer" />
      {onScores && (
        <button className="icon-btn" onClick={onScores} title={t('scores')} aria-label={t('scores')}>
          <ScoreIcon />
        </button>
      )}
      <button className="icon-btn" onClick={onRules} title={t('rules')} aria-label={t('rules')}>
        <BookIcon />
      </button>
      <div className="segmented lang" role="group" aria-label={t('language')}>
        {(['nl', 'en'] as Lang[]).map((l) => (
          <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        className="icon-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? t('lightMode') : t('darkMode')}
        aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
      {onLeave && (
        <button className="icon-btn" onClick={onLeave} title={t('leave')} aria-label={t('leave')}>
          <ExitIcon />
        </button>
      )}
    </header>
  );
}
