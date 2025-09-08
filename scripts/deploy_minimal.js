// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const bs58 = require("bs58");

// ============ DEPLOYMENT CONFIGURATION ============
// Change this to switch between networks: 'mainnet', 'sepolia', or 'bscMainnet'
const NETWORK = "mainnet";

// Network configurations
const NETWORK_CONFIG = {
  mainnet: {
    name: "Ethereum Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
  },
  sepolia: {
    name: "Sepolia Testnet",
    wormhole: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    tokenBridge: "0xDB5492265f6038831E89f495670FF909aDe94bd9",
  },
  bscMainnet: {
    name: "BSC Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7",
  },
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Validate network configuration
  if (!NETWORK_CONFIG[NETWORK]) {
    throw new Error(
      `Invalid network: ${NETWORK}. Must be 'mainnet' or 'sepolia'`
    );
  }

  const config = NETWORK_CONFIG[NETWORK];

  console.log("=".repeat(60));
  console.log(`🚀 Deploying MinimalWormholeRelayer to ${config.name}`);
  console.log("=".repeat(60));
  console.log(`Deploying with account: ${deployer.address}`);
  console.log();

  // Get contract factory for MinimalWormholeRelayer
  const MinimalWormholeRelayer = await hre.ethers.getContractFactory(
    "MinimalWormholeRelayer"
  );

  // Display deployment configuration
  console.log("📋 Deployment Configuration:");
  console.log(`   Network: ${config.name}`);
  console.log(`   Wormhole Address: ${config.wormhole}`);
  console.log(`   Token Bridge Address: ${config.tokenBridge}`);
  console.log();

  console.log("⏳ Deploying contract...");

  // Deploy the contract directly (not upgradeable)
  const minimalWormholeRelayer = await MinimalWormholeRelayer.deploy(
    config.wormhole,
    config.tokenBridge
  );

  await minimalWormholeRelayer.waitForDeployment();

  const deployedAddress = await minimalWormholeRelayer.getAddress();

  console.log("✅ Deployment successful!");
  console.log();
  console.log("📍 Contract Details:");
  console.log(`   Contract: MinimalWormholeRelayer`);
  console.log(`   Network: ${config.name}`);
  console.log(`   Address: ${deployedAddress}`);
  console.log();
  console.log("🔧 Constructor Parameters:");
  console.log(`   Wormhole: ${config.wormhole}`);
  console.log(`   Token Bridge: ${config.tokenBridge}`);
  console.log();
  console.log("=".repeat(60));
  console.log(`🎉 MinimalWormholeRelayer deployed to: ${deployedAddress}`);
  console.log("=".repeat(60));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
