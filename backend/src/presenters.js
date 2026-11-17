export const PRODUCT_SELECT = `
  SELECT p.*, s.name AS supplier_name, o.name AS operator_name
  FROM products p
  LEFT JOIN users s ON s.id = p.supplier_id
  LEFT JOIN users o ON o.id = p.operator_id`;

const iso = (seconds) => (seconds ? new Date(Number(seconds) * 1000).toISOString() : null);

export function productDTO(row, { detailed = false } = {}) {
  const dto = {
    id: row.id,
    number: row.number,
    name: row.name,
    category: row.category,
    description: row.description,
    status: row.status,
    shippedAt: iso(row.shipped_at),
    arrivedAt: iso(row.arrived_at),
    supplier: { id: row.supplier_id, name: row.supplier_name ?? null, address: row.supplier_address },
    operator: row.operator_address || row.operator_id
      ? { id: row.operator_id, name: row.operator_name ?? null, address: row.operator_address }
      : null,
    shipmentHash: row.shipment_hash,
    arrivalHash: row.status === 'ARRIVED' ? row.arrival_hash : null,
    arrivalPending: row.status === 'SHIPPED' && Boolean(row.arrival_hash),
    offchainMissing: Boolean(row.offchain_missing),
    createdAt: row.created_at,
  };
  if (row.status === 'DRAFT') {
    dto.expectedNumber = row.expected_number;
  }
  if (detailed) {
    dto.previousHash = row.previous_hash;
    dto.salt = row.salt;
    dto.arrivalSalt = row.status === 'ARRIVED' ? row.arrival_salt : null;
  }
  return dto;
}

export function transactionDTO(t) {
  return {
    id: t.id,
    productId: t.product_id,
    productNumber: t.product_number,
    type: t.type,
    txHash: t.tx_hash,
    state: t.state,
    from: t.from_address,
    blockNumber: t.block_number,
    submittedAt: t.submitted_at ? `${t.submitted_at.replace(' ', 'T')}Z` : null,
    confirmedAt: t.confirmed_at ? `${t.confirmed_at.replace(' ', 'T')}Z` : null,
    error: t.error,
  };
}
