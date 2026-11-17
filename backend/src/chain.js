import { createPublicClient, defineChain, getAddress, http, parseEventLogs } from 'viem';
import { foundry, sepolia } from 'viem/chains';
import { registryAbi, CHAIN_STATUS } from './abi.js';
import { HttpError } from './errors.js';

function resolveChain(chainId, rpcUrl) {
  if (chainId === foundry.id) return foundry;
  if (chainId === sepolia.id) return sepolia;
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function normalizeProduct(p) {
  return {
    shipmentHash: p.shipmentHash,
    previousHash: p.previousHash,
    arrivalHash: p.arrivalHash,
    supplier: p.supplier,
    shippedAt: Number(p.shippedAt),
    status: CHAIN_STATUS[Number(p.status)] ?? 'NONE',
    operator: p.operator,
    arrivedAt: Number(p.arrivedAt),
  };
}

function normalizeEvent(log) {
  const a = log.args;
  const base = { name: log.eventName, txHash: log.transactionHash.toLowerCase(), blockNumber: Number(log.blockNumber) };
  if (log.eventName === 'ShipmentRegistered') {
    return {
      ...base,
      productId: Number(a.productId),
      supplier: getAddress(a.supplier),
      shipmentHash: a.shipmentHash.toLowerCase(),
      previousHash: a.previousHash.toLowerCase(),
      timestamp: Number(a.timestamp),
    };
  }
  if (log.eventName === 'ArrivalConfirmed') {
    return {
      ...base,
      productId: Number(a.productId),
      operator: getAddress(a.operator),
      arrivalHash: a.arrivalHash.toLowerCase(),
      timestamp: Number(a.timestamp),
    };
  }
  return null;
}

/**
 * Accès en lecture au Smart Contract. Le backend ne signe aucune transaction :
 * chaque utilisateur signe avec son propre portefeuille (MetaMask), ce qui garantit
 * que l'auteur enregistré dans la blockchain est bien l'acteur métier.
 */
export function createChainService({ rpcUrl, chainId, contractAddress }) {
  const enabled = Boolean(contractAddress);
  const client = createPublicClient({ chain: resolveChain(chainId, rpcUrl), transport: http(rpcUrl) });
  const address = enabled ? getAddress(contractAddress) : undefined;

  const ensure = () => {
    if (!enabled) throw new HttpError(503, 'Adresse du Smart Contract non configurée (CONTRACT_ADDRESS)');
  };
  const read = async (functionName, args = []) => {
    ensure();
    try {
      return await client.readContract({ address, abi: registryAbi, functionName, args });
    } catch (err) {
      throw new HttpError(503, `Blockchain injoignable : ${err.shortMessage || err.message}`);
    }
  };

  return {
    enabled,
    chainId,
    contractAddress: address ?? null,

    async getLastProduct() {
      const [id, hash] = await read('getLastProduct');
      return { number: Number(id), hash: hash.toLowerCase() };
    },

    async getProduct(number) {
      return normalizeProduct(await read('getProduct', [BigInt(number)]));
    },

    async getRoles(wallet) {
      const [isSupplier, isOperator] = await Promise.all([read('isSupplier', [wallet]), read('isOperator', [wallet])]);
      return { isSupplier, isOperator };
    },

    async getAdmin() {
      return read('admin');
    },

    async getBlockNumber() {
      ensure();
      return client.getBlockNumber();
    },

    /** Reçu d'une transaction et événements du contrat qu'elle contient (null si pas encore minée). */
    async getReceipt(txHash) {
      ensure();
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({ hash: txHash });
      } catch (err) {
        if (err.name === 'TransactionReceiptNotFoundError') return null;
        throw new HttpError(503, `Blockchain injoignable : ${err.shortMessage || err.message}`);
      }
      const logs = receipt.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase());
      const events = parseEventLogs({ abi: registryAbi, logs }).map(normalizeEvent).filter(Boolean);
      return {
        status: receipt.status,
        blockNumber: Number(receipt.blockNumber),
        from: getAddress(receipt.from),
        events,
      };
    },

    /** Événements métier entre deux blocs (inclus). */
    async getEvents(fromBlock, toBlock) {
      ensure();
      const logs = await client.getContractEvents({ address, abi: registryAbi, fromBlock, toBlock });
      return logs.map(normalizeEvent).filter(Boolean);
    },
  };
}
