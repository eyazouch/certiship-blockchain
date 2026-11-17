// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShipmentRegistry} from "../src/ShipmentRegistry.sol";

/// @notice Déploie ShipmentRegistry et autorise les comptes listés.
/// Signature : soit PRIVATE_KEY (Anvil uniquement), soit un keystore chiffré
/// (`cast wallet import deployer --interactive` puis `--account deployer --sender <adresse>`).
/// Variables d'environnement :
///   PRIVATE_KEY  clé du déployeur (optionnel, réservé au développement local)
///   SUPPLIERS    adresses fournisseurs séparées par des virgules (optionnel)
///   OPERATORS    adresses opérateurs séparées par des virgules (optionnel)
///   ADMIN        nouvel administrateur après configuration (optionnel)
contract Deploy is Script {
    function run() external returns (ShipmentRegistry registry) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        address[] memory suppliers = vm.envOr("SUPPLIERS", ",", new address[](0));
        address[] memory operators = vm.envOr("OPERATORS", ",", new address[](0));
        address finalAdmin = vm.envOr("ADMIN", deployer);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();
        registry = new ShipmentRegistry(deployer);
        for (uint256 i; i < suppliers.length; i++) {
            registry.setSupplier(suppliers[i], true);
        }
        for (uint256 i; i < operators.length; i++) {
            registry.setOperator(operators[i], true);
        }
        if (finalAdmin != deployer) {
            registry.transferAdmin(finalAdmin);
        }
        vm.stopBroadcast();

        console.log("ShipmentRegistry:", address(registry));
        console.log("Admin:", registry.admin());
    }
}
