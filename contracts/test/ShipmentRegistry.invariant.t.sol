// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShipmentRegistry} from "../src/ShipmentRegistry.sol";

/// @dev Handler appelé aléatoirement par le moteur d'invariants de Foundry.
contract RegistryHandler is Test {
    ShipmentRegistry public registry;
    address[] public suppliers;
    address[] public operators;

    uint256 public ghostArrived;
    uint256 internal nonce;

    constructor(ShipmentRegistry _registry, address[] memory _suppliers, address[] memory _operators) {
        registry = _registry;
        suppliers = _suppliers;
        operators = _operators;
    }

    function ship(uint256 actorSeed, uint256 timeJump) external {
        vm.warp(block.timestamp + bound(timeJump, 0, 7 days));
        (uint256 lastId, bytes32 lastHash) = registry.getLastProduct();
        bytes32 h = keccak256(abi.encode("ship", nonce++));
        vm.prank(suppliers[actorSeed % suppliers.length]);
        registry.registerShipment(lastId + 1, lastHash, h);
    }

    function shipStale(uint256 actorSeed, uint256 offset) external {
        (uint256 lastId, bytes32 lastHash) = registry.getLastProduct();
        uint256 wrongId = lastId + 1 + bound(offset, 1, 1000);
        vm.prank(suppliers[actorSeed % suppliers.length]);
        try registry.registerShipment(wrongId, lastHash, keccak256(abi.encode("stale", nonce++))) {
            revert("un numero incorrect a ete accepte");
        } catch {}
    }

    function arrive(uint256 actorSeed, uint256 idSeed, uint256 timeJump) external {
        uint256 count = registry.productCount();
        if (count == 0) return;
        vm.warp(block.timestamp + bound(timeJump, 0, 7 days));
        uint256 id = bound(idSeed, 1, count);
        bool wasArrived = registry.getProduct(id).status == ShipmentRegistry.Status.Arrived;
        vm.prank(operators[actorSeed % operators.length]);
        try registry.confirmArrival(id, keccak256(abi.encode("arrival", nonce++))) {
            if (wasArrived) revert("double confirmation acceptee");
            ghostArrived++;
        } catch {
            if (!wasArrived) revert("confirmation valide refusee");
        }
    }
}

contract ShipmentRegistryInvariantTest is Test {
    ShipmentRegistry internal registry;
    RegistryHandler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        registry = new ShipmentRegistry(admin);

        address[] memory suppliers = new address[](2);
        suppliers[0] = makeAddr("s1");
        suppliers[1] = makeAddr("s2");
        address[] memory operators = new address[](2);
        operators[0] = makeAddr("o1");
        operators[1] = makeAddr("o2");

        vm.startPrank(admin);
        for (uint256 i; i < 2; i++) {
            registry.setSupplier(suppliers[i], true);
            registry.setOperator(operators[i], true);
        }
        vm.stopPrank();

        handler = new RegistryHandler(registry, suppliers, operators);
        targetContract(address(handler));
    }

    /// Les numéros sont continus et chaque produit est lié au précédent.
    function invariant_ChainIsContinuous() public view {
        uint256 count = registry.productCount();
        bytes32 prev = bytes32(0);
        for (uint256 i = 1; i <= count; i++) {
            ShipmentRegistry.Product memory p = registry.getProduct(i);
            assertTrue(p.status != ShipmentRegistry.Status.None, "trou dans la numerotation");
            assertEq(p.previousHash, prev, "chainage rompu");
            assertEq(registry.productIdByHash(p.shipmentHash), i);
            prev = p.shipmentHash;
        }
        assertEq(registry.lastShipmentHash(), prev);
        assertEq(uint8(registry.getProduct(count + 1).status), uint8(ShipmentRegistry.Status.None));
    }

    /// L'arrivée n'est jamais antérieure à l'expédition ; les champs sont cohérents avec le statut.
    function invariant_StatusConsistency() public view {
        uint256 count = registry.productCount();
        uint256 arrived;
        for (uint256 i = 1; i <= count; i++) {
            ShipmentRegistry.Product memory p = registry.getProduct(i);
            if (p.status == ShipmentRegistry.Status.Arrived) {
                arrived++;
                assertGe(p.arrivedAt, p.shippedAt);
                assertTrue(p.arrivalHash != bytes32(0));
                assertTrue(p.operator != address(0));
            } else {
                assertEq(p.arrivalHash, bytes32(0));
                assertEq(p.operator, address(0));
                assertEq(p.arrivedAt, 0);
            }
        }
        assertEq(arrived, handler.ghostArrived());
    }
}
