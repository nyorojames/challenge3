import { createContext, useContext, useEffect, useState } from 'react';
import sw from './sw.json';
import en from './en.json';

const dictionaries = { sw, en };
const STORAGE_KEY = 'duka.lang';
const LanguageContext = createContext(null);

function readSavedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }) {
  // Swahili is the default; the user's last choice wins after that.
  const [lang, setLangState] = useState(() => readSavedLanguage() || 'sw');

  const setLang = (next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: the choice just isn't remembered
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

function lookup(dictionary, key) {
  return key.split('.').reduce((node, part) => node?.[part], dictionary);
}

/**
 * const { t, lang, setLang } = useT();
 * t('customers.due_on', { date: '5 Okt' })  ->  "Alipe 5 Okt"
 * Falls back to English, then to the key itself, so a missing word is visible, not blank.
 */
export function useT() {
  const { lang, setLang } = useContext(LanguageContext);
  const t = (key, vars = {}) => {
    const text = lookup(dictionaries[lang], key) ?? lookup(en, key) ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
  };
  return { t, lang, setLang };
}
