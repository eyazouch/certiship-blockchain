import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { describeError, shipProduct } from '../blockchain.js';
import { Alert, Hash, Progress } from '../components/ui.jsx';
import { useWalletGuard, WalletRequirement } from '../components/Wallet.jsx';

const EMPTY = { name: '', category: '', description: '' };

export function ShipmentPage() {
  const guard = useWalletGuard();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const resumeId = params.get('brouillon');
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/products/categories') });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const busy = Boolean(step);

  const run = async (getDraft) => {
    setError(null);
    setResult(null);
    try {
      setStep('prepare');
      const draft = await getDraft();
      const res = await shipProduct({ draft, ...guard, onStep: setStep });
      setResult(res);
      setForm(EMPTY);
      qc.invalidateQueries();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStep(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => (await api('/shipments/prepare', { method: 'POST', body: form })).draft);
  };

  // Reprise d'un brouillon non envoyé : on recalcule l'empreinte avec l'état actuel du contrat
  const resume = () => run(async () => (await api(`/shipments/${resumeId}/refresh`, { method: 'POST' })).draft);

  return (
    <div className="stack narrow">
      <h1>Déclarer une expédition</h1>
      <p className="muted">
        Le numéro du produit est attribué par le Smart Contract. La date d’expédition certifiée est celle du bloc qui
        contient votre transaction.
      </p>

      <WalletRequirement guard={guard} />
      <Alert kind="error">{error}</Alert>
      {result && (
        <Alert kind="success">
          Expédition certifiée : produit <Link to={`/produits/${result.number}`}>n°{result.number}</Link>. Transaction{' '}
          <Hash value={result.hash} />
        </Alert>
      )}

      {resumeId && !result && (
        <div className="card">
          <p>Ce brouillon n’a pas encore été enregistré dans la blockchain.</p>
          <button type="button" className="btn" disabled={!guard.ready || busy} onClick={resume}>
            Finaliser l’expédition
          </button>
        </div>
      )}

      {!resumeId && (
        <form className="card form" onSubmit={submit}>
          <label>
            Nom du produit
            <input value={form.name} onChange={set('name')} maxLength={120} required disabled={busy} />
          </label>
          <label>
            Catégorie
            <input
              value={form.category}
              onChange={set('category')}
              maxLength={60}
              required
              list="categories"
              disabled={busy}
            />
            <datalist id="categories">
              {(categories.data?.categories ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={set('description')} maxLength={2000} rows={5} disabled={busy} />
          </label>
          <p className="hint">
            Les données détaillées restent dans la base de l’application. Seule leur empreinte SHA-256 (salée) est
            publiée dans la blockchain.
          </p>
          <button className="btn" disabled={!guard.ready || busy}>
            Déclarer l’expédition
          </button>
        </form>
      )}
      <Progress step={step} />
    </div>
  );
}
