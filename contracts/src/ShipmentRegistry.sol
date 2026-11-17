// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ShipmentRegistry
/// @notice Certifie les dates d'expédition et d'arrivée des produits d'une usine.
/// @dev Seules les empreintes SHA-256 (calculées hors chaîne) sont stockées ici.
///      Les données détaillées des produits restent dans la base hors chaîne.
///      Chaque expédition est chaînée à la précédente via `previousHash`.
contract ShipmentRegistry {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @dev Le statut n'est jamais saisi : il découle de l'action exécutée (RM4).
    enum Status {
        None, // produit inexistant
        Shipped, // expédié
        Arrived // arrivé
    }

    struct Product {
        bytes32 shipmentHash; // empreinte d'expédition
        bytes32 previousHash; // empreinte d'expédition du produit précédent
        bytes32 arrivalHash; // empreinte d'arrivée (0 tant que non arrivé)
        address supplier; // fournisseur déclarant
        uint64 shippedAt; // horodatage du bloc d'expédition
        Status status;
        address operator; // opérateur ayant confirmé l'arrivée
        uint64 arrivedAt; // horodatage du bloc d'arrivée
    }

    // ------------------------------------------------------------------
    // Stockage
    // ------------------------------------------------------------------

    address public admin;
    uint256 public productCount;
    bytes32 public lastShipmentHash;

    mapping(address => bool) public isSupplier;
    mapping(address => bool) public isOperator;
    mapping(bytes32 => uint256) public productIdByHash;

    mapping(uint256 => Product) private _products;

    // ------------------------------------------------------------------
    // Événements
    // ------------------------------------------------------------------

    event ShipmentRegistered(
        uint256 indexed productId,
        address indexed supplier,
        bytes32 shipmentHash,
        bytes32 previousHash,
        uint64 timestamp
    );
    event ArrivalConfirmed(uint256 indexed productId, address indexed operator, bytes32 arrivalHash, uint64 timestamp);
    event SupplierUpdated(address indexed account, bool authorized);
    event OperatorUpdated(address indexed account, bool authorized);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    // ------------------------------------------------------------------
    // Erreurs
    // ------------------------------------------------------------------

    error NotAdmin();
    error NotSupplier();
    error NotOperator();
    error ZeroAddress();
    error InvalidHash();
    error HashAlreadyUsed(bytes32 hash);
    error UnexpectedProductId(uint256 expected, uint256 provided);
    error PreviousHashMismatch(bytes32 expected, bytes32 provided);
    error ProductNotFound(uint256 productId);
    error AlreadyArrived(uint256 productId);

    // ------------------------------------------------------------------
    // Modificateurs
    // ------------------------------------------------------------------

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlySupplier() {
        if (!isSupplier[msg.sender]) revert NotSupplier();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        admin = initialAdmin;
        emit AdminTransferred(address(0), initialAdmin);
    }

    // ------------------------------------------------------------------
    // Opérations métier
    // ------------------------------------------------------------------

    /// @notice Déclare l'expédition d'un nouveau produit (RM1, RM2, RM5, RM6).
    /// @param expectedId Numéro que l'application a calculé (dernier numéro + 1).
    /// @param previousHash Empreinte du dernier produit lue par l'application.
    /// @param shipmentHash Empreinte SHA-256 du nouveau produit.
    /// @return productId Numéro attribué au produit.
    function registerShipment(uint256 expectedId, bytes32 previousHash, bytes32 shipmentHash)
        external
        onlySupplier
        returns (uint256 productId)
    {
        productId = productCount + 1;
        if (expectedId != productId) revert UnexpectedProductId(productId, expectedId);
        if (previousHash != lastShipmentHash) revert PreviousHashMismatch(lastShipmentHash, previousHash);
        if (shipmentHash == bytes32(0)) revert InvalidHash();
        if (productIdByHash[shipmentHash] != 0) revert HashAlreadyUsed(shipmentHash);

        uint64 nowTs = uint64(block.timestamp);
        Product storage p = _products[productId];
        p.shipmentHash = shipmentHash;
        p.previousHash = previousHash;
        p.supplier = msg.sender;
        p.shippedAt = nowTs;
        p.status = Status.Shipped;

        productCount = productId;
        lastShipmentHash = shipmentHash;
        productIdByHash[shipmentHash] = productId;

        emit ShipmentRegistered(productId, msg.sender, shipmentHash, previousHash, nowTs);
    }

    /// @notice Confirme l'arrivée d'un produit expédié (RM3, RM5, RM7).
    function confirmArrival(uint256 productId, bytes32 arrivalHash) external onlyOperator {
        Product storage p = _products[productId];
        if (p.status == Status.None) revert ProductNotFound(productId);
        if (p.status == Status.Arrived) revert AlreadyArrived(productId);
        if (arrivalHash == bytes32(0)) revert InvalidHash();

        uint64 nowTs = uint64(block.timestamp);
        p.arrivalHash = arrivalHash;
        p.operator = msg.sender;
        p.arrivedAt = nowTs;
        p.status = Status.Arrived;

        emit ArrivalConfirmed(productId, msg.sender, arrivalHash, nowTs);
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    /// @notice Informations blockchain d'un produit (status = None s'il n'existe pas).
    function getProduct(uint256 productId) external view returns (Product memory) {
        return _products[productId];
    }

    /// @notice Dernier numéro et dernière empreinte d'expédition enregistrés.
    function getLastProduct() external view returns (uint256 productId, bytes32 shipmentHash) {
        return (productCount, lastShipmentHash);
    }

    // ------------------------------------------------------------------
    // Gestion des rôles
    // ------------------------------------------------------------------

    function setSupplier(address account, bool authorized) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isSupplier[account] = authorized;
        emit SupplierUpdated(account, authorized);
    }

    function setOperator(address account, bool authorized) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isOperator[account] = authorized;
        emit OperatorUpdated(account, authorized);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
