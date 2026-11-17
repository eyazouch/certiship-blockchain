import { createHash, randomBytes } from 'node:crypto';

export const ZERO_HASH = `0x${'0'.repeat(64)}`;

/** Sel aléatoire de 32 octets, en hexadécimal préfixé 0x. */
export function generateSalt() {
  return `0x${randomBytes(32).toString('hex')}`;
}

/** SHA-256 d'une chaîne UTF-8, renvoyé au format bytes32 (0x + 64 hex). */
export function sha256Hex(text) {
  return `0x${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * Empreinte d'expédition.
 * Sérialisation canonique : tableau JSON ordonné (aucune ambiguïté de séparateur).
 * Le numéro et l'empreinte précédente y figurent pour chaîner les produits (EF05).
 */
export function computeShipmentHash({ number, name, category, description, salt, previousHash }) {
  const payload = JSON.stringify([
    'SHIPMENT-v1',
    String(number),
    name,
    category,
    description,
    salt.toLowerCase(),
    previousHash.toLowerCase(),
  ]);
  return sha256Hex(payload);
}

/** Empreinte d'arrivée : liée à l'empreinte d'expédition et à l'opérateur. */
export function computeArrivalHash({ number, shipmentHash, operatorAddress, salt }) {
  const payload = JSON.stringify([
    'ARRIVAL-v1',
    String(number),
    shipmentHash.toLowerCase(),
    operatorAddress.toLowerCase(),
    salt.toLowerCase(),
  ]);
  return sha256Hex(payload);
}
