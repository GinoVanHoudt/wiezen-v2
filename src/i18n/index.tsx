import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Dict, en } from './en';
import { nl } from './nl';

export type Lang = 'nl' | 'en';
export type TKey = keyof Dict;
export type T = (key: TKey, params?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Dict> = { nl, en };
const STORAGE_KEY = 'kw.lang';

function initialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'nl' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback<T>(
    (key, params) => {
      let s = DICTS[lang][key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
