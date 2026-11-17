import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api.js';
import { describeError, setChainRole } from '../blockchain.js';
import { Alert, Hash, Progress } from '../components/ui.jsx';
import { useWalletGuard, WalletRequirement } from '../components/Wallet.jsx';
import { ROLE_LABELS, sameAddress } from '../format.js';

const EMPTY = { name: '', email: '', password: '', role: 'SUPPLIER', walletAddress: '' };

/** Gestion des fournisseurs et opérateurs autorisés (EF09). */
export function AdminPage() {
  const qc = useQueryClient();
  const guard = useWalletGuard();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('/users') });
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const wrap = async (fn, success) => {
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(success);
      refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStep(null);
    }
  };

  const create = (e) => {
    e.preventDefault();
    wrap(async () => {
      await api('/users', { method: 'POST', body: { ...form, walletAddress: form.walletAddress || undefined } });
      setForm(EMPTY);
    }, 'Compte créé. Pensez à autoriser son portefeuille dans le Smart Contract.');
  };

  const toggleActive = (u) =>
    wrap(() => api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), 'Compte mis à jour.');

  const chainRole = (u, authorized) =>
    wrap(
      () => setChainRole({ role: u.role, target: u.walletAddress, authorized, ...guard, onStep: setStep }),
      authorized ? 'Portefeuille autorisé dans le Smart Contract.' : 'Autorisation révoquée dans le Smart Contract.',
    );

  const resync = () =>
    wrap(async () => {
      const r = await api('/sync', { method: 'POST' });
      setMsg(`Synchronisation terminée : ${r.eventsApplied ?? 0} événement(s) appliqué(s).`);
    });

  const data = users.data;
  const isChainAdmin = data?.chainAdmin && sameAddress(data.chainAdmin, guard.account);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Utilisateurs et autorisations</h1>
        <button type="button" className="btn btn-secondary" onClick={resync}>
          Resynchroniser depuis la blockchain
        </button>
      </div>

      <Alert kind="error">{error || users.error?.message}</Alert>
      <Alert kind="success">{msg}</Alert>
      <Alert kind="warn">{data?.chainError && `Blockchain : ${data.chainError}`}</Alert>
      <WalletRequirement guard={guard} />
      {guard.ready && data?.chainAdmin && !isChainAdmin && (
        <Alert kind="warn">
          Le portefeuille connecté n’est pas l’administrateur du contrat (<Hash value={data.chainAdmin} />). Les
          autorisations on-chain échoueront.
        </Alert>
      )}
      <Progress step={step} />

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Portefeuille</th>
              <th>Autorisé on-chain</th>
              <th>Compte</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.users ?? []).map((u) => {
              const onChain =
                u.role === 'SUPPLIER' ? u.chainRoles?.isSupplier : u.role === 'OPERATOR' ? u.chainRoles?.isOperator : null;
              return (
                <tr key={u.id} className={u.active ? '' : 'inactive'}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    <Hash value={u.walletAddress} />
                  </td>
                  <td>
                    {u.role === 'ADMIN' ? (
                      sameAddress(u.walletAddress, data.chainAdmin) ? (
                        'Admin du contrat'
                      ) : (
                        '—'
                      )
                    ) : onChain == null ? (
                      '?'
                    ) : onChain ? (
                      <span className="badge badge-arrived">Oui</span>
                    ) : (
                      <span className="badge badge-draft">Non</span>
                    )}
                  </td>
                  <td>{u.active ? 'Actif' : 'Désactivé'}</td>
                  <td className="actions">
                    {u.role !== 'ADMIN' && onChain != null && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!guard.ready || Boolean(step)}
                        onClick={() => chainRole(u, !onChain)}
                      >
                        {onChain ? 'Révoquer on-chain' : 'Autoriser on-chain'}
                      </button>
                    )}
                    {u.role !== 'ADMIN' && (
                      <button type="button" className="link-btn" onClick={() => toggleActive(u)}>
                        {u.active ? 'Désactiver' : 'Réactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <form className="card form" onSubmit={create}>
        <h2>Nouveau compte</h2>
        <div className="grid-2">
          <label>
            Nom
            <input value={form.name} onChange={set('name')} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} required />
          </label>
          <label>
            Mot de passe (8 caractères min.)
            <input type="password" value={form.password} onChange={set('password')} minLength={8} required />
          </label>
          <label>
            Rôle
            <select value={form.role} onChange={set('role')}>
              <option value="SUPPLIER">Fournisseur</option>
              <option value="OPERATOR">Opérateur usine</option>
              <option value="ADMIN">Administrateur</option>
            </select>
          </label>
          <label>
            Adresse du portefeuille
            <input
              value={form.walletAddress}
              onChange={set('walletAddress')}
              placeholder="0x…"
              pattern="0x[0-9a-fA-F]{40}"
              required={form.role !== 'ADMIN'}
            />
          </label>
        </div>
        <button className="btn">Créer le compte</button>
      </form>
    </div>
  );
}
