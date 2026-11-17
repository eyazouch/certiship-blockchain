import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { sameAddress, shortHash } from '../format.js';
import { useSession } from '../session.jsx';
import { chainName } from '../wagmi.js';

/**
 * État du portefeuille par rapport au compte connecté :
 * MetaMask doit être sur la bonne chaîne et utiliser l'adresse déclarée pour l'utilisateur,
 * sinon l'auteur enregistré dans la blockchain ne correspondrait pas à l'acteur métier.
 */
export function useWalletGuard() {
  const { user, appConfig } = useSession();
  const { address, chainId, isConnected } = useAccount();
  const expectedChain = appConfig?.chainId;

  let problem = null;
  if (!appConfig?.chainEnabled) problem = 'Smart Contract non configuré côté serveur.';
  else if (!isConnected) problem = 'Connectez votre portefeuille MetaMask.';
  else if (chainId !== expectedChain) problem = `Basculez MetaMask sur le réseau ${chainName(expectedChain)}.`;
  else if (user?.walletAddress && !sameAddress(address, user.walletAddress))
    problem = `Sélectionnez dans MetaMask le compte ${shortHash(user.walletAddress, 4)} associé à votre profil.`;

  return {
    ready: !problem,
    problem,
    account: address,
    chainId: expectedChain,
    contractAddress: appConfig?.contractAddress,
  };
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { appConfig } = useSession();

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        type="button"
        className="btn btn-small"
        disabled={!connector || isPending}
        onClick={() => connect({ connector })}
      >
        {isPending ? 'Connexion…' : 'Connecter MetaMask'}
      </button>
    );
  }
  const wrongChain = appConfig && chainId !== appConfig.chainId;
  return (
    <div className="wallet">
      {wrongChain ? (
        <button type="button" className="btn btn-small btn-warn" onClick={() => switchChain({ chainId: appConfig.chainId })}>
          Changer de réseau
        </button>
      ) : (
        <span className="wallet-chain">{chainName(chainId)}</span>
      )}
      <code title={address}>{shortHash(address, 4)}</code>
      <button type="button" className="link-btn" onClick={() => disconnect()}>
        déconnecter
      </button>
    </div>
  );
}

export function WalletRequirement({ guard }) {
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const { isConnected } = useAccount();
  if (guard.ready) return null;
  return (
    <div className="alert alert-warn wallet-req">
      <span>{guard.problem}</span>
      {!isConnected && connectors[0] && guard.problem?.startsWith('Connectez') && (
        <button type="button" className="btn btn-small" onClick={() => connect({ connector: connectors[0] })}>
          Connecter
        </button>
      )}
      {isConnected && guard.problem?.startsWith('Basculez') && (
        <button type="button" className="btn btn-small" onClick={() => switchChain({ chainId: guard.chainId })}>
          Changer de réseau
        </button>
      )}
    </div>
  );
}
