import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Hash, TxLink, TxStateBadge } from '../components/ui.jsx';
import { formatDate, TX_TYPE_LABELS } from '../format.js';
import { useSession } from '../session.jsx';

/** Suivi de l'état des transactions blockchain (EF10). */
export function TransactionsPage() {
  const { appConfig } = useSession();
  const [filters, setFilters] = useState({ state: '', type: '' });
  const txs = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api(`/transactions${qs(filters)}`),
    refetchInterval: 5000,
  });
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="stack">
      <h1>Transactions blockchain</h1>
      <div className="card filters">
        <select value={filters.state} onChange={set('state')}>
          <option value="">Tous les états</option>
          <option value="PENDING">En attente</option>
          <option value="CONFIRMED">Confirmées</option>
          <option value="FAILED">Échouées</option>
        </select>
        <select value={filters.type} onChange={set('type')}>
          <option value="">Tous les types</option>
          <option value="SHIPMENT">Expédition</option>
          <option value="ARRIVAL">Arrivée</option>
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Type</th>
              <th>Hash</th>
              <th>État</th>
              <th>Bloc</th>
              <th>Émetteur</th>
              <th>Soumise</th>
              <th>Confirmée</th>
            </tr>
          </thead>
          <tbody>
            {(txs.data?.transactions ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.productNumber ? <Link to={`/produits/${t.productNumber}`}>#{t.productNumber}</Link> : '—'}</td>
                <td>{TX_TYPE_LABELS[t.type]}</td>
                <td>
                  <TxLink hash={t.txHash} chainId={appConfig?.chainId} />
                </td>
                <td>
                  <TxStateBadge state={t.state} />
                  {t.error && <div className="muted small">{t.error}</div>}
                </td>
                <td>{t.blockNumber ?? '—'}</td>
                <td>
                  <Hash value={t.from} />
                </td>
                <td>{formatDate(t.submittedAt)}</td>
                <td>{formatDate(t.confirmedAt)}</td>
              </tr>
            ))}
            {txs.data?.transactions?.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  Aucune transaction.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
