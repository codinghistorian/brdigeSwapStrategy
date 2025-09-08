const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🔬 COMPREHENSIVE CONTRACT DIAGNOSIS");
  console.log("=====================================");
  console.log(`Using signer: ${signer.address}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";
  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

  // Test VAA
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  console.log(`Strategy Contract: ${strategyContractAddress}`);
  console.log(`Token Bridge: ${tokenBridgeAddress}`);
  console.log(`VAA Size: ${encodedVAA.length / 2 - 1} bytes\n`);

  try {
    // ========================================
    // STEP 1: Basic Contract Interaction Test
    // ========================================
    console.log("STEP 1: Basic Contract Interaction");
    console.log("-".repeat(40));

    // Test basic role functions (these should always work)
    const basicABI = [
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function REPORTING_MANAGER() view returns (bytes32)"
    ];

    const basicContract = new ethers.Contract(strategyContractAddress, basicABI, signer);

    try {
      const reportingManagerRole = await basicContract.REPORTING_MANAGER();
      const hasRole = await basicContract.hasRole(reportingManagerRole, signer.address);
      console.log(`✅ Basic functions work`);
      console.log(`   REPORTING_MANAGER role: ${hasRole}`);
      console.log(`   Role hash: ${reportingManagerRole}`);
    } catch (error) {
      console.log(`❌ Basic functions failed: ${error.message}`);
      console.log("   This suggests the contract is not deployed or network issues");
    }

    // ========================================
    // STEP 2: Function Existence Tests
    // ========================================
    console.log("\nSTEP 2: Function Existence Tests");
    console.log("-".repeat(40));

    // Test 2A: simpleRedeemVAA
    console.log("\n2A. Testing simpleRedeemVAA...");
    const simpleABI = ["function simpleRedeemVAA(bytes memory encodedVAA)"];
    const simpleContract = new ethers.Contract(strategyContractAddress, simpleABI, signer);

    try {
      const gasEstimate = await simpleContract.simpleRedeemVAA.estimateGas(encodedVAA);
      console.log(`✅ simpleRedeemVAA exists and can be called`);
      console.log(`   Gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log(`❌ simpleRedeemVAA failed: ${error.message}`);

      if (error.message.includes("function does not exist") ||
          error.message.includes("no matching function") ||
          error.code === "CALL_EXCEPTION") {
        console.log(`   → Function likely does NOT exist on deployed contract`);
      } else if (error.message.includes("cannot estimate gas")) {
        console.log(`   → Function exists but execution would fail`);
        console.log(`   → Reason: ${error.reason || "Unknown"}`);
      }
    }

    // Test 2B: Original bridgeInFromChain
    console.log("\n2B. Testing original bridgeInFromChain...");
    const originalABI = ["function bridgeInFromChain(bytes memory encodedVAA)"];
    const originalContract = new ethers.Contract(strategyContractAddress, originalABI, signer);

    try {
      const gasEstimate = await originalContract.bridgeInFromChain.estimateGas(encodedVAA);
      console.log(`✅ bridgeInFromChain exists`);
      console.log(`   Gas estimate: ${gasEstimate.toString()}`);
      console.log(`   ⚠️  This is the BUGGY function - should not use`);
    } catch (error) {
      console.log(`❌ bridgeInFromChain failed: ${error.message}`);

      if (error.message.includes("No wrapper for this token exists")) {
        console.log(`   → This confirms the original parsing bug exists`);
        console.log(`   → Contract was NOT successfully upgraded`);
      }
    }

    // ========================================
    // STEP 3: Contract Code Verification
    // ========================================
    console.log("\nSTEP 3: Contract Code Verification");
    console.log("-".repeat(40));

    try {
      const provider = signer.provider;
      const code = await provider.getCode(strategyContractAddress);
      console.log(`Contract code size: ${code.length} characters`);
      console.log(`Code hash: ${ethers.keccak256(code)}`);

      // Check if it contains the simpleRedeemVAA selector
      const simpleRedeemSelector = ethers.keccak256(ethers.toUtf8Bytes("simpleRedeemVAA(bytes)")).slice(0, 10);
      const hasSimpleRedeem = code.includes(simpleRedeemSelector.slice(2)); // Remove 0x
      console.log(`Contains simpleRedeemVAA selector (${simpleRedeemSelector}): ${hasSimpleRedeem}`);

      if (!hasSimpleRedeem) {
        console.log(`❌ Contract code does NOT contain simpleRedeemVAA function`);
        console.log(`   → Upgrade may have failed or wrong contract was deployed`);
      }
    } catch (error) {
      console.log(`❌ Code verification failed: ${error.message}`);
    }

    // ========================================
    // STEP 4: Proxy Implementation Check
    // ========================================
    console.log("\nSTEP 4: Proxy Implementation Check");
    console.log("-".repeat(40));

    try {
      // Standard EIP-1967 implementation slot
      const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const implementationAddress = await signer.provider.getStorage(strategyContractAddress, IMPLEMENTATION_SLOT);
      const cleanImplementation = "0x" + implementationAddress.slice(-40);

      console.log(`Implementation address: ${cleanImplementation}`);

      // Check implementation contract code
      const implCode = await signer.provider.getCode(cleanImplementation);
      console.log(`Implementation code size: ${implCode.length} characters`);

      const implSimpleSelector = ethers.keccak256(ethers.toUtf8Bytes("simpleRedeemVAA(bytes)")).slice(0, 10);
      const implHasSimple = implCode.includes(implSimpleSelector.slice(2));
      console.log(`Implementation has simpleRedeemVAA: ${implHasSimple}`);

      if (implHasSimple) {
        console.log(`✅ Implementation contract contains the new function`);
        console.log(`   → Issue might be with proxy delegation or ABI mismatch`);
      } else {
        console.log(`❌ Implementation contract does NOT contain simpleRedeemVAA`);
        console.log(`   → Wrong contract was deployed during upgrade`);
      }
    } catch (error) {
      console.log(`❌ Proxy check failed: ${error.message}`);
      console.log(`   → Contract might not be a proxy or different proxy standard`);
    }

    // ========================================
    // STEP 5: Direct Token Bridge Test
    // ========================================
    console.log("\nSTEP 5: Direct Token Bridge Test");
    console.log("-".repeat(40));

    const tokenBridgeABI = [
      "function completeTransferWithPayload(bytes memory encodedVm) external",
      "function isTransferCompleted(bytes32 hash) view returns (bool)"
    ];
    const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeABI, signer);

    try {
      const vaaHash = ethers.keccak256(encodedVAA);
      const isCompleted = await tokenBridge.isTransferCompleted(vaaHash);
      console.log(`VAA already processed: ${isCompleted}`);

      if (!isCompleted) {
        const gasEstimate = await tokenBridge.completeTransferWithPayload.estimateGas(encodedVAA);
        console.log(`✅ Direct token bridge works - Gas: ${gasEstimate.toString()}`);
        console.log(`   → VAA is valid and can be redeemed directly`);
      } else {
        console.log(`❌ VAA has already been processed`);
        console.log(`   → Need a fresh VAA from new bridge-out transaction`);
      }
    } catch (error) {
      console.log(`❌ Direct token bridge failed: ${error.message}`);

      if (error.message.includes("invalid sender")) {
        console.log(`   → VAA recipient doesn't match current caller`);
      } else if (error.message.includes("invalid Transfer")) {
        console.log(`   → VAA format issue or corruption`);
      }
    }

    // ========================================
    // STEP 6: Manual Function Call Test
    // ========================================
    console.log("\nSTEP 6: Manual Function Call Test");
    console.log("-".repeat(40));

    try {
      // Try to call simpleRedeemVAA manually with low-level call
      const functionSelector = ethers.keccak256(ethers.toUtf8Bytes("simpleRedeemVAA(bytes)")).slice(0, 10);
      const encodedCall = functionSelector + ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [encodedVAA]).slice(2);

      console.log(`Function selector: ${functionSelector}`);
      console.log(`Encoded call length: ${encodedCall.length / 2} bytes`);

      const result = await signer.call({
        to: strategyContractAddress,
        data: encodedCall
      });

      console.log(`✅ Manual call succeeded: ${result}`);
    } catch (error) {
      console.log(`❌ Manual call failed: ${error.message}`);

      if (error.message.includes("execution reverted") && !error.reason) {
        console.log(`   → Function doesn't exist (no revert reason)`);
      } else if (error.reason) {
        console.log(`   → Function exists but reverted: ${error.reason}`);
      }
    }

    // ========================================
    // DIAGNOSIS SUMMARY
    // ========================================
    console.log("\n" + "=".repeat(60));
    console.log("DIAGNOSIS SUMMARY");
    console.log("=".repeat(60));

    console.log(`\n🔍 Contract Status:`);
    console.log(`   • Address: ${strategyContractAddress}`);
    console.log(`   • Basic functions work: Check Step 1`);
    console.log(`   • simpleRedeemVAA exists: Check Step 2A`);
    console.log(`   • Code contains function: Check Step 3`);
    console.log(`   • Proxy implementation: Check Step 4`);

    console.log(`\n💡 Likely Issues:`);
    console.log(`   1. If simpleRedeemVAA doesn't exist → Upgrade failed`);
    console.log(`   2. If function exists but fails → VAA already processed`);
    console.log(`   3. If proxy issues → Wrong implementation deployed`);
    console.log(`   4. If direct bridge works → Use direct redemption`);

    console.log(`\n🛠️ Recommended Actions:`);
    console.log(`   • If upgrade failed: Re-run upgrade script`);
    console.log(`   • If VAA processed: Create new bridge-out transaction`);
    console.log(`   • If proxy issues: Check deployment logs`);
    console.log(`   • If all else fails: Use direct token bridge redemption`);

  } catch (error) {
    console.error(`\n❌ Diagnosis failed: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
  }
}

main()
  .then(() => {
    console.log("\n✅ Diagnosis completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
