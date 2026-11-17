import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeArrivalHash, computeShipmentHash, generateSalt, sha256Hex, ZERO_HASH } from '../src/hash.js';

const base = {
  number: 1,
  name: 'Vanne inox',
  category: 'Robinetterie',
  description: 'DN50',
  salt: `0x${'ab'.repeat(32)}`,
  previousHash: ZERO_HASH,
};

test('SHA-256 : vecteur de référence', () => {
  assert.equal(sha256Hex('abc'), '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test("l'empreinte d'expédition est déterministe et au format bytes32", () => {
  const h = computeShipmentHash(base);
  assert.match(h, /^0x[0-9a-f]{64}$/);
  assert.equal(computeShipmentHash({ ...base }), h);
});

test('toute modification change l’empreinte', () => {
  const h = computeShipmentHash(base);
  for (const [k, v] of Object.entries({
    number: 2,
    name: 'Vanne inox ',
    category: 'Autre',
    description: 'DN51',
    salt: `0x${'cd'.repeat(32)}`,
    previousHash: `0x${'11'.repeat(32)}`,
  })) {
    assert.notEqual(computeShipmentHash({ ...base, [k]: v }), h, `champ ${k}`);
  }
});

test('pas d’ambiguïté de séparateur entre les champs', () => {
  const a = computeShipmentHash({ ...base, name: 'A|B', category: 'C' });
  const b = computeShipmentHash({ ...base, name: 'A', category: 'B|C' });
  assert.notEqual(a, b);
});

test('casse des adresses et sels sans effet', () => {
  const args = { number: 3, shipmentHash: `0x${'AA'.repeat(32)}`, operatorAddress: '0xABCDEF0000000000000000000000000000000001', salt: base.salt };
  assert.equal(
    computeArrivalHash(args),
    computeArrivalHash({ ...args, shipmentHash: args.shipmentHash.toLowerCase(), operatorAddress: args.operatorAddress.toLowerCase() }),
  );
});

test('les sels sont aléatoires', () => {
  const s1 = generateSalt();
  assert.match(s1, /^0x[0-9a-f]{64}$/);
  assert.notEqual(s1, generateSalt());
});
