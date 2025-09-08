const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🚀 Direct Token Bridge Redemption");
  console.log("==================================");
  console.log(`Using signer: ${signer.address}`);

  // BSC Testnet Token Bridge
  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

  // Strategy contract (recipient in the VAA)
  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";

  // The VAA with Transfer with Payload (type 3)
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const encodedVAA = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  // Token Bridge ABI
  const tokenBridgeABI = [
    "function completeTransferWithPayload(bytes memory encodedVm) external returns (bytes memory)",
    "function isTransferCompleted(bytes32 hash) view returns (bool)",
    "function wrappedAsset(uint16 tokenChainId, bytes32 tokenAddress) view returns (address)"
  ];

  // ERC20 ABI for balance checking
  const erc20ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ];

  try {
    console.log("\n--- Pre-flight Checks ---");

    // Create token bridge contract instance
    const tokenBridge = new ethers.Contract(
      tokenBridgeAddress,
      tokenBridgeABI,
      signer
    );

    // Check if VAA is already processed
    const vaaHash = ethers.keccak256(encodedVAA);
    console.log(`VAA Hash: ${vaaHash}`);

    const isCompleted = await tokenBridge.isTransferCompleted(vaaHash);
    console.log(`Transfer already completed: ${isCompleted}`);

    if (isCompleted) {
      console.log("❌ This VAA has already been processed!");
      console.log("You need a fresh VAA from a new bridge-out transaction.");
      return;
    }

    // Get wrapped token address
    const sourceTokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const sepoliaChainId = 10002;
    const tokenAddressBytes32 = ethers.zeroPadValue(sourceTokenAddress.toLowerCase(), 32);

    const wrappedTokenAddress = await tokenBridge.wrappedAsset(sepoliaChainId, tokenAddressBytes32);
    console.log(`Source token (Sepolia): ${sourceTokenAddress}`);
    console.log(`Wrapped token (BSC): ${wrappedTokenAddress}`);

    if (wrappedTokenAddress === ethers.ZeroAddress) {
      console.log("❌ Token is not attested! Run attestation first.");
      return;
    }

    // Create wrapped token contract instance
    const wrappedToken = new ethers.Contract(wrappedTokenAddress, erc20ABI, signer);
    const [symbol, decimals] = await Promise.all([
      wrappedToken.symbol(),
      wrappedToken.decimals()
    ]);

    console.log(`Token symbol: ${symbol}`);
    console.log(`Token decimals: ${decimals}`);

    // Check balances before
    console.log("\n--- Before Redemption ---");
    const strategyBalanceBefore = await wrappedToken.balanceOf(strategyContractAddress);
    const signerBalanceBefore = await wrappedToken.balanceOf(signer.address);

    console.log(`Strategy contract balance: ${ethers.formatUnits(strategyBalanceBefore, decimals)} ${symbol}`);
    console.log(`Signer balance: ${ethers.formatUnits(signerBalanceBefore, decimals)} ${symbol}`);

    // Check signer BNB balance for gas
    const bnbBalance = await signer.provider.getBalance(signer.address);
    console.log(`Signer BNB balance: ${ethers.formatEther(bnbBalance)} BNB`);

    if (bnbBalance < ethers.parseEther("0.01")) {
      console.log("⚠️ Warning: Low BNB balance for gas fees");
    }

    console.log("\n--- Executing Redemption ---");
    console.log("Calling completeTransferWithPayload directly on token bridge...");

    // Estimate gas
    const gasEstimate = await tokenBridge.completeTransferWithPayload.estimateGas(encodedVAA);
    console.log(`Estimated gas: ${gasEstimate.toString()}`);

    // Execute transaction with 20% gas buffer
    const tx = await tokenBridge.completeTransferWithPayload(encodedVAA, {
      gasLimit: Math.floor(gasEstimate * 120n / 100n)
    });

    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed! Block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Check balances after
    console.log("\n--- After Redemption ---");
    const strategyBalanceAfter = await wrappedToken.balanceOf(strategyContractAddress);
    const signerBalanceAfter = await wrappedToken.balanceOf(signer.address);

    const strategyIncrease = strategyBalanceAfter - strategyBalanceBefore;
    const signerIncrease = signerBalanceAfter - signerBalanceBefore;

    console.log(`Strategy contract balance: ${ethers.formatUnits(strategyBalanceAfter, decimals)} ${symbol}`);
    console.log(`Strategy balance increase: ${ethers.formatUnits(strategyIncrease, decimals)} ${symbol}`);
    console.log(`Signer balance: ${ethers.formatUnits(signerBalanceAfter, decimals)} ${symbol}`);
    console.log(`Signer balance increase: ${ethers.formatUnits(signerIncrease, decimals)} ${symbol}`);

    // Analyze transaction logs
    console.log("\n--- Transaction Events ---");
    if (receipt.logs && receipt.logs.length > 0) {
      console.log(`Found ${receipt.logs.length} events in transaction:`);

      receipt.logs.forEach((log, i) => {
        console.log(`Event ${i + 1}:`);
        console.log(`  Address: ${log.address}`);
        console.log(`  Topics: ${log.topics.length}`);
        console.log(`  Data length: ${log.data.length}`);
      });
    } else {
      console.log("No events found in transaction logs");
    }

    // Summary
    console.log("\n🎉 SUCCESS!");
    console.log("=" .repeat(50));

    if (strategyIncrease > 0) {
      console.log(`✅ Tokens successfully redeemed to strategy contract!`);
      console.log(`   Amount: ${ethers.formatUnits(strategyIncrease, decimals)} ${symbol}`);
      console.log(`   Contract: ${strategyContractAddress}`);
    } else if (signerIncrease > 0) {
      console.log(`✅ Tokens redeemed to signer address!`);
      console.log(`   Amount: ${ethers.formatUnits(signerIncrease, decimals)} ${symbol}`);
      console.log(`   Address: ${signer.address}`);
    } else {
      console.log("⚠️ No balance changes detected. Tokens may have been sent elsewhere.");
    }

    console.log("\n💡 Next Steps:");
    console.log("1. Verify the token balances are as expected");
    console.log("2. The strategy contract should now have the bridged tokens");
    console.log("3. You can proceed with your normal strategy operations");

  } catch (error) {
    console.error("\n❌ Transaction failed:", error.message);

    // Provide specific error guidance
    if (error.message.includes("invalid sender")) {
      console.error("\n💡 This error means the VAA is not meant to be redeemed by this address.");
      console.error("   The VAA might be intended for the strategy contract to redeem.");
    } else if (error.message.includes("transfer completed")) {
      console.error("\n💡 This VAA has already been processed.");
      console.error("   You need a new VAA from a fresh bridge-out transaction.");
    } else if (error.message.includes("invalid Transfer")) {
      console.error("\n💡 The VAA format might be invalid or corrupted.");
      console.error("   Double-check the VAA was copied correctly from Wormhole Scan.");
    } else if (error.message.includes("insufficient funds")) {
      console.error("\n💡 Insufficient BNB for gas fees. Add more BNB to your wallet.");
    }

    // Show error details for debugging
    if (error.reason) {
      console.error(`Revert reason: ${error.reason}`);
    }
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }

    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("\n✅ Direct redemption completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
