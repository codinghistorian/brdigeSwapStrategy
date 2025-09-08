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
    underlyingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    swapRouter: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap V3 SwapRouter02
    pancakeRouter: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap Smart Router
  },
  sepolia: {
    name: "Sepolia Testnet",
    wormhole: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
    tokenBridge: "0xDB5492265f6038831E89f495670FF909aDe94bd9",
    underlyingToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC
    swapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // Uniswap V3 Router
    pancakeRouter: "", // No PancakeSwap on Sepolia
  },
  bsc_main: {
    name: "BSC Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
    tokenBridge: "0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7",
    underlyingToken: "0x55d398326f99059fF775485246999027B3197955", // USDT on BSC
    swapRouter: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2", // Uniswap V3 SwapRouter02
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
  console.log(`🚀 Deploying BridgeSwapStrategy to ${config.name}`);
  console.log("=".repeat(60));
  console.log(`Deploying with account: ${deployer.address}`);
  console.log();

  // Get contract factory for BridgeSwapStrategy
  const BridgeSwapStrategy = await hre.ethers.getContractFactory(
    "BridgeSwapStrategy"
  );

  // Solana aggregator address (same for all networks)
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
  console.log(`   Underlying Token: ${config.underlyingToken}`);
  console.log(`   Uniswap V3 Router: ${config.swapRouter}`);
  console.log(`   PancakeSwap Router: ${config.pancakeRouter}`);
  console.log(`   Solana Aggregator Address: ${solanaAggregatorAddress}`);
  console.log();

  console.log("⏳ Deploying proxy contract...");

  // Get current nonce from network to avoid nonce issues
  console.log("--- Fetching Current Nonce ---");
  const currentNonce = await deployer.getNonce();
  console.log(`Current nonce: ${currentNonce}`);

  // Deploy the upgradeable proxy
  const bridgeSwapStrategy = await hre.upgrades.deployProxy(
    BridgeSwapStrategy,
    [
      config.wormhole,
      config.tokenBridge,
      config.underlyingToken,
      solanaAggregatorAddress,
      config.swapRouter,
      config.pancakeRouter,
    ],
    {
      initializer: "initialize",
      kind: "transparent",
    }
  );

  await bridgeSwapStrategy.waitForDeployment();

  const deployedAddress = await bridgeSwapStrategy.getAddress();

  console.log("✅ Deployment successful!");
  console.log();
  console.log("📍 Contract Details:");
  console.log(`   Contract: BridgeSwapStrategy`);
  console.log(`   Network: ${config.name}`);
  console.log(`   Address: ${deployedAddress}`);
  console.log();
  console.log("🔧 Initialization Parameters:");
  console.log(`   Wormhole: ${config.wormhole}`);
  console.log(`   Token Bridge: ${config.tokenBridge}`);
  console.log(`   Underlying Token: ${config.underlyingToken}`);
  console.log(`   Solana Aggregator: ${solanaAggregatorAddress}`);
  console.log(`   Uniswap V3 Router: ${config.swapRouter}`);
  console.log(`   PancakeSwap Router: ${config.pancakeRouter}`);
  console.log();
  console.log("=".repeat(60));
  console.log(`🎉 BridgeSwapStrategy deployed to: ${deployedAddress}`);
  console.log("=".repeat(60));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Deployment failed:");
  console.error(error.message);

  // Handle nonce-related errors specifically
  if (
    error.message.includes("nonce too low") ||
    error.message.includes("nonce")
  ) {
    console.log("\n--- Nonce Error Detected ---");
    console.log("This usually happens when:");
    console.log("1. Previous transactions are still pending");
    console.log("2. Multiple scripts are running simultaneously");
    console.log("3. Network congestion causing nonce desynchronization");
    console.log("\nTry running the deployment script again in a few seconds.");
    console.log(
      "If the issue persists, check for pending transactions in your wallet."
    );
  }

  process.exitCode = 1;
});
