import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import { useSession } from '../session.jsx';
import LanguageToggle from './LanguageToggle.jsx';

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: '🏠' },
  { to: '/customers', key: 'nav.customers', icon: '👥' },
  { to: '/new', key: 'nav.new', icon: '➕' },
  { to: '/products', key: 'nav.products', icon: '📦' },
];

// Header on top, page in the middle, tab bar at the bottom (like a phone app).
export default function Layout() {
  const { t } = useT();
  const { shop, logout } = useSession();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-emerald-700 px-4 py-3 text-white shadow">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-emerald-200">Duka Ledger</p>
          <h1 className="truncate font-semibold">{shop?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <button onClick={logout} className="rounded-full px-2 py-1 text-sm text-emerald-100 hover:bg-white/10">
            {t('common.logout')}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 text-xs ${isActive ? 'font-semibold text-emerald-700' : 'text-slate-500'}`
              }
            >
              <span className="text-lg" aria-hidden>{item.icon}</span>
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
