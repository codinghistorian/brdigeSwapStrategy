// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const bs58 = require("bs58");

// ============ DEPLOYMENT CONFIGURATION ============
// Change this to switch between networks: 'mainnet' or 'sepolia'
const NETWORK = "bsc_test";

// Network configurations
const NETWORK_CONFIG = {
  mainnet: {
    name: "Ethereum Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
    underlyingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3 SwapRouter02
  },
  sepolia: {
    name: "Sepolia Testnet",
    wormhole: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    tokenBridge: "0xDB5492265f6038831E89f495670FF909aDe94bd9",
    underlyingToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC
    swapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // Uniswap V3 Router
  },
  bsc_test: {
    name: "BSC Testnet",
    wormhole: "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D",
    tokenBridge: "0xDB5492265f6038831E89f495670FF909aDe94bd9",
    underlyingToken: "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc", // wormhole wrapped USDT(just a placeholder)
    swapRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", // Uniswap V3 Router
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
  console.log(`🚀 Deploying CustomStrategyWormholeV4 to ${config.name}`);
  console.log("=".repeat(60));
  console.log(`Deploying with account: ${deployer.address}`);
  console.log();

  // Get contract factory for V4
  const CustomStrategyWormholeV4 = await hre.ethers.getContractFactory(
    "CustomStrategyWormholeV4"
  );

  // Solana aggregator address (same for both networks)
  const solanaAggregatorAddressBase58 =
    "2Bqh5uNnKHXQBNLfkK8Je8xvZ6SUis5RH4Ngif4hT3FL"; // SVM side Custom Wormhole relayer program
  const decodedAddress = bs58.decode(solanaAggregatorAddressBase58);
  const solanaAggregatorAddress =
    "0x" + Buffer.from(decodedAddress).toString("hex");

  // Display deployment configuration
  console.log("📋 Deployment Configuration:");
  console.log(`   Network: ${config.name}`);
  console.log(`   Wormhole Address: ${config.wormhole}`);
  console.log(`   Token Bridge Address: ${config.tokenBridge}`);
  console.log(`   Underlying Token (USDC): ${config.underlyingToken}`);
  console.log(`   Swap Router: ${config.swapRouter}`);
  console.log(`   Solana Aggregator Address: ${solanaAggregatorAddress}`);
  console.log();

  console.log("⏳ Deploying proxy contract...");

  // Deploy the upgradeable proxy
  const customStrategyWormholeV4 = await hre.upgrades.deployProxy(
    CustomStrategyWormholeV4,
    [
      config.wormhole,
      config.tokenBridge,
      config.underlyingToken,
      solanaAggregatorAddress,
      config.swapRouter,
    ]
  );

  await customStrategyWormholeV4.waitForDeployment();

  const deployedAddress = await customStrategyWormholeV4.getAddress();

  console.log("✅ Deployment successful!");
  console.log();
  console.log("📍 Contract Details:");
  console.log(`   Contract: CustomStrategyWormholeV4`);
  console.log(`   Network: ${config.name}`);
  console.log(`   Address: ${deployedAddress}`);
  console.log();
  console.log("🔧 Initialization Parameters:");
  console.log(`   Wormhole: ${config.wormhole}`);
  console.log(`   Token Bridge: ${config.tokenBridge}`);
  console.log(`   Underlying Token: ${config.underlyingToken}`);
  console.log(`   Solana Aggregator: ${solanaAggregatorAddress}`);
  console.log(`   Swap Router: ${config.swapRouter}`);
  console.log();
  console.log("=".repeat(60));
  console.log(`🎉 CustomStrategyWormholeV4 deployed to: ${deployedAddress}`);
  console.log("=".repeat(60));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});
