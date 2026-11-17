import { getMeta, inTransaction, setMeta } from './db.js';

/**
 * Synchronisation blockchain -> base hors chaîne.
 *
 * Toutes les fonctions d'application d'événements sont idempotentes : on peut les
 * rejouer sans risque. C'est ce qui permet la reprise après un échec de la base
 * (scénario de test 8) : le produit est enregistré en brouillon AVANT l'envoi de la
 * transaction (avec son sel), puis l'indexeur retrouve l'événement on-chain grâce à
 * l'empreinte et complète l'enregistrement.
 */

function userIdByWallet(db, wallet) {
  return db.prepare('SELECT id FROM users WHERE wallet_address = ?').get(wallet)?.id ?? null;
}

export function upsertConfirmedTx(db, { productId, productNumber, type, txHash, from, blockNumber }) {
  db.prepare(
    `INSERT INTO transactions (product_id, product_number, type, tx_hash, state, from_address, block_number, confirmed_at)
     VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, datetime('now'))
     ON CONFLICT(tx_hash) DO UPDATE SET
       state = 'CONFIRMED',
       product_id = COALESCE(transactions.product_id, excluded.product_id),
       product_number = excluded.product_number,
       from_address = excluded.from_address,
       block_number = excluded.block_number,
       confirmed_at = COALESCE(transactions.confirmed_at, excluded.confirmed_at),
       error = NULL`,
  ).run(productId ?? null, productNumber, type, txHash, from, blockNumber);
}

export function applyShipmentEvent(db, ev) {
  return inTransaction(db, () => {
    let row = db.prepare('SELECT * FROM products WHERE shipment_hash = ?').get(ev.shipmentHash);

    if (row && row.number == null) {
      db.prepare(
        `UPDATE products SET number = ?, expected_number = ?, previous_hash = ?, status = 'SHIPPED',
           shipped_at = ?, supplier_address = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(ev.productId, ev.productId, ev.previousHash, ev.timestamp, ev.supplier, row.id);
    } else if (!row) {
      // Événement sans données hors chaîne (base perdue ou expédition faite hors application)
      const existing = db.prepare('SELECT id FROM products WHERE number = ?').get(ev.productId);
      if (!existing) {
        const info = db
          .prepare(
            `INSERT INTO products (number, expected_number, previous_hash, shipment_hash, status, shipped_at,
               supplier_address, supplier_id, offchain_missing)
             VALUES (?, ?, ?, ?, 'SHIPPED', ?, ?, ?, 1)`,
          )
          .run(
            ev.productId,
            ev.productId,
            ev.previousHash,
            ev.shipmentHash,
            ev.timestamp,
            ev.supplier,
            userIdByWallet(db, ev.supplier),
          );
        row = { id: Number(info.lastInsertRowid) };
      } else {
        row = existing;
      }
    }

    upsertConfirmedTx(db, {
      productId: row.id,
      productNumber: ev.productId,
      type: 'SHIPMENT',
      txHash: ev.txHash,
      from: ev.supplier,
      blockNumber: ev.blockNumber,
    });
    return row.id;
  });
}

export function applyArrivalEvent(db, ev) {
  return inTransaction(db, () => {
    let row = db.prepare('SELECT * FROM products WHERE number = ?').get(ev.productId);
    if (!row) {
      const info = db
        .prepare(`INSERT INTO products (number, status, offchain_missing) VALUES (?, 'SHIPPED', 1)`)
        .run(ev.productId);
      row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
    }

    if (row.status !== 'ARRIVED') {
      // Si l'empreinte préparée ne correspond pas, on garde celle de la blockchain (référence)
      // et on efface le sel : la vérification signalera l'incohérence.
      const sameHash = (row.arrival_hash || '').toLowerCase() === ev.arrivalHash;
      db.prepare(
        `UPDATE products SET status = 'ARRIVED', arrived_at = ?, arrival_hash = ?, arrival_salt = ?,
           operator_address = ?, operator_id = COALESCE(?, operator_id), updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        ev.timestamp,
        ev.arrivalHash,
        sameHash ? row.arrival_salt : null,
        ev.operator,
        userIdByWallet(db, ev.operator),
        row.id,
      );
    }

    upsertConfirmedTx(db, {
      productId: row.id,
      productNumber: ev.productId,
      type: 'ARRIVAL',
      txHash: ev.txHash,
      from: ev.operator,
      blockNumber: ev.blockNumber,
    });
    return row.id;
  });
}

