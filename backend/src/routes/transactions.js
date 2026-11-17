import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { asyncHandler, HttpError } from '../errors.js';
import { transactionDTO } from '../presenters.js';
import { confirmTransaction, runSync } from '../sync.js';
import { validateTxHash } from '../validation.js';

/** Suivi de l'état des transactions blockchain (EF10). */
export function transactionRoutes({ db, chain, syncOptions }) {
  const r = Router();
  const auth = requireAuth(db);

  r.get(
    '/transactions',
    auth,
    asyncHandler(async (req, res) => {
      const where = ['1 = 1'];
      const params = [];
      if (req.user.role === 'SUPPLIER') {
        where.push('p.supplier_id = ?');
        params.push(req.user.id);
      }
      if (['PENDING', 'CONFIRMED', 'FAILED'].includes(req.query.state)) {
        where.push('t.state = ?');
        params.push(req.query.state);
      }
      if (['SHIPMENT', 'ARRIVAL'].includes(req.query.type)) {
        where.push('t.type = ?');
        params.push(req.query.type);
      }
      const rows = db
        .prepare(
          `SELECT t.* FROM transactions t LEFT JOIN products p ON p.id = t.product_id
           WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT 500`,
        )
        .all(...params);
      res.json({ transactions: rows.map(transactionDTO) });
    }),
  );

  /** Demande la vérification immédiate d'une transaction (appelé par le frontend après minage). */
  r.post(
    '/transactions/:hash/sync',
    auth,
    asyncHandler(async (req, res) => {
      const txHash = validateTxHash(req.params.hash);
      const known = db.prepare('SELECT 1 FROM transactions WHERE tx_hash = ?').get(txHash);
      if (!known) throw new HttpError(404, 'Transaction inconnue');
      const result = await confirmTransaction(db, chain, txHash);
      const tx = db.prepare('SELECT * FROM transactions WHERE tx_hash = ?').get(txHash);
      res.json({ state: result.state, transaction: transactionDTO(tx) });
    }),
  );

  /** Resynchronisation complète depuis la blockchain (reprise après incident). */
  r.post(
    '/sync',
    auth,
    requireRole('ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(await runSync(db, chain, syncOptions));
    }),
  );

  return r;
}
