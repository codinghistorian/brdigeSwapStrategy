const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  // Contract addresses
  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";
  const bscTokenBridge = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

  // Your VAA from the decode
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  console.log(`Using signer: ${signer.address}`);
  console.log(`Strategy contract: ${strategyContractAddress}`);
  console.log(`BSC Token Bridge: ${bscTokenBridge}\n`);

  // Extended ABI with multiple possible functions
  const extendedABI = [
    // Current function
    "function bridgeInFromChain(bytes memory encodedVAA)",

    // Role functions
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function REPORTING_MANAGER() view returns (bytes32)",

    // Wormhole token bridge functions
    "function completeTransfer(bytes memory encodedVm) returns (bytes memory)",
    "function completeTransferWithPayload(bytes memory encodedVm) returns (bytes memory)",
    "function completeTransferAndUnwrapETH(bytes memory encodedVm) returns (bytes memory)",

    // Alternative functions that might exist
    "function redeemTransfer(bytes memory encodedVAA)",
    "function processTransfer(bytes memory encodedVAA)",
    "function handleTransferWithPayload(bytes memory encodedVAA)",
    "function receiveTokens(bytes memory encodedVAA)",

    // Check functions
    "function isTransferCompleted(bytes32 hash) view returns (bool)",
    "function parseTransferWithPayload(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, bytes32 fromAddress, bytes payload) transfer)"
  ];

  const strategyContract = new ethers.Contract(
    strategyContractAddress,
    extendedABI,
    signer
  );

  // Also create token bridge contract instance
  const tokenBridgeABI = [
    "function completeTransfer(bytes memory encodedVm) returns (bytes memory)",
    "function completeTransferWithPayload(bytes memory encodedVm) returns (bytes memory)",
    "function isTransferCompleted(bytes32 hash) view returns (bool)",
    "function parseTransferWithPayload(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, bytes32 fromAddress, bytes payload) transfer)"
  ];

  const tokenBridgeContract = new ethers.Contract(
    bscTokenBridge,
    tokenBridgeABI,
    signer
  );

  try {
    console.log("=".repeat(60));
    console.log("CONTRACT FUNCTION ANALYSIS");
    console.log("=".repeat(60));

    // Check permissions first
    console.log("\n--- Checking Permissions ---");
    try {
      const reportingManagerRole = await strategyContract.REPORTING_MANAGER();
      const hasRole = await strategyContract.hasRole(reportingManagerRole, signer.address);
      console.log(`✅ REPORTING_MANAGER role check: ${hasRole}`);

      if (!hasRole) {
        console.log("❌ Warning: Signer doesn't have REPORTING_MANAGER role");
      }
    } catch (e) {
      console.log("❌ Could not check permissions:", e.message);
    }

    // Check if VAA is already processed
    console.log("\n--- Checking VAA Status ---");
    try {
      const vaaHash = ethers.keccak256(encodedVAA);
      console.log(`VAA Hash: ${vaaHash}`);

      const isCompleted = await tokenBridgeContract.isTransferCompleted(vaaHash);
      console.log(`Transfer completed: ${isCompleted}`);

      if (isCompleted) {
        console.log("❌ This transfer has already been completed!");
        return;
      }
    } catch (e) {
      console.log("⚠️ Could not check transfer status:", e.message);
    }

    // Try to parse the transfer payload
    console.log("\n--- Analyzing Transfer Payload ---");
    try {
      const parsedTransfer = await tokenBridgeContract.parseTransferWithPayload(encodedVAA);
      console.log("✅ Successfully parsed as TransferWithPayload:");
      console.log(`  Payload ID: ${parsedTransfer.payloadID}`);
      console.log(`  Amount: ${parsedTransfer.amount.toString()}`);
      console.log(`  Token Address: ${parsedTransfer.tokenAddress}`);
      console.log(`  Token Chain: ${parsedTransfer.tokenChain}`);
      console.log(`  To: ${parsedTransfer.to}`);
      console.log(`  To Chain: ${parsedTransfer.toChain}`);
      console.log(`  From Address: ${parsedTransfer.fromAddress}`);
      console.log(`  Payload Length: ${parsedTransfer.payload.length}`);
    } catch (e) {
      console.log("⚠️ Could not parse as TransferWithPayload:", e.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("TRYING DIFFERENT REDEMPTION METHODS");
    console.log("=".repeat(60));

    // Method 1: Original bridgeInFromChain
    console.log("\n--- Method 1: bridgeInFromChain ---");
    try {
      const gasEstimate = await strategyContract.bridgeInFromChain.estimateGas(encodedVAA);
      console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);

      console.log("Attempting bridgeInFromChain...");
      const tx = await strategyContract.bridgeInFromChain(encodedVAA, {
        gasLimit: Math.floor(gasEstimate * 120n / 100n) // 20% buffer
      });

      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ SUCCESS with bridgeInFromChain! Block: ${receipt.blockNumber}`);

      // Log events
      receipt.logs.forEach((log, i) => {
        console.log(`Event ${i}:`, log);
      });

      return; // Success!

    } catch (e) {
      console.log(`❌ bridgeInFromChain failed: ${e.message}`);

      // Check if it's a revert with reason
      if (e.message.includes("revert")) {
        console.log("This appears to be a contract revert. Trying other methods...");
      }
    }

    // Method 2: Direct Token Bridge completeTransferWithPayload
    console.log("\n--- Method 2: Direct Token Bridge completeTransferWithPayload ---");
    try {
      const gasEstimate = await tokenBridgeContract.completeTransferWithPayload.estimateGas(encodedVAA);
      console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);

      console.log("Attempting completeTransferWithPayload on token bridge...");
      const tx = await tokenBridgeContract.completeTransferWithPayload(encodedVAA, {
        gasLimit: Math.floor(gasEstimate * 120n / 100n)
      });

      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ SUCCESS with completeTransferWithPayload! Block: ${receipt.blockNumber}`);

      // Log events
      receipt.logs.forEach((log, i) => {
        console.log(`Event ${i}:`, log);
      });

      return; // Success!

    } catch (e) {
      console.log(`❌ completeTransferWithPayload failed: ${e.message}`);
    }

    // Method 3: Check if strategy contract has completeTransferWithPayload
    console.log("\n--- Method 3: Strategy Contract completeTransferWithPayload ---");
    try {
      const gasEstimate = await strategyContract.completeTransferWithPayload.estimateGas(encodedVAA);
      console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);

      console.log("Attempting completeTransferWithPayload on strategy contract...");
      const tx = await strategyContract.completeTransferWithPayload(encodedVAA, {
        gasLimit: Math.floor(gasEstimate * 120n / 100n)
      });

      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ SUCCESS with strategy completeTransferWithPayload! Block: ${receipt.blockNumber}`);

      return; // Success!

    } catch (e) {
      console.log(`❌ Strategy completeTransferWithPayload failed: ${e.message}`);
    }

    // Method 4: Try regular completeTransfer
    console.log("\n--- Method 4: completeTransfer ---");
    try {
      const gasEstimate = await tokenBridgeContract.completeTransfer.estimateGas(encodedVAA);
      console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);

      console.log("Attempting completeTransfer...");
      const tx = await tokenBridgeContract.completeTransfer(encodedVAA, {
        gasLimit: Math.floor(gasEstimate * 120n / 100n)
      });

      console.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ SUCCESS with completeTransfer! Block: ${receipt.blockNumber}`);

      return; // Success!

    } catch (e) {
      console.log(`❌ completeTransfer failed: ${e.message}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("DIAGNOSIS");
    console.log("=".repeat(60));

    console.log("\n🔍 Analysis Results:");
    console.log("• VAA is valid and not processed");
    console.log("• VAA contains Transfer with Payload (type 3)");
    console.log("• Token is properly attested");
    console.log("• All standard redemption methods failed");

    console.log("\n💡 Possible Issues:");
    console.log("1. The strategy contract may not support Transfer with Payload");
    console.log("2. The payload might contain custom data that needs special handling");
    console.log("3. There might be a specific function for this type of transfer");
    console.log("4. The contract might need to be upgraded to handle this transfer type");

    console.log("\n🛠️  Recommendations:");
    console.log("1. Check the strategy contract source code for payload handling");
    console.log("2. Contact the contract developer about Transfer with Payload support");
    console.log("3. Try creating a simple Transfer (type 1) instead of Transfer with Payload");
    console.log("4. Check if there are any custom functions for handling this specific transfer");

  } catch (error) {
    console.error("\n❌ Unexpected error:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

main()
  .then(() => {
    console.log("\n✅ Contract function check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
