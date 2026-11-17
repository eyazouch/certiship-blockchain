import { createConfig, http } from 'wagmi';
import { foundry, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const chains = [foundry, sepolia];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: {
    [foundry.id]: http(),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
  },
});

export function chainName(id) {
  return chains.find((c) => c.id === id)?.name ?? `chaîne ${id}`;
}

export function explorerTxUrl(chainId, hash) {
  const chain = chains.find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : null;
}
