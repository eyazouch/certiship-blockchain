# Diagrammes UML

Les diagrammes sont écrits en [Mermaid](https://mermaid.js.org/). GitHub, GitLab et VS Code (extension *Markdown Preview Mermaid Support*) les affichent directement. Pour les exporter en image : <https://mermaid.live>.

## 1. Diagramme de cas d'utilisation

```mermaid
flowchart LR
    F([Fournisseur])
    O([Opérateur usine])
    A([Administrateur])
    BC[(Smart Contract)]

    subgraph Application CertiShip
        UC1(Se connecter)
        UC2(Déclarer une expédition)
        UC3(Consulter ses produits)
        UC4(Rechercher un produit par numéro)
        UC5(Confirmer l'arrivée)
        UC6(Consulter l'historique filtré)
        UC7(Vérifier l'intégrité)
        UC8(Suivre les transactions)
        UC9(Gérer les comptes)
        UC10(Autoriser / révoquer un portefeuille)
        UC11(Resynchroniser depuis la blockchain)
    end

    F --- UC1 & UC2 & UC3 & UC7 & UC8
    O --- UC1 & UC4 & UC5 & UC6 & UC7 & UC8
    A --- UC1 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11
    UC2 -. registerShipment .-> BC
    UC5 -. confirmArrival .-> BC
    UC10 -. setSupplier / setOperator .-> BC
    UC7 -. getProduct .-> BC
```

## 2. Diagramme de classes

```mermaid
classDiagram
    direction LR

    class ShipmentRegistry {
        <<Smart Contract>>
        +address admin
        +uint256 productCount
        +bytes32 lastShipmentHash
        +mapping isSupplier
        +mapping isOperator
        +mapping productIdByHash
        -mapping~uint256,Product~ _products
        +registerShipment(expectedId, previousHash, shipmentHash) uint256
        +confirmArrival(productId, arrivalHash)
        +getProduct(productId) Product
        +getLastProduct() (uint256, bytes32)
        +setSupplier(account, authorized)
        +setOperator(account, authorized)
        +transferAdmin(newAdmin)
    }

    class Product_onchain {
        <<struct>>
        bytes32 shipmentHash
        bytes32 previousHash
        bytes32 arrivalHash
        address supplier
        uint64 shippedAt
        Status status
        address operator
        uint64 arrivedAt
    }

    class Status {
        <<enumeration>>
        None
        Shipped
        Arrived
    }

    class User {
        <<table SQL>>
        id
        name
        email
        password_hash
        role : ADMIN | SUPPLIER | OPERATOR
        wallet_address
        active
    }

    class Product {
        <<table SQL>>
        id
        number
        name
        category
        description
        salt
        previous_hash
        shipment_hash
        arrival_salt
        arrival_hash
        status : DRAFT | SHIPPED | ARRIVED
        shipped_at
        arrived_at
        supplier_id
        operator_id
    }

    class Transaction {
        <<table SQL>>
        id
        product_number
        type : SHIPMENT | ARRIVAL
        tx_hash
        state : PENDING | CONFIRMED | FAILED
        submitted_at
        confirmed_at
        error
    }

    ShipmentRegistry "1" *-- "*" Product_onchain
    Product_onchain --> Status
    User "1" --> "*" Product : fournisseur
    User "1" --> "*" Product : opérateur
    Product "1" --> "*" Transaction
    Product .. Product_onchain : number = productId\nshipment_hash = shipmentHash
```

## 3. Diagramme de séquence — Déclaration de l'expédition

```mermaid
sequenceDiagram
    autonumber
    actor F as Fournisseur
    participant UI as Frontend React
    participant API as Backend Node.js
    participant DB as Base SQLite
    participant MM as MetaMask
    participant SC as ShipmentRegistry

    F->>UI: Saisit nom, catégorie, description
    UI->>API: POST /shipments/prepare
    API->>SC: getLastProduct()
    SC-->>API: (n, hashPrécédent)
    API->>API: sel aléatoire + SHA-256(n+1, données, sel, hashPrécédent)
    API->>DB: INSERT produit (DRAFT, sel, empreinte)
    API-->>UI: brouillon (n+1, hashPrécédent, empreinte)
    UI->>SC: simulation registerShipment()
    alt autre expédition entre-temps
        SC-->>UI: UnexpectedProductId / PreviousHashMismatch
        UI->>API: POST /shipments/:id/refresh
        API->>SC: getLastProduct()
        API->>DB: nouvelle empreinte
        API-->>UI: brouillon recalculé
    end
    UI->>MM: signature de la transaction
    MM->>SC: registerShipment(n+1, hashPrécédent, empreinte)
    SC->>SC: vérifie rôle, numéro, chaînage
    SC-->>MM: hash de transaction
    UI->>API: POST /shipments/:id/submit (txHash)
    API->>DB: transaction PENDING
    SC-->>UI: reçu (bloc miné)
    UI->>API: POST /transactions/:hash/sync
    API->>SC: lit le reçu et l'événement ShipmentRegistered
    API->>DB: produit SHIPPED, numéro, date du bloc, tx CONFIRMED
    API-->>UI: confirmé
```

## 4. Diagramme de séquence — Confirmation de l'arrivée

```mermaid
sequenceDiagram
    autonumber
    actor O as Opérateur
    participant UI as Frontend React
    participant API as Backend Node.js
    participant DB as Base SQLite
    participant MM as MetaMask
    participant SC as ShipmentRegistry

    O->>UI: Recherche le produit n°N
    UI->>API: GET /products/N
    API-->>UI: informations, statut Expédié
    O->>UI: Confirme la réception
    UI->>API: POST /arrivals/prepare {N}
    API->>SC: getProduct(N)
    API->>API: vérifie statut = Shipped
    API->>API: SHA-256(N, empreinteExpédition, adresseOpérateur, sel)
    API->>DB: sel et empreinte d'arrivée
    API-->>UI: empreinte d'arrivée
    UI->>MM: signature
    MM->>SC: confirmArrival(N, empreinte)
    SC->>SC: vérifie rôle, existence, non déjà arrivé
    SC-->>UI: reçu (événement ArrivalConfirmed)
    UI->>API: POST /transactions/:hash/sync
    API->>DB: statut ARRIVED, date du bloc
```

## 5. Diagramme de séquence — Vérification de l'intégrité

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant API as Backend Node.js
    participant DB as Base SQLite
    participant SC as ShipmentRegistry

    U->>API: GET /products/N/verify
    API->>DB: données du produit + sels
    API->>SC: getProduct(N) et getProduct(N-1)
    API->>API: recalcule l'empreinte d'expédition
    API->>API: recalcule l'empreinte d'arrivée (si arrivé)
    API->>API: compare statut et dates
    API-->>U: Intégrité vérifiée / non vérifiée + détail des contrôles
```

## 6. Diagramme d'états — Produit

```mermaid
stateDiagram-v2
    [*] --> Brouillon : préparation (hors chaîne)
    Brouillon --> Brouillon : refresh (concurrence)
    Brouillon --> [*] : abandon
    Brouillon --> Expédié : registerShipment() confirmé
    Expédié --> Arrivé : confirmArrival() confirmé
    Arrivé --> [*]

    note right of Expédié
        Le statut n'est jamais saisi :
        il découle de l'action exécutée
        dans le Smart Contract (RM4)
    end note
```

## 7. Diagramme de déploiement

```mermaid
flowchart LR
    subgraph Poste utilisateur
        B[Navigateur<br/>React + wagmi]
        MM[Extension MetaMask<br/>clé privée de l'utilisateur]
    end
    subgraph Serveur
        API[Backend Node.js<br/>Express]
        DB[(SQLite)]
        IDX[Indexeur<br/>d'événements]
    end
    subgraph Ethereum
        N[Nœud RPC<br/>Anvil / Sepolia]
        SC[[ShipmentRegistry]]
    end

    B -- HTTPS / JSON + JWT --> API
    B --- MM
    MM -- transactions signées --> N
    API --- DB
    IDX --- DB
    API -- lecture --> N
    IDX -- getLogs --> N
    N --- SC
```
