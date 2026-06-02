// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {MaestroManagerRSC} from "../src/MaestroManagerRSC.sol";

/// @notice Deploys the Reactive Smart Contract on Reactive Lasna. It subscribes to a Pyth
///         PriceFeedUpdate on the origin chain (Ethereum Sepolia) and triggers a cross-chain
///         reposition callback on the destination chain (Unichain). Configure via env. Run with:
///         forge script script/DeployRSC.s.sol --rpc-url $REACTIVE_RPC --private-key $PK --broadcast --legacy
contract DeployRSC is Script {
    function run() external {
        uint256 originChainId = vm.envOr("ORIGIN_CHAIN_ID", uint256(11155111)); // Ethereum Sepolia
        uint256 destChainId = vm.envOr("DEST_CHAIN_ID", uint256(1301)); // Unichain Sepolia
        address originPyth = vm.envAddress("ORIGIN_PYTH"); // Pyth on Ethereum Sepolia
        bytes32 priceId = vm.envBytes32("PRICE_ID"); // ETH/USD feed id
        address managerCallback = vm.envAddress("MANAGER_CALLBACK"); // on Unichain

        vm.startBroadcast();
        MaestroManagerRSC rsc =
            new MaestroManagerRSC(originChainId, destChainId, originPyth, priceId, managerCallback);
        vm.stopBroadcast();

        console.log("MaestroManagerRSC:", address(rsc));
    }
}
