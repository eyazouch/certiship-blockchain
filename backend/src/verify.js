import { computeArrivalHash, computeShipmentHash, ZERO_HASH } from './hash.js';

const eq = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/**
 * Vérification d'intégrité (RM10) : recalcule les empreintes à partir de la base
 * hors chaîne et les compare à celles enregistrées dans la blockchain.
 *
 * @param row               ligne `products` de la base
 * @param chainProduct      produit lu dans le Smart Contract
 * @param chainPreviousHash empreinte d'expédition du produit n-1 lue dans le contrat (0x0 pour n = 1)
 */
export function verifyProduct({ row, chainProduct, chainPreviousHash }) {
  const checks = [];
  const add = (key, label, ok, detail) => checks.push({ key, label, ok, detail: detail ?? null });

  if (!chainProduct || chainProduct.status === 'NONE') {
    add('onchain', 'Produit enregistré dans la blockchain', false, 'Aucun enregistrement pour ce numéro');
    return { verified: false, checks, recomputed: {}, onChain: null };
  }
  add('onchain', 'Produit enregistré dans la blockchain', true);

  const hasShipmentData = Boolean(row) && !row.offchain_missing && Boolean(row.salt) && row.name != null;
  add(
    'offchain',
    'Données hors chaîne disponibles',
    hasShipmentData,
    hasShipmentData ? null : 'Données détaillées ou sel absents de la base',
  );

  add(
    'link',
    'Lien avec le produit précédent',
    eq(chainProduct.previousHash, chainPreviousHash ?? ZERO_HASH),
    `Empreinte précédente : ${chainProduct.previousHash}`,
  );

  const recomputed = {};
  if (hasShipmentData) {
    recomputed.shipmentHash = computeShipmentHash({
      number: row.number,
      name: row.name,
      category: row.category,
      description: row.description ?? '',
      salt: row.salt,
      previousHash: chainProduct.previousHash,
    });
    add(
      'shipmentHash',
      "Empreinte d'expédition",
      eq(recomputed.shipmentHash, chainProduct.shipmentHash),
      `Recalculée : ${recomputed.shipmentHash}`,
    );
  }

  if (chainProduct.status === 'ARRIVED') {
    if (row?.arrival_salt) {
      recomputed.arrivalHash = computeArrivalHash({
        number: row.number,
        shipmentHash: chainProduct.shipmentHash,
        operatorAddress: chainProduct.operator,
        salt: row.arrival_salt,
      });
      add(
        'arrivalHash',
        "Empreinte d'arrivée",
        eq(recomputed.arrivalHash, chainProduct.arrivalHash),
        `Recalculée : ${recomputed.arrivalHash}`,
      );
    } else {
      add('arrivalHash', "Empreinte d'arrivée", false, "Sel d'arrivée absent de la base");
    }
  }

  // Cohérence de la copie hors chaîne (statut et dates certifiées)
  if (row) {
    add('status', 'Statut en base conforme à la blockchain', row.status === chainProduct.status, `Base : ${row.status}`);
    add(
      'shippedAt',
      "Date d'expédition en base conforme",
      Number(row.shipped_at) === chainProduct.shippedAt,
    );
    if (chainProduct.status === 'ARRIVED') {
      add('arrivedAt', "Date d'arrivée en base conforme", Number(row.arrived_at) === chainProduct.arrivedAt);
    }
  }

  return {
    verified: checks.every((c) => c.ok),
    checks,
    recomputed,
    onChain: chainProduct,
  };
}
