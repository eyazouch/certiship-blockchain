// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShipmentRegistry} from "../src/ShipmentRegistry.sol";

contract ShipmentRegistryTest is Test {
    ShipmentRegistry internal registry;

    address internal admin = makeAddr("admin");
    address internal supplier = makeAddr("supplier");
    address internal supplier2 = makeAddr("supplier2");
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant H1 = keccak256("produit-1");
    bytes32 internal constant H2 = keccak256("produit-2");
    bytes32 internal constant A1 = keccak256("arrivee-1");

    event ShipmentRegistered(
        uint256 indexed productId,
        address indexed supplier,
        bytes32 shipmentHash,
        bytes32 previousHash,
        uint64 timestamp
    );
    event ArrivalConfirmed(uint256 indexed productId, address indexed operator, bytes32 arrivalHash, uint64 timestamp);

    function setUp() public {
        registry = new ShipmentRegistry(admin);
        vm.startPrank(admin);
        registry.setSupplier(supplier, true);
        registry.setSupplier(supplier2, true);
        registry.setOperator(operator, true);
        vm.stopPrank();
        vm.warp(1_700_000_000);
    }

    function _ship(address who, bytes32 hash) internal returns (uint256) {
        (uint256 lastId, bytes32 lastHash) = registry.getLastProduct();
        vm.prank(who);
        return registry.registerShipment(lastId + 1, lastHash, hash);
    }

    // ------------------------------------------------------------------
    // État initial
    // ------------------------------------------------------------------

    function test_InitialState() public view {
        assertEq(registry.admin(), admin);
        assertEq(registry.productCount(), 0);
        (uint256 id, bytes32 h) = registry.getLastProduct();
        assertEq(id, 0);
        assertEq(h, bytes32(0));
    }

    function test_RevertWhen_ConstructorZeroAdmin() public {
        vm.expectRevert(ShipmentRegistry.ZeroAddress.selector);
        new ShipmentRegistry(address(0));
    }

    // ------------------------------------------------------------------
    // Test 1 : expédition valide
    // ------------------------------------------------------------------

    function test_RegisterShipment_Valid() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit ShipmentRegistered(1, supplier, H1, bytes32(0), uint64(block.timestamp));

        vm.prank(supplier);
        uint256 id = registry.registerShipment(1, bytes32(0), H1);

        assertEq(id, 1, "le premier numero est 1");
        ShipmentRegistry.Product memory p = registry.getProduct(1);
        assertEq(p.shipmentHash, H1);
        assertEq(p.previousHash, bytes32(0));
        assertEq(p.supplier, supplier);
        assertEq(p.shippedAt, uint64(block.timestamp));
        assertEq(uint8(p.status), uint8(ShipmentRegistry.Status.Shipped));
        assertEq(p.arrivalHash, bytes32(0));
        assertEq(p.arrivedAt, 0);
        assertEq(registry.productIdByHash(H1), 1);
    }

    function test_RegisterShipment_ChainsToPrevious() public {
        _ship(supplier, H1);
        uint256 id2 = _ship(supplier2, H2);

        assertEq(id2, 2);
        ShipmentRegistry.Product memory p2 = registry.getProduct(2);
        assertEq(p2.previousHash, H1, "le produit 2 est lie au produit 1");
        (uint256 lastId, bytes32 lastHash) = registry.getLastProduct();
        assertEq(lastId, 2);
        assertEq(lastHash, H2);
    }

    // ------------------------------------------------------------------
    // Test 2 : fournisseur non autorisé
    // ------------------------------------------------------------------

    function test_RevertWhen_UnauthorizedSupplier() public {
        vm.prank(stranger);
        vm.expectRevert(ShipmentRegistry.NotSupplier.selector);
        registry.registerShipment(1, bytes32(0), H1);
    }

    function test_RevertWhen_OperatorTriesToShip() public {
        vm.prank(operator);
        vm.expectRevert(ShipmentRegistry.NotSupplier.selector);
        registry.registerShipment(1, bytes32(0), H1);
    }

    function test_RevertWhen_RevokedSupplier() public {
        vm.prank(admin);
        registry.setSupplier(supplier, false);
        vm.prank(supplier);
        vm.expectRevert(ShipmentRegistry.NotSupplier.selector);
        registry.registerShipment(1, bytes32(0), H1);
    }

    // ------------------------------------------------------------------
    // Contrôles de cohérence
    // ------------------------------------------------------------------

    function test_RevertWhen_PreviousHashMismatch() public {
        _ship(supplier, H1);
        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.PreviousHashMismatch.selector, H1, bytes32(0)));
        registry.registerShipment(2, bytes32(0), H2);
    }

    function test_RevertWhen_ZeroHash() public {
        vm.prank(supplier);
        vm.expectRevert(ShipmentRegistry.InvalidHash.selector);
        registry.registerShipment(1, bytes32(0), bytes32(0));
    }

    function test_RevertWhen_HashReused() public {
        _ship(supplier, H1);
        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.HashAlreadyUsed.selector, H1));
        registry.registerShipment(2, H1, H1);
    }

    // ------------------------------------------------------------------
    // Test 3 : confirmation d'arrivée valide
    // ------------------------------------------------------------------

    function test_ConfirmArrival_Valid() public {
        _ship(supplier, H1);
        vm.warp(block.timestamp + 2 days);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ArrivalConfirmed(1, operator, A1, uint64(block.timestamp));

        vm.prank(operator);
        registry.confirmArrival(1, A1);

        ShipmentRegistry.Product memory p = registry.getProduct(1);
        assertEq(uint8(p.status), uint8(ShipmentRegistry.Status.Arrived));
        assertEq(p.arrivalHash, A1);
        assertEq(p.operator, operator);
        assertEq(p.arrivedAt, uint64(block.timestamp));
        assertEq(p.arrivedAt - p.shippedAt, 2 days, "delai detectable");
    }

    function test_RevertWhen_UnauthorizedOperator() public {
        _ship(supplier, H1);
        vm.prank(supplier);
        vm.expectRevert(ShipmentRegistry.NotOperator.selector);
        registry.confirmArrival(1, A1);
    }

    function test_RevertWhen_ArrivalZeroHash() public {
        _ship(supplier, H1);
        vm.prank(operator);
        vm.expectRevert(ShipmentRegistry.InvalidHash.selector);
        registry.confirmArrival(1, bytes32(0));
    }

    // ------------------------------------------------------------------
    // Test 4 : double confirmation
    // ------------------------------------------------------------------

    function test_RevertWhen_DoubleArrival() public {
        _ship(supplier, H1);
        vm.prank(operator);
        registry.confirmArrival(1, A1);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.AlreadyArrived.selector, 1));
        registry.confirmArrival(1, keccak256("autre"));
    }

    // ------------------------------------------------------------------
    // Test 5 : produit inexistant
    // ------------------------------------------------------------------

    function test_RevertWhen_ArrivalUnknownProduct() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.ProductNotFound.selector, 0));
        registry.confirmArrival(0, A1);

        _ship(supplier, H1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.ProductNotFound.selector, 99));
        registry.confirmArrival(99, A1);
    }

    function test_GetProduct_UnknownReturnsNone() public view {
        ShipmentRegistry.Product memory p = registry.getProduct(42);
        assertEq(uint8(p.status), uint8(ShipmentRegistry.Status.None));
    }

    // ------------------------------------------------------------------
    // Test 7 : transactions simultanées
    // ------------------------------------------------------------------

    function test_ConcurrentShipments_SecondIsRejectedThenRetried() public {
        // Les deux fournisseurs lisent le même état
        (uint256 lastId, bytes32 lastHash) = registry.getLastProduct();

        vm.prank(supplier);
        registry.registerShipment(lastId + 1, lastHash, H1);

        // Le second utilise des informations périmées : refus
        vm.prank(supplier2);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.UnexpectedProductId.selector, 2, 1));
        registry.registerShipment(lastId + 1, lastHash, H2);

        // L'application relit l'état et réessaie
        (lastId, lastHash) = registry.getLastProduct();
        vm.prank(supplier2);
        uint256 id = registry.registerShipment(lastId + 1, lastHash, H2);
        assertEq(id, 2);
        assertEq(registry.getProduct(2).supplier, supplier2);
        assertEq(registry.getProduct(1).supplier, supplier, "le produit 1 n'est pas ecrase");
    }

    // ------------------------------------------------------------------
    // Gestion des rôles
    // ------------------------------------------------------------------

    function test_RevertWhen_NonAdminManagesRoles() public {
        vm.startPrank(stranger);
        vm.expectRevert(ShipmentRegistry.NotAdmin.selector);
        registry.setSupplier(stranger, true);
        vm.expectRevert(ShipmentRegistry.NotAdmin.selector);
        registry.setOperator(stranger, true);
        vm.expectRevert(ShipmentRegistry.NotAdmin.selector);
        registry.transferAdmin(stranger);
        vm.stopPrank();
    }

    function test_RevertWhen_RoleForZeroAddress() public {
        vm.startPrank(admin);
        vm.expectRevert(ShipmentRegistry.ZeroAddress.selector);
        registry.setSupplier(address(0), true);
        vm.expectRevert(ShipmentRegistry.ZeroAddress.selector);
        registry.setOperator(address(0), true);
        vm.expectRevert(ShipmentRegistry.ZeroAddress.selector);
        registry.transferAdmin(address(0));
        vm.stopPrank();
    }

    function test_TransferAdmin() public {
        vm.prank(admin);
        registry.transferAdmin(stranger);
        assertEq(registry.admin(), stranger);

        vm.prank(admin);
        vm.expectRevert(ShipmentRegistry.NotAdmin.selector);
        registry.setSupplier(admin, true);

        vm.prank(stranger);
        registry.setOperator(stranger, true);
        assertTrue(registry.isOperator(stranger));
    }

    // ------------------------------------------------------------------
    // Fuzzing
    // ------------------------------------------------------------------

    function testFuzz_SequentialIdsAndChaining(uint8 count, bytes32 seed) public {
        uint256 n = bound(count, 1, 40);
        bytes32 prev = bytes32(0);
        for (uint256 i = 1; i <= n; i++) {
            bytes32 h = keccak256(abi.encode(seed, i));
            vm.prank(i % 2 == 0 ? supplier : supplier2);
            uint256 id = registry.registerShipment(i, prev, h);
            assertEq(id, i);
            assertEq(registry.getProduct(i).previousHash, prev);
            prev = h;
        }
        assertEq(registry.productCount(), n);
        assertEq(registry.lastShipmentHash(), prev);
    }

    function testFuzz_RevertWhen_WrongExpectedId(uint256 wrongId) public {
        vm.assume(wrongId != 1);
        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.UnexpectedProductId.selector, 1, wrongId));
        registry.registerShipment(wrongId, bytes32(0), H1);
    }

    function testFuzz_RevertWhen_UnauthorizedCaller(address caller, bytes32 hash) public {
        vm.assume(caller != supplier && caller != supplier2);
        vm.prank(caller);
        vm.expectRevert(ShipmentRegistry.NotSupplier.selector);
        registry.registerShipment(1, bytes32(0), hash);
    }

    function testFuzz_RevertWhen_UnauthorizedArrival(address caller) public {
        vm.assume(caller != operator);
        _ship(supplier, H1);
        vm.prank(caller);
        vm.expectRevert(ShipmentRegistry.NotOperator.selector);
        registry.confirmArrival(1, A1);
    }

    function testFuzz_TimestampsComeFromBlocks(uint32 shipTs, uint32 delay, bytes32 hash, bytes32 arrival) public {
        vm.assume(hash != bytes32(0) && arrival != bytes32(0));
        uint256 t1 = bound(shipTs, 1, type(uint32).max);
        vm.warp(t1);
        _ship(supplier, hash);
        vm.warp(t1 + delay);
        vm.prank(operator);
        registry.confirmArrival(1, arrival);

        ShipmentRegistry.Product memory p = registry.getProduct(1);
        assertEq(p.shippedAt, uint64(t1));
        assertEq(p.arrivedAt, uint64(t1 + delay));
        assertGe(p.arrivedAt, p.shippedAt);
    }

    function testFuzz_RevertWhen_ArrivalOnUnknownId(uint256 id) public {
        _ship(supplier, H1);
        vm.assume(id != 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ShipmentRegistry.ProductNotFound.selector, id));
        registry.confirmArrival(id, A1);
    }
}
