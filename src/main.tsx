import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {/* Respect the OS "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </I18nProvider>
  </StrictMode>,
);
