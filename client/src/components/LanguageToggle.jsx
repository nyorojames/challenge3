import { useT } from '../i18n/index.jsx';

// Always-visible SW | EN switch. The active language is filled in.
export default function LanguageToggle() {
  const { t, lang, setLang } = useT();
  return (
    <div role="group" aria-label={t('common.language')} className="flex rounded-full bg-white/15 p-0.5 text-sm font-semibold">
      {['sw', 'en'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`rounded-full px-3 py-1 ${lang === code ? 'bg-white text-emerald-800' : 'text-white/90 hover:bg-white/10'}`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
