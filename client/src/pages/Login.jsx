import { useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { useSession } from '../session.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function Login() {
  const { t } = useT();
  const { login } = useSession();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-emerald-700">
      <div className="flex justify-end p-4">
        <LanguageToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <div className="text-center">
            <img src="/icon.svg" alt="" className="mx-auto mb-2 h-14 w-14" />
            <h1 className="text-xl font-bold text-slate-800">Duka Ledger</h1>
            <p className="text-sm text-slate-500">{t('login.subtitle')}</p>
          </div>
          <h2 className="font-semibold text-slate-700">{t('login.title')}</h2>
          <label className="block">
            <span className="text-sm text-slate-600">{t('login.phone')}</span>
            <input
              type="tel" inputMode="tel" autoComplete="username" required
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">{t('login.password')}</span>
            <input
              type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-emerald-700 py-2.5 font-semibold text-white disabled:opacity-60">
            {busy ? t('common.loading') : t('login.submit')}
          </button>
          <p className="text-center text-xs text-slate-400">{t('login.demo')}</p>
        </form>
      </div>
    </div>
  );
}
