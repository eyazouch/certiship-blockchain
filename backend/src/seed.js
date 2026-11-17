/**
 * Création des comptes initiaux.
 *   npm run seed       -> administrateur (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_WALLET)
 *   npm run seed:demo  -> + comptes de démonstration liés aux comptes Anvil par défaut
 *
 * Comptes de démonstration (UNIQUEMENT pour la blockchain locale Anvil) :
 *   admin@demo.local      Admin1234!   compte Anvil #0
 *   fournisseur@demo.local Demo1234!   compte Anvil #1
 *   fournisseur2@demo.local Demo1234!  compte Anvil #3
 *   operateur@demo.local  Demo1234!    compte Anvil #2
 */
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { openDatabase } from './db.js';

const ANVIL = {
  0: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  1: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  2: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  3: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
};

const demo = process.argv.includes('--demo');
const isAnvil = config.chainId === 31337;
// Les comptes Anvil ont des clés publiques : hors chaîne locale, ils seraient vidés immédiatement.
if (!isAnvil && demo) {
  console.error('Les comptes de démonstration sont réservés à Anvil. Utilisez `npm run seed` puis la page Utilisateurs.');
  process.exit(1);
}
if (!isAnvil && !process.env.ADMIN_WALLET) {
  console.error('ADMIN_WALLET est obligatoire hors Anvil (adresse du compte administrateur du contrat).');
  process.exit(1);
}
const db = openDatabase(config.dbPath);

const users = [
  {
    name: process.env.ADMIN_NAME || 'Administrateur',
    email: (process.env.ADMIN_EMAIL || 'admin@demo.local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin1234!',
    role: 'ADMIN',
    wallet: process.env.ADMIN_WALLET || ANVIL[0],
  },
];

if (demo) {
  users.push(
    { name: 'Fournisseur Alpha', email: 'fournisseur@demo.local', password: 'Demo1234!', role: 'SUPPLIER', wallet: ANVIL[1] },
    { name: 'Fournisseur Beta', email: 'fournisseur2@demo.local', password: 'Demo1234!', role: 'SUPPLIER', wallet: ANVIL[3] },
    { name: 'Opérateur Usine', email: 'operateur@demo.local', password: 'Demo1234!', role: 'OPERATOR', wallet: ANVIL[2] },
  );
}

for (const u of users) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (exists) {
    console.log(`= ${u.email} existe déjà`);
    continue;
  }
  db.prepare('INSERT INTO users (name, email, password_hash, role, wallet_address) VALUES (?, ?, ?, ?, ?)').run(
    u.name,
    u.email,
    await hashPassword(u.password),
    u.role,
    u.wallet,
  );
  console.log(`+ ${u.email} (${u.role}, ${u.wallet})`);
}
