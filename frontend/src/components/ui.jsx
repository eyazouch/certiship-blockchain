import { useState } from 'react';
import { explorerTxUrl } from '../wagmi.js';
import { shortHash, STATUS_LABELS, TX_STATE_LABELS } from '../format.js';

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status?.toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function TxStateBadge({ state }) {
  return <span className={`badge tx-${state?.toLowerCase()}`}>{TX_STATE_LABELS[state] ?? state}</span>;
}

export function Hash({ value, full = false }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  return (
    <span className="hash" title={value}>
      <code>{full ? value : shortHash(value)}</code>
      <button type="button" className="link-btn" onClick={copy} aria-label="Copier">
        {copied ? 'copié' : 'copier'}
      </button>
    </span>
  );
}

export function TxLink({ hash, chainId }) {
  const url = explorerTxUrl(chainId, hash);
  if (!url) return <Hash value={hash} />;
  return (
    <span className="hash">
      <a href={url} target="_blank" rel="noreferrer">
        <code>{shortHash(hash)}</code>
      </a>
    </span>
  );
}

export function Alert({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

const STEP_LABELS = {
  prepare: 'Préparation et calcul de l’empreinte',
  simulate: 'Vérification par le Smart Contract',
  sign: 'Signature dans MetaMask',
  mining: 'Attente de la confirmation du bloc',
  sync: 'Synchronisation avec la base',
  retry: 'Expédition concurrente détectée : nouvelle tentative',
};

export function Progress({ step }) {
  if (!step) return null;
  return (
    <div className="progress">
      <span className="spinner" aria-hidden="true" /> {STEP_LABELS[step] ?? step}…
    </div>
  );
}
