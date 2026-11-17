# CertiShip — Certification des dates d'expédition et d'arrivée par Blockchain

Application web de traçabilité. Le fournisseur déclare l'expédition d'un produit, puis un opérateur de l'usine confirme son arrivée. Chaque événement est horodaté par la blockchain Ethereum et associé à une empreinte SHA-256 chaînée au produit précédent.

- **Smart Contract** : [contracts/src/ShipmentRegistry.sol](contracts/src/ShipmentRegistry.sol)
- **Documentation technique** : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Diagrammes UML** : [docs/UML.md](docs/UML.md)
- **Guide d'utilisation** (installation, MetaMask, utilisation par profil) : [docs/GUIDE_UTILISATION.md](docs/GUIDE_UTILISATION.md)
- **Rapport de tests** : [docs/RAPPORT_TESTS.md](docs/RAPPORT_TESTS.md)

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| Node.js | ≥ 22.13 (base `node:sqlite`) | <https://nodejs.org> |
| Foundry | `forge`, `anvil`, `cast` | Dans Git Bash : `curl -L https://foundry.paradigm.xyz \| bash` puis `foundryup` |
| MetaMask | extension navigateur | <https://metamask.io> |

## Démarrage en local (Anvil)

### 1. Installer les dépendances

```bash
cd contracts && forge install foundry-rs/forge-std && cd ..
```

```bash
cd backend && npm install && cd ..
```

```bash
cd frontend && npm install && cd ..
```

### 2. Lancer la blockchain locale (terminal 1)

```bash
anvil
```

### 3. Déployer le contrat (terminal 2)

```bash
node scripts/deploy-local.mjs
```

Ce script déploie `ShipmentRegistry` et autorise les comptes Anvil n°1 et n°3 comme fournisseurs et le n°2 comme opérateur. Il écrit ensuite `CONTRACT_ADDRESS` et `DEPLOY_BLOCK` dans `backend/.env`.

### 4. Créer les comptes et lancer l'API

```bash
cd backend && npm run seed:demo && npm start
```

### 5. Lancer le frontend (terminal 3)

```bash
cd frontend && npm run dev
```

Ouvrir <http://localhost:5173>.

### 6. Configurer MetaMask

1. Ajouter le réseau **Anvil** : RPC `http://127.0.0.1:8545`, Chain ID `31337`, symbole `ETH`.
2. Importer les comptes de test d'Anvil (clés privées affichées au lancement d'`anvil`) :

| Compte applicatif | Mot de passe | Compte Anvil | Rôle |
|---|---|---|---|
| `admin@demo.local` | `Admin1234!` | n°0 | Administrateur du contrat |
| `fournisseur@demo.local` | `Demo1234!` | n°1 | Fournisseur |
| `operateur@demo.local` | `Demo1234!` | n°2 | Opérateur |
| `fournisseur2@demo.local` | `Demo1234!` | n°3 | Fournisseur |

> Ces comptes et clés sont publics. Ils ne servent **que** sur Anvil.

Si Anvil est redémarré, MetaMask peut afficher une erreur de *nonce*. Dans ce cas, aller dans *Paramètres → Avancé → Effacer les données d'activité*.

## Tests

```bash
cd contracts && forge test -vv
```

```bash
cd backend && npm test
```

```bash
cd contracts && forge coverage
```

### Correspondance avec les scénarios du cahier des charges

| Scénario | Smart Contract (`forge test`) | Backend (`npm test`) |
|---|---|---|
| 1. Expédition valide | `test_RegisterShipment_Valid` | « Test 1 » |
| 2. Fournisseur non autorisé | `test_RevertWhen_UnauthorizedSupplier`, `testFuzz_RevertWhen_UnauthorizedCaller` | « Test 2 » |
| 3. Arrivée valide | `test_ConfirmArrival_Valid` | « Test 3 » |
| 4. Double confirmation | `test_RevertWhen_DoubleArrival` | « Test 4 » |
| 5. Produit inexistant | `test_RevertWhen_ArrivalUnknownProduct`, `testFuzz_RevertWhen_ArrivalOnUnknownId` | « Test 5 » |
| 6. Modification des données | — (hors chaîne) | « Test 6 » |
| 7. Transactions simultanées | `test_ConcurrentShipments_SecondIsRejectedThenRetried` | « Test 7 » |
| 8. Échec de la base | — (hors chaîne) | « Test 8 » |
| Invariants | `invariant_ChainIsContinuous`, `invariant_StatusConsistency` | — |

## Déploiement sur Sepolia

La configuration Sepolia est séparée de la démo Anvil : fichier `backend/.env.sepolia`, base `backend/data/sepolia.db`. La procédure pas à pas est dans le [guide d'utilisation](docs/GUIDE_UTILISATION.md#11-déployer-sur-sepolia-réseau-de-test-public).

```bash
cp backend/.env.sepolia.example backend/.env.sepolia
```

```bash
cast wallet import deployer --interactive
```

```bash
node scripts/deploy-sepolia.mjs
```

```bash
cd backend && npm run seed:sepolia && npm run start:sepolia
```

Le script refuse les adresses Anvil (clés publiques) et ne lit jamais de clé privée : la signature passe par le keystore chiffré de Foundry. Les liens vers Etherscan s'affichent automatiquement pour les transactions Sepolia.

## Exigences fonctionnelles

| Réf. | Exigence | Réalisation |
|---|---|---|
| EF01 | Saisir un produit | Page *Nouvelle expédition*, `POST /shipments/prepare` |
| EF02 | Numéro unique et incrémental | `registerShipment` : `expectedId == productCount + 1` |
| EF03 | Empreinte SHA-256 | `backend/src/hash.js` |
| EF04 | Ancrage de l'expédition | `registerShipment`, signé via MetaMask |
| EF05 | Chaînage au produit précédent | `previousHash` vérifié par le contrat et inclus dans l'empreinte |
| EF06 | Consultation par numéro | Page *Produit n°N*, recherche opérateur |
| EF07 | Vérification d'intégrité | Bouton *Vérifier*, `GET /products/:n/verify` |
| EF08 | Historique avec filtres | Page *Produits* (texte, statut, catégorie, période) |
| EF09 | Gestion des acteurs autorisés | Page *Utilisateurs* (comptes + `setSupplier` / `setOperator`) |
| EF10 | Suivi des transactions | Page *Transactions* (en attente / confirmée / échouée) |
| EF11 | Confirmation d'arrivée | `confirmArrival`, signé par l'opérateur |
| EF12 | Statut non modifiable | Aucun champ ni route : le statut découle des événements |

## Variables d'environnement du backend

Voir [backend/.env.example](backend/.env.example).
