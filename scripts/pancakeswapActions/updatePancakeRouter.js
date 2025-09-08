const { ethers } = require("hardhat");
require("dotenv").config();

// Contract configuration
const CONTRACT_ADDRESS = "0x4F3862D359D8f76498f69732740E4d53b7676639"; // BridgeSwapStrategy
const OLD_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14"; // Current router
const NEW_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"; // PancakeSwap Smart Router

// Role constants
const ADMIN = ethers.keccak256(ethers.toUtf8Bytes("ADMIN"));

// Contract ABI
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "address", name: "_newRouter", type: "address" }],
    name: "setPancakeRouter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "pancakeSmartRouter",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "role", type: "bytes32" },
      { internalType: "address", name: "account", type: "address" }
    ],
    name: "hasRole",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  // Custom errors
  {
    inputs: [{ internalType: "address", name: "router", type: "address" }],
    name: "InvalidRouter",
    type: "error"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "role", type: "bytes32" },
      { internalType: "address", name: "account", type: "address" }
    ],
    name: "AccessControlUnauthorizedAccount",
    type: "error"
  }
];

// Error decoding helper
function decodeError(error, contractInterface) {
  if (!error.data) return null;

  try {
    const decoded = contractInterface.parseError(error.data);
    return {
      name: decoded.name,
      args: decoded.args,
      decoded: true,
    };
  } catch (e) {
    return {
      name: "Unknown",
      data: error.data,
      decoded: false,
    };
  }
}

// Format readable error message
function formatErrorMessage(error, contractInterface) {
  const decoded = decodeError(error, contractInterface);

  if (!decoded || !decoded.decoded) {
    return error.message;
  }

  switch (decoded.name) {
    case "InvalidRouter":
      return `Invalid router address: ${decoded.args[0]}`;
    case "AccessControlUnauthorizedAccount":
      return `Access control error: Account ${decoded.args[1]} does not have role ${decoded.args[0]}`;
    default:
      return `Custom error ${decoded.name}: ${JSON.stringify(decoded.args)}`;
  }
}

async function main() {
  console.log("=== PancakeSwap Router Update ===\n");

  // Setup signer
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);

  // Create contract instance
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const contractInterface = new ethers.Interface(CONTRACT_ABI);

  console.log("--- Pre-flight Checks ---");

  // 1. Verify contract exists
  const contractCode = await ethers.provider.getCode(CONTRACT_ADDRESS);
  if (contractCode === "0x") {
    throw new Error(`Contract not found at address ${CONTRACT_ADDRESS}`);
  }
  console.log(`✅ Contract exists at ${CONTRACT_ADDRESS}`);

  // 2. Check if signer has ADMIN role
  try {
    const hasAdminRole = await contract.hasRole(ADMIN, signer.address);
    console.log(`✅ Signer has ADMIN role: ${hasAdminRole}`);

    if (!hasAdminRole) {
      console.log("\n❌ Signer does not have ADMIN role. Cannot proceed with update.");
      console.log("Please ensure the signer account has been granted the ADMIN role.");
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Could not verify ADMIN role: ${error.message}`);
    throw error;
  }

  // 3. Verify current router configuration
  try {
    const currentRouter = await contract.pancakeSmartRouter();
    console.log(`✅ Current router: ${currentRouter}`);

    if (currentRouter.toLowerCase() !== OLD_ROUTER.toLowerCase()) {
      console.log(`\n⚠️ Warning: Current router (${currentRouter}) does not match expected old router (${OLD_ROUTER})`);
      console.log("This may indicate the contract has already been updated or has a different configuration.");
      console.log("Proceeding anyway...");
    }
  } catch (error) {
    console.log(`❌ Could not read current router: ${error.message}`);
    throw error;
  }

  // 4. Validate new router address exists
  const newRouterCode = await ethers.provider.getCode(NEW_ROUTER);
  if (newRouterCode === "0x") {
    throw new Error(`New router contract not found at address ${NEW_ROUTER}`);
  }
  console.log(`✅ New router exists: ${NEW_ROUTER}`);

  console.log("\n--- Router Update ---");
  console.log(`Updating router from ${OLD_ROUTER} to`);
  console.log(`${NEW_ROUTER}`);

  try {
    // Estimate gas for the transaction
    console.log("\n--- Gas Estimation ---");
    try {
      const gasEstimate = await contract.setPancakeRouter.estimateGas(NEW_ROUTER);
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (gasError) {
      console.log(`❌ Gas estimation failed: ${gasError.message}`);

      const readableError = formatErrorMessage(gasError, contractInterface);
      console.log(`Detailed error: ${readableError}`);

      // If gas estimation fails, we might still try the transaction
      console.log("Attempting transaction despite gas estimation failure...");
    }

    // Get current nonce
    const currentNonce = await signer.getNonce();
    console.log(`Current nonce: ${currentNonce}`);

    // Execute the router update
    console.log("\n--- Executing Router Update ---");

    const tx = await contract.setPancakeRouter(NEW_ROUTER, {
      gasLimit: 100000, // Conservative gas limit for admin function
      nonce: currentNonce,
    });

    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Router update completed (Block: ${receipt.blockNumber})`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

  } catch (error) {
    console.error("\n❌ Router update failed:", error.message);

    // Try to decode contract-specific errors
    if (error.data) {
      try {
        const readableError = formatErrorMessage(error, contractInterface);
        console.error("Contract error:", readableError);
      } catch (decodeError) {
        console.error("Raw error data:", error.data);
      }
    }

    // Handle common issues
    if (error.message.includes("nonce too low") || error.message.includes("nonce")) {
      console.log("\n--- Nonce Error Detected ---");
      console.log("This usually happens when:");
      console.log("1. Previous transactions are still pending");
      console.log("2. Multiple scripts are running simultaneously");
      console.log("3. Network congestion causing nonce desynchronization");
      console.log("\nTry running the script again in a few seconds.");
    }

    if (error.message.includes("insufficient funds")) {
      console.log("\n--- Insufficient Funds ---");
      console.log("The signer account does not have enough BNB to pay for gas.");
      console.log("Please ensure the account has sufficient funds and try again.");
    }

    throw error;
  }

  // Verification
  console.log("\n--- Verification ---");

  try {
    const updatedRouter = await contract.pancakeSmartRouter();
    console.log(`✅ New router address verified: ${updatedRouter}`);

    if (updatedRouter.toLowerCase() === NEW_ROUTER.toLowerCase()) {
      console.log("✅ Router update successful!");
      console.log("==========================================");
      console.log("BridgeSwapStrategy is now configured with the PancakeSwap Smart Router.");
      console.log("Swap functions should now execute without router-related errors.");
    } else {
      console.log(`❌ Verification failed: Expected ${NEW_ROUTER}, got ${updatedRouter}`);
      throw new Error("Router update verification failed");
    }
  } catch (error) {
    console.log(`❌ Could not verify router update: ${error.message}`);
    throw error;
  }
}

main().catch((error) => {
  console.error("\nAn unexpected error occurred:", error);
  console.log("\nTroubleshooting Tips:");
  console.log("1. Ensure you have the correct contract address");
  console.log("2. Verify the signer has ADMIN role on the contract");
  console.log("3. Check that the signer account has sufficient BNB for gas");
  console.log("4. Make sure you're connected to the correct network (BSC Mainnet)");
  console.log("5. Verify the new router address is correct");

  process.exit(1);
});
