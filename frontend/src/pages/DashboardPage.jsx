import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, StatusBadge } from '../components/ui.jsx';
import { formatDate, formatDuration } from '../format.js';
import { useSession } from '../session.jsx';

export function DashboardPage() {
  const { user, appConfig } = useSession();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api('/stats'), refetchInterval: 10000 });
  const recent = useQuery({ queryKey: ['products', 'recent'], queryFn: () => api('/products'), refetchInterval: 10000 });
  const s = stats.data;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Bonjour {user.name}</h1>
        {user.role === 'SUPPLIER' && (
          <Link className="btn" to="/expedition">
            Déclarer une expédition
          </Link>
        )}
        {user.role === 'OPERATOR' && (
          <Link className="btn" to="/arrivee">
            Confirmer une arrivée
          </Link>
        )}
      </div>

      {!appConfig?.chainEnabled && (
        <Alert kind="warn">Le Smart Contract n’est pas configuré côté serveur (CONTRACT_ADDRESS).</Alert>
      )}

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">En transit</span>
          <span className="tile-value">{s?.shipped ?? '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Arrivés</span>
          <span className="tile-value">{s?.arrived ?? '—'}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Délai moyen</span>
          <span className="tile-value">{formatDuration(s?.averageDelaySeconds)}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Transactions en attente</span>
          <span className="tile-value">{s?.pendingTransactions ?? '—'}</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Derniers produits</h2>
          <Link to="/produits">Tout l’historique →</Link>
        </div>
        {recent.isLoading ? (
          <p className="muted">Chargement…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>Expédition</th>
                <th>Arrivée</th>
              </tr>
            </thead>
            <tbody>
              {(recent.data?.products ?? []).slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td>{p.number ? <Link to={`/produits/${p.number}`}>#{p.number}</Link> : '—'}</td>
                  <td>{p.name ?? <em className="muted">données absentes</em>}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>{formatDate(p.shippedAt)}</td>
                  <td>{formatDate(p.arrivedAt)}</td>
                </tr>
              ))}
              {recent.data?.products?.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucun produit pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
