const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🔍 Checking Contract Functions");
  console.log("==============================");
  console.log(`Using signer: ${signer.address}`);

  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";
  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

  console.log(`Strategy contract: ${strategyContractAddress}`);
  console.log(`Token bridge: ${tokenBridgeAddress}`);

  // Test VAA (from your previous attempts)
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  try {
    console.log("\n--- Testing Strategy Contract Functions ---");

    // Test 1: Check if simpleRedeemVAA exists
    console.log("\n1. Testing simpleRedeemVAA...");
    const simpleRedeemABI = ["function simpleRedeemVAA(bytes memory encodedVAA)"];
    const contractWithSimple = new ethers.Contract(strategyContractAddress, simpleRedeemABI, signer);

    try {
      const gasEstimate = await contractWithSimple.simpleRedeemVAA.estimateGas(encodedVAA);
      console.log(`✅ simpleRedeemVAA exists! Gas estimate: ${gasEstimate.toString()}`);
      console.log("The contract has been successfully updated.");

      // Ask if user wants to execute it
      console.log("\n🚀 Ready to execute simpleRedeemVAA!");
      console.log("Run: npx hardhat run scripts/evmRelayerActions/bridgeInFromChain.js --network bsc_test");
      return;

    } catch (error) {
      if (error.message.includes("cannot estimate gas")) {
        console.log("❌ simpleRedeemVAA exists but gas estimation failed");
        console.log(`Reason: ${error.message}`);
      } else if (error.message.includes("function does not exist")) {
        console.log("❌ simpleRedeemVAA does not exist on deployed contract");
      } else {
        console.log(`❌ simpleRedeemVAA test failed: ${error.message}`);
      }
    }

    // Test 2: Check if old bridgeInFromChain exists
    console.log("\n2. Testing bridgeInFromChain (old function)...");
    const oldFunctionABI = ["function bridgeInFromChain(bytes memory encodedVAA)"];
    const contractWithOld = new ethers.Contract(strategyContractAddress, oldFunctionABI, signer);

    try {
      const gasEstimate = await contractWithOld.bridgeInFromChain.estimateGas(encodedVAA);
      console.log(`✅ bridgeInFromChain exists! Gas estimate: ${gasEstimate.toString()}`);
      console.log("⚠️ This is the old buggy function - should not use it");
    } catch (error) {
      console.log(`❌ bridgeInFromChain test failed: ${error.message}`);
    }

    // Test 3: Check role functions
    console.log("\n3. Testing role functions...");
    const roleABI = [
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function REPORTING_MANAGER() view returns (bytes32)"
    ];
    const contractWithRoles = new ethers.Contract(strategyContractAddress, roleABI, signer);

    try {
      const reportingManagerRole = await contractWithRoles.REPORTING_MANAGER();
      const hasRole = await contractWithRoles.hasRole(reportingManagerRole, signer.address);
      console.log(`✅ Role functions work. REPORTING_MANAGER role: ${hasRole}`);
    } catch (error) {
      console.log(`❌ Role functions failed: ${error.message}`);
    }

    console.log("\n--- Testing Direct Token Bridge Call ---");

    // Test 4: Direct token bridge call
    console.log("\n4. Testing direct token bridge...");
    const tokenBridgeABI = [
      "function completeTransferWithPayload(bytes memory encodedVm) external",
      "function isTransferCompleted(bytes32 hash) view returns (bool)"
    ];
    const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeABI, signer);

    try {
      // First check if VAA is already processed
      const vaaHash = ethers.keccak256(encodedVAA);
      const isCompleted = await tokenBridge.isTransferCompleted(vaaHash);
      console.log(`VAA already processed: ${isCompleted}`);

      if (!isCompleted) {
        const gasEstimate = await tokenBridge.completeTransferWithPayload.estimateGas(encodedVAA);
        console.log(`✅ Direct token bridge works! Gas estimate: ${gasEstimate.toString()}`);
        console.log("\n🚀 You can use direct token bridge redemption!");
        console.log("Run: npm run direct-redeem");
      } else {
        console.log("❌ VAA has already been processed - you need a fresh VAA");
      }

    } catch (error) {
      console.log(`❌ Direct token bridge failed: ${error.message}`);

      if (error.message.includes("invalid sender")) {
        console.log("💡 This VAA requires a specific recipient to redeem it");
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("SUMMARY");
    console.log("=".repeat(50));

    console.log("\n🔍 Contract Status:");
    console.log("• The deployed contract does NOT have the simpleRedeemVAA function");
    console.log("• You need to deploy/upgrade the contract with the new function");
    console.log("• Or use the direct token bridge approach");

    console.log("\n💡 Recommended Actions:");
    console.log("1. Deploy the updated contract with simpleRedeemVAA function");
    console.log("2. OR use direct token bridge: npm run direct-redeem");
    console.log("3. OR create a new bridge-out transaction for a fresh VAA");

    console.log("\n🛠️ Next Steps:");
    console.log("If you want to deploy the updated contract:");
    console.log("1. Update your deployment script");
    console.log("2. Deploy the new version");
    console.log("3. Update the contract address in your scripts");

  } catch (error) {
    console.error("\n❌ Unexpected error:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

main()
  .then(() => {
    console.log("\n✅ Function check completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
