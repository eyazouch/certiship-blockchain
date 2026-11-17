#!/usr/bin/env node
/**
 * Déploie ShipmentRegistry sur Anvil (http://127.0.0.1:8545) et met à jour backend/.env.
 * Prérequis : `anvil` lancé dans un autre terminal, Foundry installé.
 *
 * Comptes Anvil par défaut (clés publiques de test, NE JAMAIS utiliser ailleurs) :
 *   #0 admin, #1 et #3 fournisseurs, #2 opérateur.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractsDir = path.join(root, 'contracts');
const envFile = path.join(root, 'backend', '.env');
const envExample = path.join(root, 'backend', '.env.example');
const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';

const ANVIL_KEY_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const SUPPLIERS = ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x90F79bf6EB2c4f870365E785982E1f101E93b906'];
const OPERATORS = ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'];

const res = spawnSync('forge', ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', rpcUrl, '--broadcast'], {
  cwd: contractsDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PRIVATE_KEY: ANVIL_KEY_0, SUPPLIERS: SUPPLIERS.join(','), OPERATORS: OPERATORS.join(',') },
});
if (res.status !== 0) {
  console.error('\nÉchec du déploiement. Anvil est-il lancé ?');
  process.exit(res.status ?? 1);
}

const broadcast = JSON.parse(
  fs.readFileSync(path.join(contractsDir, 'broadcast', 'Deploy.s.sol', '31337', 'run-latest.json'), 'utf8'),
);
const creation = broadcast.transactions.find((t) => t.transactionType === 'CREATE');
const receipt = broadcast.receipts.find((r) => r.transactionHash === creation.hash);
const address = creation.contractAddress;
const block = Number.parseInt(receipt.blockNumber, 16);

let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : fs.readFileSync(envExample, 'utf8');
const setVar = (key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
};
setVar('CONTRACT_ADDRESS', address);
setVar('DEPLOY_BLOCK', block);
setVar('CHAIN_ID', 31337);
setVar('RPC_URL', rpcUrl);
fs.writeFileSync(envFile, env);

console.log(`\nContrat déployé : ${address} (bloc ${block})`);
console.log(`backend/.env mis à jour. Redémarrez le backend.`);
