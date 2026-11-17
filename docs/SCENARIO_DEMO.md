# Scénario de la vidéo de démonstration — CertiShip (5 minutes)

8 clips enregistrés séparément puis assemblés dans Clipchamp.

| # | Clip | Durée | Réseau | Jour |
|---|---|---|---|---|
| 1 | Le problème, en dessin animé | 0:38 | — | aujourd'hui |
| 2 | Le fournisseur déclare une expédition | 0:55 | Anvil | aujourd'hui |
| 3 | L'opérateur confirme l'arrivée | 0:35 | Anvil | aujourd'hui |
| 4 | Intégrité vérifiée, puis falsification détectée | 0:50 | Anvil | aujourd'hui |
| 5 | L'administrateur révoque un fournisseur | 0:30 | Anvil | aujourd'hui |
| 6 | Sur le réseau public Sepolia + Etherscan | 0:45 | Sepolia | **demain** |
| 7 | Les tests | 0:20 | Terminal | aujourd'hui |
| 8 | Conclusion | 0:10 | — | demain |
| | **Total** | **≈ 4:40** | | |

---

## Préparation

### Écran

- Mode **Ne pas déranger** de Windows activé.
- Chrome : favoris masqués (`Ctrl + Maj + B`), zoom **110 %**, un seul onglet.
- Terminal Git Bash avec une police agrandie (clic droit → *Options* → *Text* → 14).

### Données Anvil

```bash
anvil --state anvil-state.json
```

```bash
cast rpc anvil_setTime $(date +%s)
```

```bash
cd backend && npm start
```

```bash
cd frontend && npm run dev
```

Remettre le produit 7 dans son état d'origine :

```bash
node scripts/falsifier.mjs 7 "Javel"
```

En **Admin** (MetaMask `0xf39F…`) : **Utilisateurs** → **Autoriser on-chain** sur Fournisseur Beta (il doit afficher **Oui**).

### Données Sepolia (ce soir)

Expédier un produit sur Sepolia (« Cafetière » / « Électroménager cuisine » / « 10 cafetières 1,5 L ») et **ne pas confirmer son arrivée** : il sert au clip 6 demain.

### Enregistrement

- `Win + Maj + R` (Outil Capture d'écran) → sélectionner la zone navigateur + MetaMask → **Démarrer**.
- Enregistrer **sans parler** ; la voix off se fait au montage.
- Les changements de compte se font **hors enregistrement**.

---

## Les clips

### Clip 1 — Le problème, en dessin animé (0:38)

Animation prête à enregistrer : [docs/demo/intro.html](demo/intro.html) (aucun outil d'IA nécessaire).

| | |
|---|---|
| **Avant** | Ouvrir `docs/demo/intro.html` dans Chrome (double-clic sur le fichier) → **F11** (plein écran) → démarrer l'enregistrement d'écran |
| **Action** | Appuyer sur **Espace** : l'animation se joue seule (≈ 38 s). **R** pour recommencer. Arrêter l'enregistrement sur l'écran final « CertiShip » |
| **Ce qu'on voit** | 1) un camion part du fournisseur vers l'usine, avec les dates · 2) un personnage masqué modifie une date dans la base de données · 3) « Qui prouve les dates ? » · 4) le colis → empreinte SHA-256 → enchaînée dans les blocs · 5) base ≠ blockchain → « Falsification détectée » · 6) logo CertiShip |
| **Voix off** | (camion) « Un produit quitte le fournisseur et arrive à l'usine. » (base de données) « Mais ces dates sont stockées dans une base de données… et n'importe qui y ayant accès peut les modifier sans laisser de trace. » (question) « Alors, qui prouve les dates ? » (blocs) « CertiShip ancre chaque expédition et chaque arrivée dans la blockchain Ethereum : une empreinte des données, horodatée par le réseau et signée par son auteur avec MetaMask. » (falsification) « Si quelqu'un modifie la base, la blockchain la contredit. » (logo) « CertiShip : des dates que personne ne peut falsifier. » |

