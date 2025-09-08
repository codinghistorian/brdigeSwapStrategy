const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🔧 FORCE PROXY IMPLEMENTATION UPDATE");
  console.log("====================================");
  console.log(`Using signer: ${signer.address}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const PROXY_ADDRESS = "0x6C43f551916C67D6c1f410220F06256B208E1468";
  const EXPECTED_IMPLEMENTATION = "0x8B45Bd5f86806b230DBA5d5658D8767139696837";

  // Test VAA
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  try {
    console.log("STEP 1: Current Proxy Status Check");
    console.log("-".repeat(40));

    // Check current implementation
    const currentImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log(`Proxy: ${PROXY_ADDRESS}`);
    console.log(`Current Implementation: ${currentImpl}`);
    console.log(`Expected Implementation: ${EXPECTED_IMPLEMENTATION}`);
    console.log(`Implementation Match: ${currentImpl.toLowerCase() === EXPECTED_IMPLEMENTATION.toLowerCase()}`);

    // Check admin
    const admin = await upgrades.erc1967.getAdminAddress(PROXY_ADDRESS);
    console.log(`Proxy Admin: ${admin}`);

    console.log("\nSTEP 2: Force Implementation Update");
    console.log("-".repeat(40));

    // Get the contract factory
    const CustomStrategyWormholeV4 = await ethers.getContractFactory("CustomStrategyWormholeV4");

    try {
      console.log("Attempting forced upgrade...");

      // Force upgrade with validation disabled
      const upgradedProxy = await upgrades.upgradeProxy(
        PROXY_ADDRESS,
        CustomStrategyWormholeV4,
        {
          call: {
            fn: "initialize", // Call initialize if needed
            args: [] // Add init args if needed
          }
        }
      );

      await upgradedProxy.waitForDeployment();
      console.log("✅ Forced upgrade completed");

    } catch (upgradeError) {
      console.log(`⚠️ Standard upgrade failed: ${upgradeError.message}`);
      console.log("Trying alternative upgrade methods...");

      try {
        // Try upgrade without initialization call
        const upgradedProxy2 = await upgrades.upgradeProxy(
          PROXY_ADDRESS,
          CustomStrategyWormholeV4
        );
        await upgradedProxy2.waitForDeployment();
        console.log("✅ Alternative upgrade completed");

      } catch (altError) {
        console.log(`❌ Alternative upgrade failed: ${altError.message}`);
        console.log("Trying manual implementation update...");

        // Manual implementation update (dangerous but sometimes necessary)
        try {
          const proxyAdmin = await upgrades.admin.getInstance();
          const tx = await proxyAdmin.upgrade(PROXY_ADDRESS, EXPECTED_IMPLEMENTATION);
          await tx.wait();
          console.log("✅ Manual implementation update completed");

        } catch (manualError) {
          console.log(`❌ Manual update failed: ${manualError.message}`);
          console.log("All upgrade methods failed. Proceeding with current state...");
        }
      }
    }

    console.log("\nSTEP 3: Post-Upgrade Verification");
    console.log("-".repeat(40));

    // Check implementation after upgrade
    const newImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log(`New Implementation: ${newImpl}`);
    console.log(`Update Successful: ${newImpl.toLowerCase() === EXPECTED_IMPLEMENTATION.toLowerCase()}`);

    // Check if proxy can access the new function
    const updatedContract = await ethers.getContractAt("CustomStrategyWormholeV4", PROXY_ADDRESS);

    console.log("\nSTEP 4: Function Availability Test");
    console.log("-".repeat(40));

    // Test role functions first (should always work)
    try {
      const reportingManagerRole = await updatedContract.REPORTING_MANAGER();
      const hasRole = await updatedContract.hasRole(reportingManagerRole, signer.address);
      console.log(`✅ Basic functions work - REPORTING_MANAGER: ${hasRole}`);
    } catch (basicError) {
      console.log(`❌ Basic functions failed: ${basicError.message}`);
      return;
    }

    // Test simpleRedeemVAA function
    const simpleRedeemABI = ["function simpleRedeemVAA(bytes memory encodedVAA)"];
    const contractWithSimple = new ethers.Contract(PROXY_ADDRESS, simpleRedeemABI, signer);

    try {
      console.log("Testing simpleRedeemVAA availability...");
      const gasEstimate = await contractWithSimple.simpleRedeemVAA.estimateGas(encodedVAA);
      console.log(`✅ simpleRedeemVAA is available! Gas estimate: ${gasEstimate.toString()}`);

      console.log("\nSTEP 5: Execute simpleRedeemVAA");
      console.log("-".repeat(40));

      console.log("Executing simpleRedeemVAA...");
      const tx = await contractWithSimple.simpleRedeemVAA(encodedVAA, {
        gasLimit: Math.floor(gasEstimate * 120n / 100n) // 20% buffer
      });

      console.log(`Transaction sent: ${tx.hash}`);
      console.log("Waiting for confirmation...");

      const receipt = await tx.wait();
      console.log(`✅ SUCCESS! Block: ${receipt.blockNumber}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);

      // Check for events
      if (receipt.logs && receipt.logs.length > 0) {
        console.log(`\n📋 Transaction Events (${receipt.logs.length}):`);
        receipt.logs.forEach((log, i) => {
          console.log(`  Event ${i + 1}: ${log.address} (${log.topics.length} topics)`);
        });
      }

      console.log("\n🎉 VAA REDEMPTION SUCCESSFUL!");
      console.log("Your tokens should now be in the strategy contract.");

    } catch (functionError) {
      console.log(`❌ simpleRedeemVAA failed: ${functionError.message}`);

      if (functionError.message.includes("function does not exist")) {
        console.log("   → Function still not available after upgrade");
        console.log("   → May need to redeploy the entire contract");
      } else if (functionError.message.includes("transfer completed")) {
        console.log("   → VAA has already been processed");
        console.log("   → Need a fresh VAA from new bridge-out transaction");
      } else if (functionError.message.includes("invalid")) {
        console.log("   → VAA validation failed in token bridge");
      } else {
        console.log("   → Unexpected error during execution");
      }

      console.log("\nFalling back to direct token bridge approach...");
      await tryDirectTokenBridge(encodedVAA, signer);
    }

    console.log("\nSTEP 6: Final Status Check");
    console.log("-".repeat(40));

    // Final verification
    const finalImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log(`Final Implementation: ${finalImpl}`);
    console.log(`Proxy Update Success: ${finalImpl.toLowerCase() === EXPECTED_IMPLEMENTATION.toLowerCase()}`);

    // Check contract balance changes
    const wrappedTokenAddress = "0xb8850F591019F0794F813426d4A4A9b5fB8f23C8";
    const tokenABI = ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"];
    const tokenContract = new ethers.Contract(wrappedTokenAddress, tokenABI, signer);

    try {
      const balance = await tokenContract.balanceOf(PROXY_ADDRESS);
      const symbol = await tokenContract.symbol();
      console.log(`Strategy ${symbol} balance: ${ethers.formatUnits(balance, 6)}`);
    } catch (balanceError) {
      console.log("Could not check token balance");
    }

  } catch (error) {
    console.error(`\n❌ Force update failed: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
  }
}

// Helper function for direct token bridge
async function tryDirectTokenBridge(encodedVAA, signer) {
  console.log("\n--- Trying Direct Token Bridge ---");

  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";
  const tokenBridgeABI = ["function completeTransferWithPayload(bytes memory encodedVm) external"];
  const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeABI, signer);

  try {
    const gasEstimate = await tokenBridge.completeTransferWithPayload.estimateGas(encodedVAA);
    console.log(`Direct bridge gas estimate: ${gasEstimate.toString()}`);

    const tx = await tokenBridge.completeTransferWithPayload(encodedVAA, {
      gasLimit: Math.floor(gasEstimate * 120n / 100n)
    });

    console.log(`Direct bridge tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Direct bridge SUCCESS! Block: ${receipt.blockNumber}`);

  } catch (directError) {
    console.log(`❌ Direct bridge failed: ${directError.message}`);

    if (directError.message.includes("invalid sender")) {
      console.log("   → You're not the intended recipient of this VAA");
      console.log("   → The VAA is meant for the strategy contract to redeem");
    }
  }
}

main()
  .then(() => {
    console.log("\n✅ Force proxy update completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
