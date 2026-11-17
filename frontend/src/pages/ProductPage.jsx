import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { confirmArrivalOnChain, describeError } from '../blockchain.js';
import { Alert, Hash, Progress, StatusBadge, TxLink, TxStateBadge } from '../components/ui.jsx';
import { useWalletGuard, WalletRequirement } from '../components/Wallet.jsx';
import { formatDate, formatDuration, TX_TYPE_LABELS } from '../format.js';
import { useSession } from '../session.jsx';

function Actor({ actor }) {
  if (!actor) return <span className="muted">—</span>;
  return (
    <span>
      {actor.name ?? <em className="muted">inconnu</em>} <Hash value={actor.address} />
    </span>
  );
}

export function ProductPage() {
  const { number } = useParams();
  const { user, appConfig } = useSession();
  const qc = useQueryClient();
  const guard = useWalletGuard();
  const [step, setStep] = useState(null);
  const [actionError, setActionError] = useState(null);

  const query = useQuery({ queryKey: ['product', number], queryFn: () => api(`/products/${number}`) });
  const verify = useMutation({ mutationFn: () => api(`/products/${number}/verify`) });

  const confirm = async () => {
    setActionError(null);
    try {
      await confirmArrivalOnChain({ number: Number(number), ...guard, onStep: setStep });
      verify.reset();
      qc.invalidateQueries();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setStep(null);
    }
  };

  if (query.isLoading) return <p className="muted">Chargement…</p>;
  if (query.error) return <Alert kind="error">{query.error.message}</Alert>;
  const { product: p, transactions } = query.data;
  const delay = p.shippedAt && p.arrivedAt ? (Date.parse(p.arrivedAt) - Date.parse(p.shippedAt)) / 1000 : null;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>
          Produit n°{p.number} <StatusBadge status={p.status} />
        </h1>
        <Link to="/produits">← Historique</Link>
      </div>

      {p.offchainMissing && (
        <Alert kind="warn">
          Ce produit existe dans la blockchain mais ses données détaillées sont absentes de la base.
        </Alert>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Informations</h2>
          <dl>
            <dt>Nom</dt>
            <dd>{p.name ?? '—'}</dd>
            <dt>Catégorie</dt>
            <dd>{p.category ?? '—'}</dd>
            <dt>Description</dt>
            <dd className="pre">{p.description || '—'}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Dates certifiées</h2>
          <dl>
            <dt>Expédition</dt>
            <dd>{formatDate(p.shippedAt)}</dd>
            <dt>Fournisseur</dt>
            <dd>
              <Actor actor={p.supplier} />
            </dd>
            <dt>Arrivée</dt>
            <dd>{p.arrivedAt ? formatDate(p.arrivedAt) : p.arrivalPending ? 'Confirmation en cours…' : 'Non arrivé'}</dd>
            <dt>Opérateur</dt>
            <dd>{p.status === 'ARRIVED' ? <Actor actor={p.operator} /> : '—'}</dd>
            <dt>Délai</dt>
            <dd>{formatDuration(delay)}</dd>
          </dl>
        </section>
      </div>

      {user.role === 'OPERATOR' && p.status === 'SHIPPED' && (
        <section className="card">
          <h2>Confirmer la réception</h2>
          <WalletRequirement guard={guard} />
          <Alert kind="error">{actionError}</Alert>
          <button type="button" className="btn" disabled={!guard.ready || Boolean(step)} onClick={confirm}>
            Confirmer l’arrivée du produit n°{p.number}
          </button>
          <Progress step={step} />
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Vérification d’intégrité</h2>
          <button type="button" className="btn" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? 'Vérification…' : 'Vérifier'}
          </button>
        </div>
        <p className="muted small">
          Recalcule les empreintes SHA-256 à partir des données de la base et les compare à celles enregistrées dans la
          blockchain.
        </p>
        <Alert kind="error">{verify.error?.message}</Alert>
        {verify.data && (
          <>
            <div className={`verdict ${verify.data.verified ? 'ok' : 'ko'}`}>
              {verify.data.verified ? '✔ Intégrité vérifiée' : '✘ Intégrité non vérifiée'}
              <span className="muted small"> — {formatDate(verify.data.verifiedAt)}</span>
            </div>
            <ul className="checks">
              {verify.data.checks.map((c) => (
                <li key={c.key} className={c.ok ? 'ok' : 'ko'}>
                  <span>{c.ok ? '✔' : '✘'}</span> {c.label}
                  {c.detail && <div className="muted small mono">{c.detail}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>Empreintes</h2>
        <dl>
          <dt>Empreinte d’expédition</dt>
          <dd>
            <Hash value={p.shipmentHash} full />
          </dd>
          <dt>Empreinte précédente</dt>
          <dd>
            <Hash value={p.previousHash} full />
          </dd>
          <dt>Empreinte d’arrivée</dt>
          <dd>
            <Hash value={p.arrivalHash} full />
          </dd>
          <dt>Sel d’expédition</dt>
          <dd>
            <Hash value={p.salt} />
          </dd>
        </dl>
      </section>

      <section className="card table-wrap">
        <h2>Transactions blockchain</h2>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Hash</th>
              <th>État</th>
              <th>Bloc</th>
              <th>Émetteur</th>
              <th>Soumise</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{TX_TYPE_LABELS[t.type]}</td>
                <td>
                  <TxLink hash={t.txHash} chainId={appConfig?.chainId} />
                </td>
                <td>
                  <TxStateBadge state={t.state} />
                </td>
                <td>{t.blockNumber ?? '—'}</td>
                <td>
                  <Hash value={t.from} />
                </td>
                <td>{formatDate(t.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
