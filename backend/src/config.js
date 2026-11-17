import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'app.db'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  chainId: int(process.env.CHAIN_ID, 31337),
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  deployBlock: BigInt(process.env.DEPLOY_BLOCK || '0'),
  syncIntervalMs: int(process.env.SYNC_INTERVAL_MS, 5000),
  logBlockRange: BigInt(process.env.LOG_BLOCK_RANGE || '2000'),
};

if (config.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET doit être défini en production');
}
