# Documentation technique

## 1. Vue d'ensemble

```
Projet Blockchain/
├── contracts/   Smart Contract Solidity + tests Foundry (unitaires, fuzzing, invariants)
├── backend/     API Node.js (Express), base SQLite, calcul des empreintes, synchronisation
├── frontend/    Application React (Vite) + wagmi/viem + MetaMask
├── scripts/     Déploiement local automatisé
└── docs/        UML et documentation technique
```

| Couche | Rôle | Technologies |
|---|---|---|
| Smart Contract | Numérotation, rôles, chaînage, horodatage, statut | Solidity 0.8.24, Foundry |
| Backend | Authentification, rôles applicatifs, validation, SHA-256, base, synchronisation | Node.js ≥ 22.13, Express, `node:sqlite`, viem |
| Frontend | Interfaces, signature des transactions | React 18, wagmi 2, viem 2, React Query |
| Blockchain | Registre immuable | Anvil (local), Sepolia (test) |

## 2. Choix de conception

### 2.1 Qui signe les transactions ?

**Chaque utilisateur signe avec son propre portefeuille MetaMask.** Le backend ne détient aucune clé privée et ne fait que lire la blockchain.

Si le backend signait tout avec une clé unique, `msg.sender` serait toujours la même adresse. Les contrôles de rôle du contrat (RM2, RM3) et l'attribution des événements à leur auteur n'auraient alors plus de sens. Avec MetaMask, le Smart Contract est la seule autorité qui décide qui peut expédier et qui peut confirmer. Le backend ajoute un second filtre au niveau applicatif : JWT et rôle.

Chaque compte applicatif (fournisseur ou opérateur) est lié à une adresse de portefeuille. Le frontend bloque l'envoi si le compte MetaMask actif ne correspond pas à cette adresse.

### 2.2 Empreintes SHA-256

Les données sont sérialisées sous forme d'un **tableau JSON ordonné**. Cela évite toute ambiguïté de séparateur : `"A|B","C"` et `"A","B|C"` donnent des empreintes différentes.

```text
empreinte_expédition = SHA-256( JSON.stringify([
    "SHIPMENT-v1", numéro, nom, catégorie, description, sel, empreinte_précédente ]) )

empreinte_arrivée = SHA-256( JSON.stringify([
    "ARRIVAL-v1", numéro, empreinte_expédition, adresse_opérateur, sel_arrivée ]) )
```

- Le **sel** (32 octets aléatoires) empêche de retrouver les données par force brute à partir de l'empreinte publique. C'est important pour la confidentialité (§10.4) : une catégorie ou un nom court se devinerait facilement sans sel.
- L'**empreinte précédente** chaîne chaque produit au précédent (EF05). Modifier un produit casserait donc le lien avec tous les suivants.
- La **date** ne fait pas partie de l'empreinte : elle n'est connue qu'une fois le bloc miné. Elle est certifiée directement par `block.timestamp` (RM9).
- Le préfixe de version (`-v1`) permettra de faire évoluer le format sans ambiguïté.

Implémentation : [backend/src/hash.js](../backend/src/hash.js).

### 2.3 Concurrence (§8.1 et test 7)

Le contrat attend le numéro `productCount + 1` et l'empreinte `lastShipmentHash`. Si deux fournisseurs préparent un produit en même temps, ils obtiennent le même numéro attendu. Le premier minage réussit et le second est refusé avec `UnexpectedProductId`. Le frontend détecte ce refus dès la simulation, demande au backend de recalculer l'empreinte (`POST /shipments/:id/refresh`) et retente, jusqu'à 3 fois.

### 2.4 Cohérence blockchain / base (test 8)

1. Le produit est enregistré en **brouillon avant** l'envoi de la transaction, avec son sel. Le sel ne peut donc jamais être perdu.
2. Après le minage, le frontend demande au backend de vérifier le reçu (`POST /transactions/:hash/sync`). Le backend relit lui-même le reçu dans la blockchain et ne fait pas confiance au client.
3. Un **indexeur** tourne en tâche de fond (toutes les 5 s). Il parcourt les événements `ShipmentRegistered` et `ArrivalConfirmed` depuis le dernier bloc traité et associe chaque événement à son brouillon grâce à l'empreinte. Si le frontend a planté ou si l'écriture en base a échoué, l'état est reconstruit automatiquement.
4. Toutes les opérations d'application d'événements sont **idempotentes** : on peut les rejouer sans risque.
5. Un événement sans données hors chaîne crée un produit marqué « données absentes ». La vérification d'intégrité le signale.

Un administrateur peut aussi forcer une resynchronisation (`POST /sync`).

### 2.5 La blockchain est la référence