### Pages de transition (≈ 4 s chacune)

Cartes animées dans le même style que l'intro : [docs/demo/transitions.html](demo/transitions.html).

| Avant | Ouvrir `docs/demo/transitions.html` dans Chrome → **F11** → démarrer l'enregistrement d'écran |
|---|---|
| **Action** | Appuyer sur le **numéro** de la carte (1 à 7) : elle s'anime en ≈ 2,5 s puis reste affichée. Enregistrer ≈ 4 s puis arrêter. **R** rejoue, **→** passe à la suivante, **Échap** revient au menu |

| Touche | Carte | À placer avant |
|---|---|---|
| **1** | Étape 1 — Le fournisseur déclare une expédition | Clip 2 |
| **2** | Étape 2 — L'opérateur confirme la réception | Clip 3 |
| **3** | Étape 3 — Vérification et falsification | Clip 4 |
| **4** | Étape 4 — Gestion des autorisations | Clip 5 |
| **5** | Étape 5 — Sur le réseau public Ethereum Sepolia | Clip 6 |
| **6** | Qualité — 49 tests automatiques | Clip 7 |
| **7** | Merci ! | À la toute fin |

Ces cartes remplacent les titres « Texte affiché » à ajouter dans Clipchamp. Ordre de montage : intro → 1 → clip 2 → 2 → clip 3 → 3 → clip 4 → 4 → clip 5 → 5 → clip 6 → 6 → clip 7 → clip 8 → 7.

### Clip 2 — Le fournisseur déclare une expédition (0:55)

| | |
|---|---|
| **Avant** | MetaMask sur **Fournisseur** (`0x7099…`), connecté en `fournisseur@demo.local` |
| **Action** | **Nouvelle expédition** → « Parfum » / « Cosmétique » / « 30 flacons de 100 ml » → **Déclarer l'expédition** → **Confirmer** dans MetaMask → message vert → ouvrir le produit → section **Empreintes** |
| **Texte affiché** | « 1. Le fournisseur déclare une expédition » |
| **Voix off** | « Le fournisseur saisit son produit et signe avec MetaMask. Le numéro est attribué par le Smart Contract, et la date certifiée est celle du bloc : personne ne peut l'antidater. Dans la blockchain, on ne publie qu'une empreinte SHA-256 salée : les données restent privées. Chaque produit contient aussi l'empreinte du précédent : ils forment une chaîne. » |

### Clip 3 — L'opérateur confirme l'arrivée (0:35)

| | |
|---|---|
| **Avant** | MetaMask sur **Opérateur** (`0x3C44…`), connecté en `operateur@demo.local` |
| **Action** | **Confirmer une arrivée** → rechercher **5** → **Confirmer l'arrivée du produit n°5** → **Confirmer** dans MetaMask → statut **Arrivé** et **délai** de plusieurs jours |
| **Texte affiché** | « 2. L'opérateur confirme la réception » |
| **Voix off** | « À l'usine, l'opérateur confirme la réception. Le contrat vérifie qu'il est autorisé, que le produit existe et qu'il n'est pas déjà arrivé. Le délai repose sur deux dates certifiées par la blockchain. » |

### Clip 4 — Intégrité et falsification (0:50)

| | |
|---|---|
| **À l'écran** | Terminal à gauche, navigateur sur le produit **7** à droite |
| **Action** | **Vérifier** → « ✔ Intégrité vérifiée » → dans le terminal : `node scripts/falsifier.mjs 7 "Javel falsifiée"` → recharger la page → **Vérifier** → « ✘ Intégrité non vérifiée » |
| **Texte affiché** | « 3. Vérification et tentative de falsification » |
| **Voix off** | « La vérification recalcule les empreintes à partir de la base et les compare à la blockchain : tout est conforme. Maintenant, quelqu'un modifie directement la base de données… La falsification est immédiatement détectée, et l'application indique précisément quelle donnée a changé. La base peut être modifiée, la blockchain non. » |
| **Après** | `node scripts/falsifier.mjs 7 "Javel"` |

