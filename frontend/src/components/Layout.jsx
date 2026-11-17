import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS } from '../format.js';
import { useSession } from '../session.jsx';
import { WalletButton } from './Wallet.jsx';

const NAV = [
  { to: '/', label: 'Tableau de bord', roles: ['ADMIN', 'SUPPLIER', 'OPERATOR'], end: true },
  { to: '/expedition', label: 'Nouvelle expédition', roles: ['SUPPLIER'] },
  { to: '/arrivee', label: 'Confirmer une arrivée', roles: ['OPERATOR'] },
  { to: '/produits', label: 'Produits', roles: ['ADMIN', 'SUPPLIER', 'OPERATOR'] },
  { to: '/transactions', label: 'Transactions', roles: ['ADMIN', 'SUPPLIER', 'OPERATOR'] },
  { to: '/admin', label: 'Utilisateurs', roles: ['ADMIN'] },
];

export function Layout() {
  const { user, logout } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">⛓</span> CertiShip
        </div>
        <nav>
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <WalletButton />
          <div className="me">
            <strong>{user.name}</strong>
            <span className="muted">{ROLE_LABELS[user.role]}</span>
          </div>
          <button type="button" className="link-btn" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
