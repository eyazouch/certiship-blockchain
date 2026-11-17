import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { StatusBadge } from '../components/ui.jsx';
import { formatDate } from '../format.js';

/** Recherche d'un produit par numéro et liste des produits en transit (opérateur). */
export function ArrivalPage() {
  const navigate = useNavigate();
  const [number, setNumber] = useState('');
  const inTransit = useQuery({
    queryKey: ['products', { status: 'SHIPPED' }],
    queryFn: () => api('/products?status=SHIPPED'),
    refetchInterval: 10000,
  });

  const search = (e) => {
    e.preventDefault();
    if (/^\d+$/.test(number.trim())) navigate(`/produits/${number.trim()}`);
  };

  return (
    <div className="stack">
      <h1>Confirmer une arrivée</h1>
      <form className="card search" onSubmit={search}>
        <label className="inline">
          Numéro du produit
          <input inputMode="numeric" pattern="[0-9]+" value={number} onChange={(e) => setNumber(e.target.value)} required />
        </label>
        <button className="btn">Rechercher</button>
      </form>

      <section className="card table-wrap">
        <h2>Produits en transit</h2>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Nom</th>
              <th>Fournisseur</th>
              <th>Expédié le</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(inTransit.data?.products ?? []).map((p) => (
              <tr key={p.id}>
                <td>#{p.number}</td>
                <td>{p.name ?? '—'}</td>
                <td>{p.supplier?.name ?? '—'}</td>
                <td>{formatDate(p.shippedAt)}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  <Link to={`/produits/${p.number}`}>Ouvrir</Link>
                </td>
              </tr>
            ))}
            {inTransit.data?.products?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Aucun produit en transit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
