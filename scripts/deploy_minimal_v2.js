// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const bs58 = require("bs58");

// ============ DEPLOYMENT CONFIGURATION ============
// Change this to switch between networks: 'ethereum', 'sepolia', or 'bsc_main'
const NETWORK = "bsc_main";

// Network configurations
const NETWORK_CONFIG = {
  ethereum: {
    name: "Ethereum Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
    pancakeRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", // Uniswap V3 SwapRouter02
  },
  sepolia: {
    name: "Sepolia Testnet",
    wormhole: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    tokenBridge: "0xDB5492265f6038831E89f495670FF909aDe94bd9",
    pancakeRouter: "", // Uniswap V3 Router
  },
  bsc_main: {
    name: "BSC Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7",
    // pancakeRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", // PancakeSwap V3 Router
    pancakeRouter: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap Smart Router
  },
};



async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Validate network configuration
  if (!NETWORK_CONFIG[NETWORK]) {
    throw new Error(
      `Invalid network: ${NETWORK}. Must be 'ethereum', 'sepolia', or 'bsc_main'`
    );
  }

  const config = NETWORK_CONFIG[NETWORK];

  console.log("=".repeat(60));
  console.log(`🚀 Deploying MinimalWormholeRelayerV2 to ${config.name}`);
  console.log("=".repeat(60));
  console.log(`Deploying with account: ${deployer.address}`);
  console.log();

  // Get contract factory for MinimalWormholeRelayerV2
  const MinimalWormholeRelayerV2 = await hre.ethers.getContractFactory(
    "MinimalWormholeRelayerV2"
  );

  // Display deployment configuration
  console.log("📋 Deployment Configuration:");
  console.log(`   Network: ${config.name}`);
  console.log(`   Wormhole Address: ${config.wormhole}`);
  console.log(`   Token Bridge Address: ${config.tokenBridge}`);
  console.log(`   PancakeSwap Router Address: ${config.pancakeRouter}`);
  console.log();

  console.log("⏳ Deploying contract...");

  // Get current nonce from network to avoid nonce issues
  console.log("--- Fetching Current Nonce ---");
  const currentNonce = await deployer.getNonce();
  console.log(`Current nonce: ${currentNonce}`);

  // Deploy the contract with explicit nonce
  const minimalWormholeRelayer = await MinimalWormholeRelayerV2.deploy(
    config.wormhole,
    config.tokenBridge,
    config.pancakeRouter,
    { nonce: currentNonce }
  );

  await minimalWormholeRelayer.waitForDeployment();

  const deployedAddress = await minimalWormholeRelayer.getAddress();

  console.log("✅ Deployment successful!");
  console.log();
  console.log("📍 Contract Details:");
  console.log(`   Contract: MinimalWormholeRelayerV2`);
  console.log(`   Network: ${config.name}`);
  console.log(`   Address: ${deployedAddress}`);
  console.log();
  console.log("🔧 Constructor Parameters:");
  console.log(`   Wormhole: ${config.wormhole}`);
  console.log(`   Token Bridge: ${config.tokenBridge}`);
  console.log(`   PancakeSwap Router: ${config.pancakeRouter}`);
  console.log();
  console.log("=".repeat(60));
  console.log(`🎉 MinimalWormholeRelayerV2 deployed to: ${deployedAddress}`);
  console.log("=".repeat(60));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error.message);

  // Handle nonce-related errors specifically
  if (error.message.includes("nonce too low") || error.message.includes("nonce")) {
    console.log("\n--- Nonce Error Detected ---");
    console.log("This usually happens when:");
    console.log("1. Previous transactions are still pending");
    console.log("2. Multiple scripts are running simultaneously");
    console.log("3. Network congestion causing nonce desynchronization");
    console.log("\nTry running the deployment script again in a few seconds.");
    console.log("If the issue persists, check for pending transactions in your wallet.");
  }

  process.exitCode = 1;
});
