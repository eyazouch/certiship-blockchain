import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { runSync } from '../src/sync.js';
import { ContractRevert, setup, WALLETS } from './helpers.js';

const product = (name) => ({ name, category: 'Pièces', description: `Description de ${name}` });

describe('API de certification', () => {
  let ctx;
  before(async () => {
    ctx = await setup();
  });
  after(() => ctx.close());

  /** Parcours complet côté fournisseur : préparation, signature (simulée), suivi. */
  async function ship(tokenKey, wallet, input) {
    const { call, chain, tokens } = ctx;
    const prep = await call('POST', '/shipments/prepare', { token: tokens[tokenKey], body: input });
    assert.equal(prep.status, 201, JSON.stringify(prep.body));
    const d = prep.body.draft;
    const txHash = chain.registerShipment(wallet, d.expectedNumber, d.previousHash, d.shipmentHash);
    await call('POST', `/shipments/${d.id}/submit`, { token: tokens[tokenKey], body: { txHash } });
    const sync = await call('POST', `/transactions/${txHash}/sync`, { token: tokens[tokenKey] });
    assert.equal(sync.body.state, 'CONFIRMED');
    return { draft: d, txHash };
  }

  test('authentification : mauvais mot de passe refusé', async () => {
    const res = await ctx.call('POST', '/auth/login', { body: { email: 'f1@test.local', password: 'faux' } });
    assert.equal(res.status, 401);
    const noToken = await ctx.call('GET', '/products');
    assert.equal(noToken.status, 401);
  });

  test('Test 1 — expédition valide : numéro 1, statut Expédié', async () => {
    const { draft } = await ship('supplier', WALLETS.supplier, product('Roulement'));
    assert.equal(draft.expectedNumber, 1);

    const res = await ctx.call('GET', '/products/1', { token: ctx.tokens.supplier });
    assert.equal(res.status, 200);
    const p = res.body.product;
    assert.equal(p.number, 1);
    assert.equal(p.status, 'SHIPPED');
    assert.equal(p.shipmentHash, draft.shipmentHash);
    assert.ok(p.shippedAt);
    assert.equal(res.body.transactions[0].state, 'CONFIRMED');
  });

  test('Test 2 — un opérateur ne peut pas déclarer une expédition', async () => {
    const res = await ctx.call('POST', '/shipments/prepare', { token: ctx.tokens.operator, body: product('X') });
    assert.equal(res.status, 403);
    // et le contrat refuse une adresse non autorisée
    assert.throws(() => ctx.chain.registerShipment(WALLETS.operator, 2, '0x00', '0x01'), ContractRevert);
  });

  test('validation des données saisies', async () => {
    const res = await ctx.call('POST', '/shipments/prepare', {
      token: ctx.tokens.supplier,
      body: { name: '   ', category: 'A' },
    });
    assert.equal(res.status, 400);
  });

  test('Test 7 — expéditions simultanées : refus puis nouvelle tentative', async () => {
    const { call, chain, tokens } = ctx;
    const a = (await call('POST', '/shipments/prepare', { token: tokens.supplier, body: product('Axe') })).body.draft;
    const b = (await call('POST', '/shipments/prepare', { token: tokens.supplier2, body: product('Joint') })).body.draft;
    assert.equal(a.expectedNumber, b.expectedNumber, 'les deux lisent le même compteur');

    chain.registerShipment(WALLETS.supplier, a.expectedNumber, a.previousHash, a.shipmentHash);
    assert.throws(
      () => chain.registerShipment(WALLETS.supplier2, b.expectedNumber, b.previousHash, b.shipmentHash),
      /UnexpectedProductId/,
    );

    const refreshed = (await call('POST', `/shipments/${b.id}/refresh`, { token: tokens.supplier2 })).body.draft;
    assert.equal(refreshed.expectedNumber, a.expectedNumber + 1);
    assert.equal(refreshed.previousHash, a.shipmentHash);
    assert.notEqual(refreshed.shipmentHash, b.shipmentHash);
    const tx = chain.registerShipment(WALLETS.supplier2, refreshed.expectedNumber, refreshed.previousHash, refreshed.shipmentHash);
    await call('POST', `/shipments/${b.id}/submit`, { token: tokens.supplier2, body: { txHash: tx } });

    await runSync(ctx.db, chain);
    const pb = (await call('GET', `/products/${refreshed.expectedNumber}`, { token: tokens.operator })).body.product;
    assert.equal(pb.name, 'Joint');
    assert.equal(pb.status, 'SHIPPED');
  });

  test('confidentialité : un fournisseur ne voit pas les produits d’un autre', async () => {
    const res = await ctx.call('GET', '/products/1', { token: ctx.tokens.supplier2 });
    assert.equal(res.status, 403);
    const list = await ctx.call('GET', '/products', { token: ctx.tokens.supplier2 });
    assert.ok(list.body.products.every((p) => p.name !== 'Roulement'));
  });

  test('Test 3 — confirmation d’arrivée valide', async () => {
    const { call, chain, tokens } = ctx;
    const prep = await call('POST', '/arrivals/prepare', { token: tokens.operator, body: { number: 1 } });
    assert.equal(prep.status, 200, JSON.stringify(prep.body));
    const tx = chain.confirmArrival(WALLETS.operator, 1, prep.body.arrival.arrivalHash);
    await call('POST', '/arrivals/1/submit', { token: tokens.operator, body: { txHash: tx } });
    await call('POST', `/transactions/${tx}/sync`, { token: tokens.operator });

    const p = (await call('GET', '/products/1', { token: tokens.operator })).body.product;
    assert.equal(p.status, 'ARRIVED');
    assert.ok(p.arrivedAt > p.shippedAt);
    assert.equal(p.operator.address, WALLETS.operator);
  });

  test('Test 4 — double confirmation refusée', async () => {
    const res = await ctx.call('POST', '/arrivals/prepare', { token: ctx.tokens.operator, body: { number: 1 } });
    assert.equal(res.status, 409);
    assert.throws(() => ctx.chain.confirmArrival(WALLETS.operator, 1, `0x${'1'.repeat(64)}`), /AlreadyArrived/);
  });

  test('Test 5 — produit inexistant', async () => {
    const res = await ctx.call('POST', '/arrivals/prepare', { token: ctx.tokens.operator, body: { number: 999 } });
    assert.equal(res.status, 404);
    assert.throws(() => ctx.chain.confirmArrival(WALLETS.operator, 999, `0x${'1'.repeat(64)}`), /ProductNotFound/);
  });

  test('vérification d’intégrité réussie', async () => {
    for (const n of [1, 2, 3]) {
      const res = await ctx.call('GET', `/products/${n}/verify`, { token: ctx.tokens.admin });
      assert.equal(res.status, 200);
      assert.equal(res.body.verified, true, `produit ${n} : ${JSON.stringify(res.body.checks)}`);
    }
  });

  test('Test 6 — modification en base détectée', async () => {
    ctx.db.prepare(`UPDATE products SET description = 'Description falsifiée' WHERE number = 1`).run();
    const res = await ctx.call('GET', '/products/1/verify', { token: ctx.tokens.admin });
    assert.equal(res.body.verified, false);
    assert.equal(res.body.checks.find((c) => c.key === 'shipmentHash').ok, false);

    ctx.db.prepare(`UPDATE products SET description = 'Description de Roulement' WHERE number = 1`).run();
    ctx.db.prepare(`UPDATE products SET arrived_at = arrived_at - 86400 WHERE number = 1`).run();
    const res2 = await ctx.call('GET', '/products/1/verify', { token: ctx.tokens.admin });
    assert.equal(res2.body.verified, false, 'date falsifiée détectée');
    assert.equal(res2.body.checks.find((c) => c.key === 'arrivedAt').ok, false);
  });

  test('Test 8 — transaction confirmée mais enregistrement hors chaîne échoué', async () => {
    const { call, chain, tokens, db } = ctx;
    const d = (await call('POST', '/shipments/prepare', { token: tokens.supplier, body: product('Moteur') })).body.draft;
    // La transaction est minée, mais l'appel /submit n'a jamais lieu (panne)
    chain.registerShipment(WALLETS.supplier, d.expectedNumber, d.previousHash, d.shipmentHash);
    assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(d.id).status, 'DRAFT');

    await runSync(db, chain);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(d.id);
    assert.equal(row.status, 'SHIPPED');
    assert.equal(row.number, d.expectedNumber);
    const tx = db.prepare('SELECT * FROM transactions WHERE product_id = ?').get(d.id);
    assert.equal(tx.state, 'CONFIRMED');

    const v = await call('GET', `/products/${d.expectedNumber}/verify`, { token: tokens.admin });
    assert.equal(v.body.verified, true);
  });

  test('événement on-chain sans données hors chaîne : signalé', async () => {
    const { chain, db, call, tokens } = ctx;
    const last = await chain.getLastProduct();
    chain.registerShipment(WALLETS.supplier2, last.number + 1, last.hash, `0x${'ee'.repeat(32)}`);
    await runSync(db, chain);
    const v = await call('GET', `/products/${last.number + 1}/verify`, { token: tokens.admin });
    assert.equal(v.body.verified, false);
    assert.equal(v.body.checks.find((c) => c.key === 'offchain').ok, false);
  });

  test('le statut ne peut pas être modifié manuellement (EF12)', async () => {
    const res = await ctx.call('PATCH', '/products/1', { token: ctx.tokens.admin, body: { status: 'ARRIVED' } });
    assert.equal(res.status, 404);
  });

  test('transaction refusée par le contrat : état FAILED', async () => {
    const { call, chain, tokens, db } = ctx;
    const d = (await call('POST', '/shipments/prepare', { token: tokens.supplier, body: product('Capteur') })).body.draft;
    const failedHash = `0x${'f'.repeat(64)}`;
    chain.receipts.set(failedHash, { status: 'reverted', blockNumber: 99, from: WALLETS.supplier, events: [] });
    await call('POST', `/shipments/${d.id}/submit`, { token: tokens.supplier, body: { txHash: failedHash } });
    const res = await call('POST', `/transactions/${failedHash}/sync`, { token: tokens.supplier });
    assert.equal(res.body.state, 'FAILED');
    assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(d.id).status, 'DRAFT');
  });

  test('historique filtré et gestion des utilisateurs', async () => {
    const { call, tokens } = ctx;
    const arrived = await call('GET', '/products?status=ARRIVED', { token: tokens.operator });
    assert.ok(arrived.body.products.length >= 1);
    assert.ok(arrived.body.products.every((p) => p.status === 'ARRIVED'));

    const users = await call('GET', '/users', { token: tokens.admin });
    assert.equal(users.status, 200);
    assert.equal(users.body.users.find((u) => u.email === 'f1@test.local').chainRoles.isSupplier, true);
    assert.equal((await call('GET', '/users', { token: tokens.supplier })).status, 403);

    const created = await call('POST', '/users', {
      token: tokens.admin,
      body: { name: 'Nouveau', email: 'n@test.local', password: 'Motdepasse1', role: 'OPERATOR' },
    });
    assert.equal(created.status, 400, 'portefeuille obligatoire');
  });
});