La base ne contient qu'une copie consultable. Le numéro, le statut et les dates proviennent **uniquement** des événements du contrat. Aucune route ne permet de modifier un statut (EF12, RM4). La vérification compare aussi le statut et les dates stockés en base à ceux de la blockchain : une date falsifiée en base est détectée.

## 3. Smart Contract

Fichier : [contracts/src/ShipmentRegistry.sol](../contracts/src/ShipmentRegistry.sol)

| Fonction | Accès | Contrôles |
|---|---|---|
| `registerShipment(expectedId, previousHash, shipmentHash)` | fournisseur | rôle, `expectedId == count+1`, `previousHash == lastShipmentHash`, empreinte non nulle et jamais utilisée |
| `confirmArrival(productId, arrivalHash)` | opérateur | rôle, produit existant, pas déjà arrivé, empreinte non nulle |
| `getProduct(productId)` | public | — (statut `None` si inexistant) |
| `getLastProduct()` | public | — |
| `setSupplier` / `setOperator` | admin | adresse non nulle |
| `transferAdmin` | admin | adresse non nulle |

Les erreurs personnalisées (`NotSupplier`, `AlreadyArrived`, etc.) sont décodées par le frontend et traduites en messages clairs.

Stockage : 6 emplacements par produit. `supplier`, `shippedAt` et `status` sont regroupés dans un seul emplacement, tout comme `operator` et `arrivedAt`.

### Tests Foundry

| Fichier | Contenu |
|---|---|
| `test/ShipmentRegistry.t.sol` | tests unitaires (scénarios 1 à 5 et 7 du cahier des charges, rôles, événements) + 6 tests de fuzzing |
| `test/ShipmentRegistry.invariant.t.sol` | tests d'invariants : numérotation continue, chaînage intact, cohérence statut/dates, aucune double confirmation |

## 4. Backend

### API REST

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Connexion, renvoie un JWT |
| GET | `/api/auth/me` | connecté | Profil |
| GET | `/api/config` | public | Chaîne et adresse du contrat |
| POST | `/api/shipments/prepare` | fournisseur | Brouillon + empreinte |
| POST | `/api/shipments/:id/refresh` | fournisseur | Recalcul après concurrence |
| POST | `/api/shipments/:id/submit` | fournisseur | Enregistre le hash de transaction |
| DELETE | `/api/shipments/:id` | fournisseur | Abandon d'un brouillon jamais envoyé |
| POST | `/api/arrivals/prepare` | opérateur | Empreinte d'arrivée |
| POST | `/api/arrivals/:number/submit` | opérateur | Enregistre le hash de transaction |
| GET | `/api/products` | connecté | Historique filtré (`q`, `status`, `category`, `from`, `to`) |
| GET | `/api/products/:number` | connecté | Détail + transactions |
| GET | `/api/products/:number/verify` | connecté | Vérification d'intégrité |
| GET | `/api/stats` | connecté | Tableau de bord |
| GET | `/api/transactions` | connecté | Suivi des transactions (`state`, `type`) |
| POST | `/api/transactions/:hash/sync` | connecté | Vérifie une transaction dans la blockchain |
| POST | `/api/sync` | admin | Resynchronisation complète |
| GET/POST/PATCH | `/api/users` | admin | Gestion des comptes |

Visibilité : un **fournisseur** ne voit que ses propres produits. Un **opérateur** voit tous les produits ancrés, mais pas les brouillons. L'**administrateur** voit tout.

### Sécurité

- Mots de passe hachés avec **scrypt** et un sel par utilisateur. Comparaison en temps constant.
- JWT signé (`JWT_SECRET` obligatoire en production) avec une expiration de 8 h. Le compte est rechargé à chaque requête, donc désactiver un compte prend effet immédiatement.
- Validation et normalisation de toutes les saisies (longueurs, caractères de contrôle, adresses, hash).
- Requêtes SQL paramétrées uniquement.
- Aucune clé privée côté serveur. En production, déploiement avec un keystore chiffré (`cast wallet import`).
- HTTPS : en production, placer l'API et le frontend derrière un reverse proxy TLS (Nginx, Caddy…).

## 5. Limites

Voir le §15 du cahier des charges, plus :

- `block.timestamp` peut être ajusté de quelques secondes par le validateur. C'est sans importance à l'échelle d'une livraison.
- Sepolia ne garantit pas la conservation à long terme.
- La base doit être **sauvegardée** : sans les sels, les empreintes ne sont plus vérifiables. Une simple copie du fichier `backend/data/app.db` (mode WAL : utiliser `sqlite3 app.db ".backup save.db"`) suffit.
- Le compte MetaMask doit correspondre au compte applicatif. Une adresse peut être autorisée dans le contrat sans avoir de compte applicatif (déclaration hors application). L'indexeur enregistre alors l'événement avec la mention « données absentes ».
