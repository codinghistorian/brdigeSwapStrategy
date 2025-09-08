const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🚀 Simple VAA Redemption");
  console.log("========================");
  console.log(`Using signer: ${signer.address}`);

  // Contract addresses
  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";

  // Token addresses
  const sourceToken = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // USDC on Sepolia
  const wrappedToken = "0xb8850F591019F0794F813426d4A4A9b5fB8f23C8"; // Wrapped USDC on BSC

  // The VAA that we know is valid
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  // Strategy contract ABI with the new simple functions
  const strategyABI = [
    // New simple functions
    "function simpleRedeemVAA(bytes memory encodedVAA, address expectedToken) external",
    "function ultraSimpleRedeem(bytes memory encodedVAA) external",

    // Role checking
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function REPORTING_MANAGER() view returns (bytes32)",

    // Events
    "event SimpleRedemption(address indexed token, uint256 amount, address indexed recipient, bytes32 indexed vaaHash)",
    "event MultiChainBridgedIn(address indexed token, uint256 amount, uint16 indexed sourceChainId, address indexed manager)"
  ];

  // ERC20 ABI for balance checking
  const erc20ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ];

  try {
    // Create contract instances
    const strategyContract = new ethers.Contract(
      strategyContractAddress,
      strategyABI,
      signer
    );

    const tokenContract = new ethers.Contract(wrappedToken, erc20ABI, signer);

    console.log(`Strategy contract: ${strategyContractAddress}`);
    console.log(`Expected token: ${wrappedToken}`);

    // Check permissions
    console.log("\n--- Checking Permissions ---");
    try {
      const reportingManagerRole = await strategyContract.REPORTING_MANAGER();
      const hasRole = await strategyContract.hasRole(reportingManagerRole, signer.address);
      console.log(`REPORTING_MANAGER role: ${hasRole}`);

      if (!hasRole) {
        console.log("❌ Error: Signer does not have REPORTING_MANAGER role");
        console.log("Make sure you're using the correct account or grant the role first");
        return;
      }
    } catch (roleError) {
      console.log("⚠️ Could not check role (contract might not be upgraded yet)");
      console.log("Proceeding anyway...");
    }

    // Get token details
    console.log("\n--- Token Information ---");
    const [symbol, decimals] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);
    console.log(`Token: ${symbol} (${decimals} decimals)`);
    console.log(`Address: ${wrappedToken}`);

    // Check balances before
    console.log("\n--- Before Redemption ---");
    const balanceBefore = await tokenContract.balanceOf(strategyContractAddress);
    const signerBalance = await tokenContract.balanceOf(signer.address);

    console.log(`Strategy balance: ${ethers.formatUnits(balanceBefore, decimals)} ${symbol}`);
    console.log(`Signer balance: ${ethers.formatUnits(signerBalance, decimals)} ${symbol}`);

    // Check BNB balance for gas
    const bnbBalance = await signer.provider.getBalance(signer.address);
    console.log(`Signer BNB: ${ethers.formatEther(bnbBalance)} BNB`);

    if (bnbBalance < ethers.parseEther("0.01")) {
      console.log("⚠️ Warning: Low BNB balance for gas");
    }

    // Prepare VAA info
    const vaaHash = ethers.keccak256(encodedVAA);
    console.log("\n--- VAA Information ---");
    console.log(`VAA hash: ${vaaHash}`);
    console.log(`VAA size: ${encodedVAA.length / 2 - 1} bytes`);

    console.log("\n--- Method 1: Try simpleRedeemVAA ---");
    try {
      // Try the validation version first
      console.log("Estimating gas for simpleRedeemVAA...");
      const gasEstimate1 = await strategyContract.simpleRedeemVAA.estimateGas(encodedVAA, wrappedToken);
      console.log(`Gas estimate: ${gasEstimate1.toString()}`);

      console.log("Executing simpleRedeemVAA...");
      const tx1 = await strategyContract.simpleRedeemVAA(encodedVAA, wrappedToken, {
        gasLimit: Math.floor(gasEstimate1 * 120n / 100n) // 20% buffer
      });

      console.log(`Transaction sent: ${tx1.hash}`);
      console.log("Waiting for confirmation...");

      const receipt1 = await tx1.wait();
      console.log(`✅ SUCCESS with simpleRedeemVAA!`);
      console.log(`Block: ${receipt1.blockNumber}`);
      console.log(`Gas used: ${receipt1.gasUsed.toString()}`);

      // Check results
      await checkResults(tokenContract, strategyContractAddress, balanceBefore, symbol, decimals, receipt1);
      return; // Success!

    } catch (error1) {
      console.log(`❌ simpleRedeemVAA failed: ${error1.message}`);

      if (error1.message.includes("function does not exist")) {
        console.log("💡 Contract might not be upgraded yet. Trying ultraSimpleRedeem...");
      }
    }

    console.log("\n--- Method 2: Try ultraSimpleRedeem ---");
    try {
      // Try the ultra-simple version
      console.log("Estimating gas for ultraSimpleRedeem...");
      const gasEstimate2 = await strategyContract.ultraSimpleRedeem.estimateGas(encodedVAA);
      console.log(`Gas estimate: ${gasEstimate2.toString()}`);

      console.log("Executing ultraSimpleRedeem...");
      const tx2 = await strategyContract.ultraSimpleRedeem(encodedVAA, {
        gasLimit: Math.floor(gasEstimate2 * 120n / 100n)
      });

      console.log(`Transaction sent: ${tx2.hash}`);
      console.log("Waiting for confirmation...");

      const receipt2 = await tx2.wait();
      console.log(`✅ SUCCESS with ultraSimpleRedeem!`);
      console.log(`Block: ${receipt2.blockNumber}`);
      console.log(`Gas used: ${receipt2.gasUsed.toString()}`);

      // Check results
      await checkResults(tokenContract, strategyContractAddress, balanceBefore, symbol, decimals, receipt2);
      return; // Success!

    } catch (error2) {
      console.log(`❌ ultraSimpleRedeem failed: ${error2.message}`);
    }

    console.log("\n--- Method 3: Direct Token Bridge Call ---");
    console.log("Both contract methods failed. Trying direct token bridge call...");

    // Fall back to direct token bridge call
    const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";
    const tokenBridgeABI = ["function completeTransferWithPayload(bytes memory encodedVm) external"];

    const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeABI, signer);

    console.log("Estimating gas for direct completeTransferWithPayload...");
    const gasEstimate3 = await tokenBridge.completeTransferWithPayload.estimateGas(encodedVAA);
    console.log(`Gas estimate: ${gasEstimate3.toString()}`);

    console.log("Executing direct completeTransferWithPayload...");
    const tx3 = await tokenBridge.completeTransferWithPayload(encodedVAA, {
      gasLimit: Math.floor(gasEstimate3 * 120n / 100n)
    });

    console.log(`Transaction sent: ${tx3.hash}`);
    console.log("Waiting for confirmation...");

    const receipt3 = await tx3.wait();
    console.log(`✅ SUCCESS with direct token bridge call!`);
    console.log(`Block: ${receipt3.blockNumber}`);
    console.log(`Gas used: ${receipt3.gasUsed.toString()}`);

    // Check results
    await checkResults(tokenContract, strategyContractAddress, balanceBefore, symbol, decimals, receipt3);

  } catch (error) {
    console.error("\n❌ All methods failed:", error.message);

    // Provide specific guidance
    if (error.message.includes("function does not exist")) {
      console.error("\n💡 The contract hasn't been upgraded with the new functions yet.");
      console.error("   You need to either:");
      console.error("   1. Deploy the fixed contract version, or");
      console.error("   2. Use the direct token bridge approach");
    } else if (error.message.includes("Unauthorized")) {
      console.error("\n💡 Permission issue. Make sure the signer has REPORTING_MANAGER role.");
    } else if (error.message.includes("transfer completed")) {
      console.error("\n💡 This VAA has already been redeemed.");
    } else if (error.message.includes("invalid Transfer")) {
      console.error("\n💡 VAA format issue or parsing problem.");
    }

    process.exit(1);
  }
}

// Helper function to check results
async function checkResults(tokenContract, strategyAddress, balanceBefore, symbol, decimals, receipt) {
  console.log("\n--- After Redemption ---");

  const balanceAfter = await tokenContract.balanceOf(strategyAddress);
  const increase = balanceAfter - balanceBefore;

  console.log(`Strategy balance: ${ethers.formatUnits(balanceAfter, decimals)} ${symbol}`);
  console.log(`Balance increase: ${ethers.formatUnits(increase, decimals)} ${symbol}`);

  if (increase > 0) {
    console.log("\n🎉 SUCCESS!");
    console.log(`✅ Received ${ethers.formatUnits(increase, decimals)} ${symbol}`);
  } else {
    console.log("\n⚠️ No balance increase detected");
    console.log("Tokens might have been sent to a different address");
  }

  // Show transaction events
  console.log("\n--- Transaction Events ---");
  if (receipt.logs && receipt.logs.length > 0) {
    console.log(`Found ${receipt.logs.length} events`);
    receipt.logs.forEach((log, i) => {
      console.log(`Event ${i + 1}: ${log.address} (${log.topics.length} topics)`);
    });
  } else {
    console.log("No events found");
  }
}

main()
  .then(() => {
    console.log("\n✅ Redemption attempt completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
