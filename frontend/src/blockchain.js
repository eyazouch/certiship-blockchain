import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { registryAbi } from './abi.js';
import { api } from './api.js';
import { wagmiConfig } from './wagmi.js';

const REVERT_MESSAGES = {
  NotAdmin: "Ce portefeuille n'est pas administrateur du contrat.",
  NotSupplier: "Ce portefeuille n'est pas autorisé comme fournisseur dans le Smart Contract.",
  NotOperator: "Ce portefeuille n'est pas autorisé comme opérateur dans le Smart Contract.",
  ZeroAddress: 'Adresse nulle refusée.',
  InvalidHash: 'Empreinte invalide.',
  HashAlreadyUsed: 'Cette empreinte est déjà enregistrée.',
  UnexpectedProductId: 'Le numéro attendu a changé (autre expédition simultanée).',
  PreviousHashMismatch: "L'empreinte précédente a changé (autre expédition simultanée).",
  ProductNotFound: "Ce produit n'existe pas dans la blockchain.",
  AlreadyArrived: "L'arrivée de ce produit est déjà confirmée.",
};

export function revertName(err) {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert?.data?.errorName ?? null;
}

export function describeError(err) {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'Transaction refusée dans MetaMask.';
    const name = revertName(err);
    if (name) return REVERT_MESSAGES[name] ?? `Refus du contrat : ${name}`;
    return err.shortMessage || err.message;
  }
  return err?.message || String(err);
}

const RACE_ERRORS = new Set(['UnexpectedProductId', 'PreviousHashMismatch']);

async function sendAndTrack({ account, chainId, contractAddress, functionName, args, onStep }) {
  onStep?.('simulate');
  const { request } = await simulateContract(wagmiConfig, {
    address: contractAddress,
    abi: registryAbi,
    functionName,
    args,
    account,
    chainId,
  });
  onStep?.('sign');
  return writeContract(wagmiConfig, request);
}

async function waitAndSync(hash, chainId, onStep) {
  onStep?.('mining', hash);
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId });
  onStep?.('sync', hash);
  // Le backend relit lui-même le reçu dans la blockchain : il ne fait pas confiance au client.
  let state = 'PENDING';
  for (let i = 0; i < 5 && state === 'PENDING'; i++) {
    state = (await api(`/transactions/${hash}/sync`, { method: 'POST' })).state;
    if (state === 'PENDING') await new Promise((r) => setTimeout(r, 1000));
  }
  return { receipt, state };
}

/**
 * Déclaration d'expédition avec reprise automatique en cas de concurrence (§8.1) :
 * si un autre fournisseur a enregistré un produit entre-temps, l'empreinte est
 * recalculée par le backend et la transaction est retentée.
 */
export async function shipProduct({ draft, account, chainId, contractAddress, onStep, maxAttempts = 3 }) {
  let current = draft;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const hash = await sendAndTrack({
        account,
        chainId,
        contractAddress,
        functionName: 'registerShipment',
        args: [BigInt(current.expectedNumber), current.previousHash, current.shipmentHash],
        onStep,
      });
      await api(`/shipments/${current.id}/submit`, { method: 'POST', body: { txHash: hash } });
      const { receipt, state } = await waitAndSync(hash, chainId, onStep);
      if (receipt.status !== 'success' || state === 'FAILED') {
        // Course perdue entre la simulation et le minage : on recalcule et on réessaie
        onStep?.('retry');
        current = (await api(`/shipments/${current.id}/refresh`, { method: 'POST' })).draft;
        continue;
      }
      return { hash, number: current.expectedNumber };
    } catch (err) {
      if (attempt < maxAttempts && RACE_ERRORS.has(revertName(err))) {
        onStep?.('retry');
        current = (await api(`/shipments/${current.id}/refresh`, { method: 'POST' })).draft;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Échec de l'enregistrement après plusieurs tentatives, réessayez.");
}

export async function confirmArrivalOnChain({ number, account, chainId, contractAddress, onStep }) {
  onStep?.('prepare');
  const { arrival } = await api('/arrivals/prepare', { method: 'POST', body: { number } });
  const hash = await sendAndTrack({
    account,
    chainId,
    contractAddress,
    functionName: 'confirmArrival',
    args: [BigInt(number), arrival.arrivalHash],
    onStep,
  });
  await api(`/arrivals/${number}/submit`, { method: 'POST', body: { txHash: hash } });
  const { receipt } = await waitAndSync(hash, chainId, onStep);
  if (receipt.status !== 'success') throw new Error('La transaction a été annulée par le contrat.');
  return { hash };
}

export async function setChainRole({ role, target, authorized, account, chainId, contractAddress, onStep }) {
  const hash = await sendAndTrack({
    account,
    chainId,
    contractAddress,
    functionName: role === 'SUPPLIER' ? 'setSupplier' : 'setOperator',
    args: [target, authorized],
    onStep,
  });
  onStep?.('mining', hash);
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId });
  if (receipt.status !== 'success') throw new Error('Transaction annulée.');
  return { hash };
}
