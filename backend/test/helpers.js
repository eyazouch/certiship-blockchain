import { getAddress } from 'viem';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { openDatabase } from '../src/db.js';
import { ZERO_HASH } from '../src/hash.js';

export const WALLETS = {
  admin: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  supplier: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  operator: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  supplier2: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
};

export class ContractRevert extends Error {}

/**
 * Simulation en mémoire du Smart Contract, reproduisant ses règles (RM1 à RM7).
 * Permet de tester l'API sans nœud Ethereum.
 */
export class FakeChain {
  enabled = true;
  chainId = 31337;
  contractAddress = getAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3');
  products = [];
  receipts = new Map();
  events = [];
  block = 1n;
  time = 1_700_000_000;
  suppliers = new Set([WALLETS.supplier, WALLETS.supplier2]);
  operators = new Set([WALLETS.operator]);
  txCounter = 0;

  #mine(from, events, ok = true) {
    this.block += 1n;
    this.time += 60;
    const txHash = `0x${(++this.txCounter).toString(16).padStart(64, '0')}`;
    const evs = events.map((e) => ({ ...e(this.time), txHash, blockNumber: Number(this.block) }));
    this.receipts.set(txHash, { status: ok ? 'success' : 'reverted', blockNumber: Number(this.block), from, events: evs });
    if (ok) this.events.push(...evs);
    return txHash;
  }

  /** Équivalent d'un envoi via MetaMask : lève ContractRevert si la simulation échoue. */
  registerShipment(from, expectedId, previousHash, shipmentHash) {
    if (!this.suppliers.has(from)) throw new ContractRevert('NotSupplier');
    const id = this.products.length + 1;
    const last = this.products.at(-1)?.shipmentHash ?? ZERO_HASH;
    if (expectedId !== id) throw new ContractRevert('UnexpectedProductId');
    if (previousHash.toLowerCase() !== last) throw new ContractRevert('PreviousHashMismatch');
    const p = {
      shipmentHash: shipmentHash.toLowerCase(),
      previousHash: previousHash.toLowerCase(),
      arrivalHash: ZERO_HASH,
      supplier: from,
      shippedAt: 0,
      status: 'SHIPPED',
      operator: '0x0000000000000000000000000000000000000000',
      arrivedAt: 0,
    };
    this.products.push(p);
    return this.#mine(from, [
      (t) => {
        p.shippedAt = t;
        return { name: 'ShipmentRegistered', productId: id, supplier: from, shipmentHash: p.shipmentHash, previousHash: p.previousHash, timestamp: t };
      },
    ]);
  }

  confirmArrival(from, id, arrivalHash) {
    if (!this.operators.has(from)) throw new ContractRevert('NotOperator');
    const p = this.products[id - 1];
    if (!p) throw new ContractRevert('ProductNotFound');
    if (p.status === 'ARRIVED') throw new ContractRevert('AlreadyArrived');
    return this.#mine(from, [
      (t) => {
        Object.assign(p, { arrivalHash: arrivalHash.toLowerCase(), operator: from, arrivedAt: t, status: 'ARRIVED' });
        return { name: 'ArrivalConfirmed', productId: id, operator: from, arrivalHash: p.arrivalHash, timestamp: t };
      },
    ]);
  }

  async getLastProduct() {
    return { number: this.products.length, hash: this.products.at(-1)?.shipmentHash ?? ZERO_HASH };
  }
  async getProduct(n) {
    return (
      this.products[n - 1] ?? {
        shipmentHash: ZERO_HASH,
        previousHash: ZERO_HASH,
        arrivalHash: ZERO_HASH,
        supplier: '0x0000000000000000000000000000000000000000',
        shippedAt: 0,
        status: 'NONE',
        operator: '0x0000000000000000000000000000000000000000',
        arrivedAt: 0,
      }
    );
  }
  async getRoles(w) {
    return { isSupplier: this.suppliers.has(w), isOperator: this.operators.has(w) };
  }
  async getAdmin() {
    return WALLETS.admin;
  }
  async getBlockNumber() {
    return this.block;
  }
  async getReceipt(h) {
    return this.receipts.get(h) ?? null;
  }
  async getEvents(from, to) {
    return this.events.filter((e) => BigInt(e.blockNumber) >= from && BigInt(e.blockNumber) <= to);
  }
}

export async function setup() {
  const db = openDatabase(':memory:');
  const chain = new FakeChain();
  const insert = db.prepare('INSERT INTO users (name, email, password_hash, role, wallet_address) VALUES (?, ?, ?, ?, ?)');
  const pwd = await hashPassword('Test1234!');
  insert.run('Admin', 'admin@test.local', pwd, 'ADMIN', WALLETS.admin);
  insert.run('Fournisseur 1', 'f1@test.local', pwd, 'SUPPLIER', WALLETS.supplier);
  insert.run('Opérateur', 'op@test.local', pwd, 'OPERATOR', WALLETS.operator);
  insert.run('Fournisseur 2', 'f2@test.local', pwd, 'SUPPLIER', WALLETS.supplier2);

  const app = createApp({ db, chain, corsOrigin: '*' });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'Test1234!' } })).body.token;

  const tokens = {
    admin: await login('admin@test.local'),
    supplier: await login('f1@test.local'),
    operator: await login('op@test.local'),
    supplier2: await login('f2@test.local'),
  };

  return { db, chain, call, tokens, close: () => new Promise((r) => server.close(r)) };
}
