import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { useSession } from '../session.jsx';

export function LoginPage() {
  const { user, login, configError } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="logo" aria-hidden="true">⛓</span> CertiShip
        </div>
        <p className="muted">Certification blockchain des dates d’expédition et d’arrivée.</p>
        <Alert kind="error">{configError}</Alert>
        <Alert kind="error">{error}</Alert>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
