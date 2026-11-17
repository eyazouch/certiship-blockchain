#!/usr/bin/env node
/**
 * Déploie ShipmentRegistry sur Sepolia avec un keystore chiffré, puis complète backend/.env.sepolia.
 *
 *   node scripts/deploy-sepolia.mjs                   déploie (le mot de passe du keystore est demandé)
 *   node scripts/deploy-sepolia.mjs --from-broadcast  ne déploie pas : relit le dernier déploiement
 *                                                     (si `forge script` a été lancé à la main)
 *
 * Prérequis :
 *   - backend/.env.sepolia rempli (copie de backend/.env.sepolia.example) ;
 *   - keystore créé avec : cast wallet import deployer --interactive ;
 *   - un peu d'ETH Sepolia sur le compte déployeur.
 * Aucune clé privée n'est lue ni écrite par ce script.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractsDir = path.join(root, 'contracts');
const envFile = process.env.SEPOLIA_ENV_FILE || path.join(root, 'backend', '.env.sepolia');
const envExample = path.join(root, 'backend', '.env.sepolia.example');
const frontendEnv = path.join(root, 'frontend', '.env.local');
const fromBroadcast = process.argv.includes('--from-broadcast');

// Comptes Anvil : leurs clés sont publiques, tout ETH envoyé dessus sur un vrai réseau est volé.
const ANVIL_ADDRESSES = new Set(
  [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  ].map((a) => a.toLowerCase()),
);

function fail(message) {
  console.error(`\n✘ ${message}`);
  process.exit(1);
}

if (!fs.existsSync(envFile)) {
  fs.copyFileSync(envExample, envFile);
  fail(`${path.relative(root, envFile)} vient d'être créé à partir du modèle : complétez-le puis relancez.`);
}

let envText = fs.readFileSync(envFile, 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const setVar = (key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  envText = re.test(envText) ? envText.replace(re, line) : `${envText.trimEnd()}\n${line}\n`;
};

const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? '');
const addressList = (key) =>
  (env[key] ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

const chainId = env.CHAIN_ID || '11155111';
const rpcUrl = env.RPC_URL ?? '';
const deployer = env.DEPLOYER_ADDRESS ?? '';
const suppliers = addressList('SUPPLIERS');
const operators = addressList('OPERATORS');

if (!/^https?:\/\//.test(rpcUrl) || rpcUrl.includes('VOTRE_CLE')) fail('RPC_URL : indiquez votre URL RPC Sepolia.');
if (!isAddress(deployer)) fail('DEPLOYER_ADDRESS : adresse du compte déployeur invalide.');
for (const [key, list] of [['SUPPLIERS', suppliers], ['OPERATORS', operators]]) {
  for (const a of list) if (!isAddress(a)) fail(`${key} : adresse invalide « ${a} ».`);
}
for (const a of [deployer, ...suppliers, ...operators]) {
  if (ANVIL_ADDRESSES.has(a.toLowerCase()) && chainId !== '31337') {
    fail(`${a} est un compte de test Anvil (clé publique) : utilisez des comptes MetaMask neufs sur Sepolia.`);
  }
}

if (!fromBroadcast) {
  console.log(`Déploiement sur la chaîne ${chainId} depuis ${deployer}`);
  console.log(`Fournisseurs : ${suppliers.join(', ') || '—'}`);
  console.log(`Opérateurs   : ${operators.join(', ') || '—'}`);
  console.log('Le mot de passe du keystore va être demandé.\n');

  const childEnv = { ...process.env, SUPPLIERS: suppliers.join(','), OPERATORS: operators.join(',') };
  delete childEnv.PRIVATE_KEY;
  delete childEnv.ADMIN;
  const res = spawnSync(
    'forge',
    [
      'script', 'script/Deploy.s.sol:Deploy',
      '--rpc-url', rpcUrl,
      '--account', env.DEPLOY_ACCOUNT || 'deployer',
      '--sender', deployer,
      '--broadcast',
    ],
    { cwd: contractsDir, stdio: 'inherit', env: childEnv },
  );
  if (res.error) fail(`forge introuvable : ${res.error.message}`);
  if (res.status !== 0) fail('Échec du déploiement (mot de passe, solde ETH insuffisant ou RPC injoignable ?).');
}

const broadcastFile = path.join(contractsDir, 'broadcast', 'Deploy.s.sol', chainId, 'run-latest.json');
if (!fs.existsSync(broadcastFile)) fail(`Aucun déploiement trouvé (${path.relative(root, broadcastFile)}).`);
const broadcast = JSON.parse(fs.readFileSync(broadcastFile, 'utf8'));
const creation = broadcast.transactions.find((t) => t.transactionType === 'CREATE');
const receipt = broadcast.receipts.find((r) => r.transactionHash === creation?.hash);
if (!creation || !receipt) fail('Le fichier de déploiement ne contient pas la création du contrat.');
const address = creation.contractAddress;
const block = Number.parseInt(receipt.blockNumber, 16);

setVar('CONTRACT_ADDRESS', address);
setVar('DEPLOY_BLOCK', block);
if (!env.ADMIN_WALLET) setVar('ADMIN_WALLET', deployer);
if (!env.JWT_SECRET || env.JWT_SECRET === 'a-generer') setVar('JWT_SECRET', crypto.randomBytes(32).toString('hex'));
fs.writeFileSync(envFile, envText);

// Le frontend lit les reçus de transaction via ce RPC (plus fiable que le RPC public par défaut).
if (chainId === '11155111') {
  let fe = fs.existsSync(frontendEnv) ? fs.readFileSync(frontendEnv, 'utf8') : '';
  const line = `VITE_SEPOLIA_RPC_URL=${rpcUrl}`;
  fe = /^VITE_SEPOLIA_RPC_URL=.*$/m.test(fe) ? fe.replace(/^VITE_SEPOLIA_RPC_URL=.*$/m, line) : `${fe.trimEnd()}\n${line}\n`.trimStart();
  fs.writeFileSync(frontendEnv, fe);
}

console.log(`\n✔ Contrat déployé : ${address} (bloc ${block})`);
if (chainId === '11155111') console.log(`  https://sepolia.etherscan.io/address/${address}`);
console.log(`✔ ${path.relative(root, envFile)} complété (CONTRACT_ADDRESS, DEPLOY_BLOCK, ADMIN_WALLET, JWT_SECRET)`);
if (chainId === '11155111') console.log(`✔ ${path.relative(root, frontendEnv)} : VITE_SEPOLIA_RPC_URL`);
console.log('\nÉtapes suivantes :');
console.log('  cd backend && npm run seed:sepolia && npm run start:sepolia');
console.log('  cd frontend && npm run dev   (relancer s’il tournait déjà)');
