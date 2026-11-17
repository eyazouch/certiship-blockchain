import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { asyncHandler, HttpError } from '../errors.js';
import { computeArrivalHash, computeShipmentHash, generateSalt, ZERO_HASH } from '../hash.js';
import { PRODUCT_SELECT, productDTO, transactionDTO } from '../presenters.js';
import { validateProductInput, validateProductNumber, validateTxHash } from '../validation.js';
import { verifyProduct } from '../verify.js';

/** Restriction de visibilité selon le rôle (confidentialité des fournisseurs). */
function scopeClause(user) {
  if (user.role === 'SUPPLIER') return { sql: 'p.supplier_id = ?', params: [user.id] };
  if (user.role === 'OPERATOR') return { sql: "p.status <> 'DRAFT'", params: [] };
  return { sql: '1 = 1', params: [] };
}

function requireWallet(user) {
  if (!user.wallet_address) throw new HttpError(400, "Aucun portefeuille n'est associé à votre compte");
  return user.wallet_address;
}

function hasPendingTx(db, productId, type) {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM transactions WHERE product_id = ? AND type = ? AND state = 'PENDING'`)
      .get(productId, type),
  );
}

function draftResponse(row) {
  return {
    id: row.id,
    expectedNumber: row.expected_number,
    previousHash: row.previous_hash,
    shipmentHash: row.shipment_hash,
  };
}

function insertPendingTx(db, { productId, productNumber, type, txHash, from }) {
  db.prepare(
    `INSERT INTO transactions (product_id, product_number, type, tx_hash, state, from_address)
     VALUES (?, ?, ?, ?, 'PENDING', ?)
     ON CONFLICT(tx_hash) DO NOTHING`,
  ).run(productId, productNumber, type, txHash, from);
}

export function productRoutes({ db, chain }) {
  const r = Router();
  const auth = requireAuth(db);
  const getRowByNumber = (n) => db.prepare(`${PRODUCT_SELECT} WHERE p.number = ?`).get(n);
  const getOwnDraft = (id, user) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id));
    if (!row || row.supplier_id !== user.id) throw new HttpError(404, 'Brouillon introuvable');
    if (row.status !== 'DRAFT') throw new HttpError(409, 'Ce produit est déjà enregistré dans la blockchain');
    return row;
  };

  // ------------------------------------------------------------------
  // Expédition (fournisseur)
  // ------------------------------------------------------------------

  /**
   * Étape 1 : prépare l'expédition. Le produit est enregistré en brouillon AVANT
   * la transaction afin de ne jamais perdre le sel (reprise possible, test 8).
   */
  r.post(
    '/shipments/prepare',
    auth,
    requireRole('SUPPLIER'),
    asyncHandler(async (req, res) => {
      const input = validateProductInput(req.body);
      const wallet = requireWallet(req.user);
      const last = await chain.getLastProduct();
      const salt = generateSalt();
      const expectedNumber = last.number + 1;
      const previousHash = last.hash || ZERO_HASH;
      const shipmentHash = computeShipmentHash({ number: expectedNumber, ...input, salt, previousHash });

      const info = db
        .prepare(
          `INSERT INTO products (name, category, description, salt, expected_number, previous_hash, shipment_hash,
             status, supplier_id, supplier_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
        )
        .run(input.name, input.category, input.description, salt, expectedNumber, previousHash, shipmentHash, req.user.id, wallet);
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
      res.status(201).json({ draft: draftResponse(row) });
    }),
  );

  /** Recalcule l'empreinte quand une autre expédition a été enregistrée entre-temps. */
  r.post(
    '/shipments/:id/refresh',
    auth,
    requireRole('SUPPLIER'),
    asyncHandler(async (req, res) => {
      const row = getOwnDraft(req.params.id, req.user);
      if (hasPendingTx(db, row.id, 'SHIPMENT')) {
        throw new HttpError(409, 'Une transaction est déjà en attente pour ce produit');
      }
      const last = await chain.getLastProduct();
      const expectedNumber = last.number + 1;
      const previousHash = last.hash || ZERO_HASH;
      const shipmentHash = computeShipmentHash({
        number: expectedNumber,
        name: row.name,
        category: row.category,
        description: row.description ?? '',
        salt: row.salt,
        previousHash,
      });
      db.prepare(
        `UPDATE products SET expected_number = ?, previous_hash = ?, shipment_hash = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(expectedNumber, previousHash, shipmentHash, row.id);
      res.json({ draft: draftResponse(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
    }),
  );

  r.post(
    '/shipments/:id/submit',
    auth,
    requireRole('SUPPLIER'),
    asyncHandler(async (req, res) => {
      const txHash = validateTxHash(req.body?.txHash);
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
      if (!row || row.supplier_id !== req.user.id) throw new HttpError(404, 'Brouillon introuvable');
      insertPendingTx(db, {
        productId: row.id,
        productNumber: row.number ?? row.expected_number,
        type: 'SHIPMENT',
        txHash,
        from: req.user.wallet_address,
      });
      res.status(202).json({ txHash });
    }),
  );

  /** Abandon d'un brouillon jamais envoyé. */
  r.delete(
    '/shipments/:id',
    auth,
    requireRole('SUPPLIER'),
    asyncHandler(async (req, res) => {
      const row = getOwnDraft(req.params.id, req.user);
      const tx = db.prepare(`SELECT 1 FROM transactions WHERE product_id = ? AND state <> 'FAILED'`).get(row.id);
      if (tx) throw new HttpError(409, 'Une transaction a déjà été envoyée pour ce brouillon');
      db.prepare('DELETE FROM transactions WHERE product_id = ?').run(row.id);
      db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
      res.status(204).end();
    }),
  );

  // ------------------------------------------------------------------
  // Arrivée (opérateur)
  // ------------------------------------------------------------------

  r.post(
    '/arrivals/prepare',
    auth,
    requireRole('OPERATOR'),
    asyncHandler(async (req, res) => {
      const number = validateProductNumber(req.body?.number);
      const wallet = requireWallet(req.user);
      const onChain = await chain.getProduct(number);
      if (onChain.status === 'NONE') throw new HttpError(404, `Le produit n°${number} n'existe pas dans la blockchain`);
      if (onChain.status === 'ARRIVED') throw new HttpError(409, `L'arrivée du produit n°${number} est déjà confirmée`);

      const row = db.prepare('SELECT * FROM products WHERE number = ?').get(number);
      if (!row) throw new HttpError(409, 'Produit pas encore synchronisé, réessayez dans quelques secondes');
      if (hasPendingTx(db, row.id, 'ARRIVAL')) {
        throw new HttpError(409, 'Une confirmation est déjà en attente pour ce produit');
      }

      const salt = generateSalt();
      const arrivalHash = computeArrivalHash({
        number,
        shipmentHash: onChain.shipmentHash,
        operatorAddress: wallet,
        salt,
      });
      db.prepare(
        `UPDATE products SET arrival_salt = ?, arrival_hash = ?, operator_id = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(salt, arrivalHash, req.user.id, row.id);
      res.json({ arrival: { number, arrivalHash } });
    }),
  );

  r.post(
    '/arrivals/:number/submit',
    auth,
    requireRole('OPERATOR'),
    asyncHandler(async (req, res) => {
      const number = validateProductNumber(req.params.number);
      const txHash = validateTxHash(req.body?.txHash);
      const row = db.prepare('SELECT id FROM products WHERE number = ?').get(number);
      if (!row) throw new HttpError(404, 'Produit introuvable');
      insertPendingTx(db, { productId: row.id, productNumber: number, type: 'ARRIVAL', txHash, from: req.user.wallet_address });
      res.status(202).json({ txHash });
    }),
  );

  // ------------------------------------------------------------------
  // Consultation, historique et vérification
  // ------------------------------------------------------------------

  r.get(
    '/products',
    auth,
    asyncHandler(async (req, res) => {
      const { q, status, category, from, to } = req.query;
      const scope = scopeClause(req.user);
      const where = [scope.sql];
      const params = [...scope.params];

      if (typeof q === 'string' && q.trim()) {
        const term = q.trim();
        if (/^\d+$/.test(term)) {
          where.push('(p.number = ? OR p.name LIKE ?)');
          params.push(Number(term), `%${term}%`);
        } else {
          where.push('(p.name LIKE ? OR p.description LIKE ? OR s.name LIKE ?)');
          params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        }
      }
      if (['DRAFT', 'SHIPPED', 'ARRIVED'].includes(status)) {
        where.push('p.status = ?');
        params.push(status);
      }
      if (typeof category === 'string' && category) {
        where.push('p.category = ?');
        params.push(category);
      }
      const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T00:00:00Z`) / 1000 : null);
      if (day(from) !== null) {
        where.push('p.shipped_at >= ?');
        params.push(day(from));
      }
      if (day(to) !== null) {
        where.push('p.shipped_at < ?');
        params.push(day(to) + 86400);
      }

      const rows = db
        .prepare(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.number IS NULL DESC, p.number DESC, p.id DESC LIMIT 500`)
        .all(...params);
      res.json({ products: rows.map((row) => productDTO(row)) });
    }),
  );

  r.get(
    '/products/categories',
    auth,
    asyncHandler(async (req, res) => {
      const scope = scopeClause(req.user);
      const rows = db
        .prepare(`SELECT DISTINCT p.category FROM products p WHERE ${scope.sql} AND p.category IS NOT NULL ORDER BY 1`)
        .all(...scope.params);
      res.json({ categories: rows.map((r) => r.category) });
    }),
  );

  r.get(
    '/stats',
    auth,
    asyncHandler(async (req, res) => {
      const scope = scopeClause(req.user);
      const rows = db
        .prepare(`SELECT p.status, COUNT(*) AS n FROM products p WHERE ${scope.sql} GROUP BY p.status`)
        .all(...scope.params);
      const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      const pendingTx = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE state = 'PENDING'`).get().n;
      const delay = db
        .prepare(
          `SELECT AVG(p.arrived_at - p.shipped_at) AS avg FROM products p WHERE ${scope.sql} AND p.status = 'ARRIVED'`,
        )
        .get(...scope.params).avg;
      res.json({
        drafts: counts.DRAFT ?? 0,
        shipped: counts.SHIPPED ?? 0,
        arrived: counts.ARRIVED ?? 0,
        pendingTransactions: pendingTx,
        averageDelaySeconds: delay == null ? null : Math.round(delay),
      });
    }),
  );

  const loadVisible = (req) => {
    const number = validateProductNumber(req.params.number);
    const row = getRowByNumber(number);
    if (!row) throw new HttpError(404, `Produit n°${number} introuvable`);
    if (req.user.role === 'SUPPLIER' && row.supplier_id !== req.user.id) {
      throw new HttpError(403, "Ce produit n'appartient pas à votre compte");
    }
    return row;
  };

  r.get(
    '/products/:number',
    auth,
    asyncHandler(async (req, res) => {
      const row = loadVisible(req);
      const txs = db.prepare('SELECT * FROM transactions WHERE product_id = ? ORDER BY id').all(row.id);
      res.json({ product: productDTO(row, { detailed: true }), transactions: txs.map(transactionDTO) });
    }),
  );

  r.get(
    '/products/:number/verify',
    auth,
    asyncHandler(async (req, res) => {
      const row = loadVisible(req);
      const chainProduct = await chain.getProduct(row.number);
      const chainPreviousHash =
        row.number > 1 ? (await chain.getProduct(row.number - 1)).shipmentHash : ZERO_HASH;
      const result = verifyProduct({ row, chainProduct, chainPreviousHash });
      res.json({ number: row.number, verifiedAt: new Date().toISOString(), ...result });
    }),
  );

  return r;
}