### Clip 5 — Révocation d'un fournisseur (0:30)

| | |
|---|---|
| **Avant** | MetaMask sur **Admin** (`0xf39F…`), connecté en `admin@demo.local` |
| **Action** | **Utilisateurs** → **Révoquer on-chain** sur Fournisseur Beta → **Confirmer** → **Non**. *(Coupure.)* Connecté en `fournisseur2@demo.local` avec MetaMask `0x90F7…` → expédition « Détachant » / « Nettoyage » → message rouge « pas autorisé » |
| **Texte affiché** | « 4. Gestion des autorisations » |
| **Voix off** | « L'administrateur révoque un fournisseur directement dans le Smart Contract. Ce fournisseur peut toujours se connecter, mais il ne peut plus rien enregistrer : même en contournant l'application, le contrat refuserait sa transaction. » |

### Clip 6 — Sepolia et Etherscan (0:45) — demain

| | |
|---|---|
| **Avant** | `npm run start:sepolia`, MetaMask sur le réseau **Sepolia**, compte **Sepolia Opérateur**, connecté en `operateur@certiship.test` |
| **Action** | Montrer « **Sepolia** » dans l'en-tête → confirmer l'arrivée de la Cafetière → (couper l'attente de ~12 s) → **Arrivé**, **délai ≈ 1 jour** → cliquer le hash dans **Transactions blockchain** → Etherscan : *From*, *Block*, *Timestamp* |
| **Texte affiché** | « 5. Sur le réseau public Ethereum Sepolia » |
| **Voix off** | « L'application fonctionne aussi sur Sepolia, le réseau de test public d'Ethereum. Ce produit a été expédié hier ; l'opérateur confirme son arrivée. Et voici la preuve sur Etherscan : n'importe qui dans le monde peut vérifier cette transaction, son auteur et sa date, sans avoir à nous faire confiance. » |

### Clip 7 — Les tests (0:20)

| | |
|---|---|
| **Action** | `cd contracts && forge test --summary` puis `forge coverage` |
| **Texte affiché** | « 49 tests automatiques — 100 % de couverture du contrat » |
| **Voix off** | « Le projet est couvert par 49 tests automatiques, dont du fuzzing et des tests d'invariants qui enchaînent des milliers d'opérations aléatoires. Le Smart Contract est couvert à 100 %. » |

### Clip 8 — Conclusion (0:10)

| | |
|---|---|
| **À l'écran** | Page Etherscan du contrat |
| **Texte affiché** | « CertiShip — des dates que personne ne peut falsifier » |
| **Voix off** | « CertiShip : des dates horodatées par la blockchain, signées par leur auteur et vérifiables par tous. Merci. » |

---

## Planning

**Aujourd'hui (Anvil)** : préparation → clips 1, 7 → clip 2 (Fournisseur) → clips 3, 4 (Opérateur) → clip 5 (Admin puis Fournisseur Beta) → arrêter Anvil avec **Ctrl + C** → sur Sepolia, expédier la Cafetière sans confirmer l'arrivée.

**Demain (Sepolia)** : clips 6 et 8 → montage.

## Montage (Clipchamp)

1. **Créer une vidéo** → glisser les clips dans l'ordre 1 → 8.
2. Couper les temps morts : curseur → **S** → **Suppr** (surtout les attentes et les changements de compte). C'est ce qui permet de tenir les 5 minutes.
3. **Texte** → *Titre simple* au début de chaque clip (3 s).
4. **Enregistrer et créer** → **Audio** pour la voix off, ou **Texte en voix** (voix française).
5. Musique douce à ~10 % (*Bibliothèque de contenu* → *Musique*).
6. **Exporter** → **1080p**.
