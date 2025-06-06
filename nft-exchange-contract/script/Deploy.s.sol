// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console2} from "forge-std/Script.sol";
import {NFTExchange} from "../src/NFTExchange.sol";

contract DeployScript is Script {
    // Base mainnet USDC address
    address constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // Default fee recipient
    address constant FEE_RECIPIENT = address(0x0db12C0A67bc5B8942ea3126a465d7a0b23126C7);
    
    // Default fee: 1%
    uint256 constant INITIAL_FEE_BPS = 100;

    function setUp() public {}

    function run() public {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy NFTExchange contract
        NFTExchange exchange = new NFTExchange(
            USDC_BASE_MAINNET,
            FEE_RECIPIENT,
            INITIAL_FEE_BPS
        );
        
        console2.log("NFTExchange deployed at:", address(exchange));
        console2.log("USDC address:", USDC_BASE_MAINNET);
        console2.log("Fee recipient:", FEE_RECIPIENT);
        console2.log("Initial fee (bps):", INITIAL_FEE_BPS);
        
        vm.stopBroadcast();
    }
}