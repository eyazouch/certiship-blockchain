import { createApp } from './app.js';
import { createChainService } from './chain.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { startSyncLoop } from './sync.js';

const db = openDatabase(config.dbPath);
const chain = createChainService(config);
const syncOptions = { deployBlock: config.deployBlock, blockRange: config.logBlockRange };

const app = createApp({ db, chain, corsOrigin: config.corsOrigin, syncOptions });

app.listen(config.port, () => {
  console.log(`API démarrée sur http://localhost:${config.port}`);
  console.log(`Base de données : ${config.dbPath}`);
  if (chain.enabled) {
    console.log(`Contrat ${chain.contractAddress} sur la chaîne ${chain.chainId} (${config.rpcUrl})`);
    startSyncLoop(db, chain, syncOptions, config.syncIntervalMs);
  } else {
    console.warn('CONTRACT_ADDRESS non défini : fonctionnalités blockchain désactivées');
  }
});
