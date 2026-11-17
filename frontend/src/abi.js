import { parseAbi } from 'viem';

// ABI de contracts/src/ShipmentRegistry.sol (garder synchronisé avec backend/src/abi.js)
export const registryAbi = parseAbi([
  'struct Product { bytes32 shipmentHash; bytes32 previousHash; bytes32 arrivalHash; address supplier; uint64 shippedAt; uint8 status; address operator; uint64 arrivedAt; }',
  'function admin() view returns (address)',
  'function productCount() view returns (uint256)',
  'function lastShipmentHash() view returns (bytes32)',
  'function isSupplier(address) view returns (bool)',
  'function isOperator(address) view returns (bool)',
  'function productIdByHash(bytes32) view returns (uint256)',
  'function getProduct(uint256 productId) view returns (Product)',
  'function getLastProduct() view returns (uint256 productId, bytes32 shipmentHash)',
  'function registerShipment(uint256 expectedId, bytes32 previousHash, bytes32 shipmentHash) returns (uint256 productId)',
  'function confirmArrival(uint256 productId, bytes32 arrivalHash)',
  'function setSupplier(address account, bool authorized)',
  'function setOperator(address account, bool authorized)',
  'function transferAdmin(address newAdmin)',
  'event ShipmentRegistered(uint256 indexed productId, address indexed supplier, bytes32 shipmentHash, bytes32 previousHash, uint64 timestamp)',
  'event ArrivalConfirmed(uint256 indexed productId, address indexed operator, bytes32 arrivalHash, uint64 timestamp)',
  'event SupplierUpdated(address indexed account, bool authorized)',
  'event OperatorUpdated(address indexed account, bool authorized)',
  'event AdminTransferred(address indexed previousAdmin, address indexed newAdmin)',
  'error NotAdmin()',
  'error NotSupplier()',
  'error NotOperator()',
  'error ZeroAddress()',
  'error InvalidHash()',
  'error HashAlreadyUsed(bytes32 hash)',
  'error UnexpectedProductId(uint256 expected, uint256 provided)',
  'error PreviousHashMismatch(bytes32 expected, bytes32 provided)',
  'error ProductNotFound(uint256 productId)',
  'error AlreadyArrived(uint256 productId)',
]);

export const CHAIN_STATUS = ['NONE', 'SHIPPED', 'ARRIVED'];
