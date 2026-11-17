import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Alert, StatusBadge } from '../components/ui.jsx';
import { formatDate, formatDuration } from '../format.js';
import { useSession } from '../session.jsx';

/** Historique des produits avec filtres (EF08). */
export function ProductsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: '', category: '', from: '', to: '' });
  const [error, setError] = useState(null);
  const products = useQuery({
    queryKey: ['products', filters],
    queryFn: () => api(`/products${qs(filters)}`),
    refetchInterval: 10000,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/products/categories') });
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const removeDraft = async (id) => {
    setError(null);
    try {
      await api(`/shipments/${id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack">
      <h1>{user.role === 'SUPPLIER' ? 'Mes produits' : 'Historique des produits'}</h1>
      <div className="card filters">
        <input placeholder="N° ou nom…" value={filters.q} onChange={set('q')} />
        <select value={filters.status} onChange={set('status')}>
          <option value="">Tous les statuts</option>
          {user.role !== 'OPERATOR' && <option value="DRAFT">Brouillon</option>}
          <option value="SHIPPED">Expédié</option>
          <option value="ARRIVED">Arrivé</option>
        </select>
        <select value={filters.category} onChange={set('category')}>
          <option value="">Toutes catégories</option>
          {(categories.data?.categories ?? []).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="inline">
          Expédié du <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="inline">
          au <input type="date" value={filters.to} onChange={set('to')} />
        </label>
      </div>
      <Alert kind="error">{error || products.error?.message}</Alert>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Nom</th>
              <th>Catégorie</th>
              <th>Fournisseur</th>
              <th>Statut</th>
              <th>Expédition</th>
              <th>Arrivée</th>
              <th>Délai</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(products.data?.products ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.number ? <Link to={`/produits/${p.number}`}>#{p.number}</Link> : '—'}</td>
                <td>{p.name ?? <em className="muted">données absentes</em>}</td>
                <td>{p.category ?? '—'}</td>
                <td>{p.supplier?.name ?? '—'}</td>
                <td>
                  <StatusBadge status={p.status} />
                  {p.arrivalPending && <span className="muted small"> (arrivée en cours)</span>}
                </td>
                <td>{formatDate(p.shippedAt)}</td>
                <td>{formatDate(p.arrivedAt)}</td>
                <td>
                  {p.shippedAt && p.arrivedAt
                    ? formatDuration((Date.parse(p.arrivedAt) - Date.parse(p.shippedAt)) / 1000)
                    : '—'}
                </td>
                <td className="actions">
                  {p.status === 'DRAFT' && user.role === 'SUPPLIER' && (
                    <>
                      <Link to={`/expedition?brouillon=${p.id}`}>Finaliser</Link>
                      <button type="button" className="link-btn danger" onClick={() => removeDraft(p.id)}>
                        Supprimer
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {products.data?.products?.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  Aucun produit ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