export function applyEvent(db, ev) {
  if (ev.name === 'ShipmentRegistered') return applyShipmentEvent(db, ev);
  if (ev.name === 'ArrivalConfirmed') return applyArrivalEvent(db, ev);
  return null;
}

/** Vérifie l'état d'une transaction soumise et applique ses événements. */
export async function confirmTransaction(db, chain, txHash) {
  const receipt = await chain.getReceipt(txHash);
  if (!receipt) return { state: 'PENDING' };

  if (receipt.status !== 'success') {
    db.prepare(
      `UPDATE transactions SET state = 'FAILED', block_number = ?, error = ?, confirmed_at = datetime('now')
       WHERE tx_hash = ?`,
    ).run(receipt.blockNumber, 'Transaction refusée par le Smart Contract', txHash);
    return { state: 'FAILED' };
  }

  for (const ev of receipt.events) applyEvent(db, ev);
  const tx = db.prepare('SELECT * FROM transactions WHERE tx_hash = ?').get(txHash);
  if (tx && tx.state === 'PENDING') {
    db.prepare(
      `UPDATE transactions SET state = 'CONFIRMED', block_number = ?, confirmed_at = datetime('now') WHERE tx_hash = ?`,
    ).run(receipt.blockNumber, txHash);
  }
  return { state: 'CONFIRMED', events: receipt.events };
}

/** Parcourt les événements depuis le dernier bloc synchronisé puis traite les transactions en attente. */
export async function runSync(db, chain, { deployBlock = 0n, blockRange = 2000n } = {}) {
  if (!chain.enabled) return { skipped: true };

  // Changement de contrat (redéploiement) : on repart du bloc de déploiement
  if (getMeta(db, 'contract_address') !== chain.contractAddress) {
    setMeta(db, 'contract_address', chain.contractAddress);
    db.prepare(`DELETE FROM meta WHERE key = 'last_synced_block'`).run();
  }

  const latest = await chain.getBlockNumber();
  const last = getMeta(db, 'last_synced_block');
  let from = last !== null ? BigInt(last) + 1n : deployBlock;
  if (last !== null && BigInt(last) > latest) {
    // Chaîne locale redémarrée (Anvil) : on resynchronise depuis le début
    from = deployBlock;
  }

  let applied = 0;
  while (from <= latest) {
    const to = from + blockRange - 1n < latest ? from + blockRange - 1n : latest;
    const events = await chain.getEvents(from, to);
    for (const ev of events) {
      applyEvent(db, ev);
      applied++;
    }
    setMeta(db, 'last_synced_block', to);
    from = to + 1n;
  }

  const pending = db.prepare(`SELECT tx_hash FROM transactions WHERE state = 'PENDING'`).all();
  for (const { tx_hash } of pending) {
    await confirmTransaction(db, chain, tx_hash);
  }

  return { latestBlock: Number(latest), eventsApplied: applied, pendingChecked: pending.length };
}

export function startSyncLoop(db, chain, options, intervalMs) {
  let running = false;
  let lastError = null;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSync(db, chain, options);
      if (lastError) console.log('[sync] connexion blockchain rétablie');
      lastError = null;
    } catch (err) {
      const msg = err.shortMessage || err.message;
      if (msg !== lastError) console.warn(`[sync] échec : ${msg}`);
      lastError = msg;
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
