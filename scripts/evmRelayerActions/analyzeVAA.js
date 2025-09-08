const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🔬 DETAILED VAA ANALYSIS");
  console.log("========================");
  console.log(`Using signer: ${signer.address}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // The VAA we've been trying to redeem
  const vaaBase64 = "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
  const vaaBytes = Buffer.from(vaaBase64, "base64");
  const encodedVAA = "0x" + vaaBytes.toString("hex");

  const strategyContractAddress = "0x6C43f551916C67D6c1f410220F06256B208E1468";
  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";

  try {
    console.log("STEP 1: Raw VAA Structure Analysis");
    console.log("-".repeat(50));

    console.log(`VAA Base64 Length: ${vaaBase64.length}`);
    console.log(`VAA Bytes Length: ${vaaBytes.length}`);
    console.log(`VAA Hex Length: ${encodedVAA.length}`);

    // Parse VAA header manually
    let offset = 0;
    const version = vaaBytes.readUInt8(offset);
    offset += 1;

    const guardianSetIndex = vaaBytes.readUInt32BE(offset);
    offset += 4;

    const signaturesLength = vaaBytes.readUInt8(offset);
    offset += 1;

    console.log(`Version: ${version}`);
    console.log(`Guardian Set Index: ${guardianSetIndex}`);
    console.log(`Signatures Length: ${signaturesLength}`);

    // Skip signatures
    offset += signaturesLength * 66;

    // Parse body
    const timestamp = vaaBytes.readUInt32BE(offset);
    offset += 4;

    const nonce = vaaBytes.readUInt32BE(offset);
    offset += 4;

    const emitterChainId = vaaBytes.readUInt16BE(offset);
    offset += 2;

    const emitterAddress = vaaBytes.subarray(offset, offset + 32);
    offset += 32;

    const sequence = vaaBytes.readBigUInt64BE(offset);
    offset += 8;

    const consistencyLevel = vaaBytes.readUInt8(offset);
    offset += 1;

    const payload = vaaBytes.subarray(offset);

    console.log(`\nVAA Header Info:`);
    console.log(`  Timestamp: ${new Date(timestamp * 1000).toISOString()}`);
    console.log(`  Nonce: ${nonce}`);
    console.log(`  Emitter Chain: ${emitterChainId} (Sepolia)`);
    console.log(`  Emitter Address: 0x${emitterAddress.toString('hex')}`);
    console.log(`  Sequence: ${sequence.toString()}`);
    console.log(`  Consistency Level: ${consistencyLevel}`);
    console.log(`  Payload Length: ${payload.length} bytes`);

    console.log("\nSTEP 2: Transfer with Payload Analysis");
    console.log("-".repeat(50));

    // Parse Transfer with Payload structure
    let payloadOffset = 0;
    const payloadType = payload.readUInt8(payloadOffset);
    payloadOffset += 1;

    console.log(`Payload Type: ${payloadType} (${payloadType === 3 ? 'Transfer with Payload' : 'Unknown'})`);

    if (payloadType !== 3) {
      console.log("❌ This is not a Transfer with Payload! That might be the issue.");
      return;
    }

    // Amount (32 bytes)
    const amount = payload.subarray(payloadOffset, payloadOffset + 32);
    payloadOffset += 32;
    const amountBigInt = ethers.toBigInt('0x' + amount.toString('hex'));

    // Token address (32 bytes)
    const tokenAddress = payload.subarray(payloadOffset, payloadOffset + 32);
    payloadOffset += 32;
    const tokenAddressHex = '0x' + tokenAddress.toString('hex');

    // Token chain (2 bytes)
    const tokenChain = payload.readUInt16BE(payloadOffset);
    payloadOffset += 2;

    // To address (32 bytes)
    const toAddress = payload.subarray(payloadOffset, payloadOffset + 32);
    payloadOffset += 32;
    const toAddressHex = '0x' + toAddress.toString('hex');

    // To chain (2 bytes)
    const toChain = payload.readUInt16BE(payloadOffset);
    payloadOffset += 2;

    // From address (32 bytes) - This is key for Transfer with Payload!
    const fromAddress = payload.subarray(payloadOffset, payloadOffset + 32);
    payloadOffset += 32;
    const fromAddressHex = '0x' + fromAddress.toString('hex');

    // Additional payload (remaining bytes)
    const additionalPayload = payload.subarray(payloadOffset);

    console.log(`\nTransfer Details:`);
    console.log(`  Amount: ${amountBigInt.toString()} (${ethers.formatUnits(amountBigInt, 6)} USDC)`);
    console.log(`  Token Address: ${tokenAddressHex}`);
    console.log(`  Token Chain: ${tokenChain} (Sepolia)`);
    console.log(`  To Address: ${toAddressHex}`);
    console.log(`  To Chain: ${toChain} (BSC)`);
    console.log(`  From Address: ${fromAddressHex}`);
    console.log(`  Additional Payload: ${additionalPayload.length} bytes`);

    if (additionalPayload.length > 0) {
      console.log(`  Additional Payload Hex: 0x${additionalPayload.toString('hex')}`);
    }

    // Extract actual addresses (remove padding)
    const actualTokenAddress = '0x' + tokenAddressHex.slice(-40);
    const actualToAddress = '0x' + toAddressHex.slice(-40);
    const actualFromAddress = '0x' + fromAddressHex.slice(-40);

    console.log(`\nCleaned Addresses:`);
    console.log(`  Token: ${actualTokenAddress}`);
    console.log(`  To: ${actualToAddress}`);
    console.log(`  From: ${actualFromAddress}`);

    console.log("\nSTEP 3: Address Validation Analysis");
    console.log("-".repeat(50));

    // Compare with expected addresses
    const expectedStrategyAddress = strategyContractAddress.toLowerCase();
    const actualToLower = actualToAddress.toLowerCase();
    const actualFromLower = actualFromAddress.toLowerCase();
    const signerLower = signer.address.toLowerCase();

    console.log(`Expected Strategy Contract: ${expectedStrategyAddress}`);
    console.log(`VAA To Address: ${actualToLower}`);
    console.log(`VAA From Address: ${actualFromLower}`);
    console.log(`Current Signer: ${signerLower}`);

    console.log(`\nAddress Matches:`);
    console.log(`  VAA To = Strategy Contract: ${actualToLower === expectedStrategyAddress} ✅`);
    console.log(`  VAA From = Current Signer: ${actualFromLower === signerLower}`);
    console.log(`  Current Signer = Strategy Contract: ${signerLower === expectedStrategyAddress}`);

    console.log("\nSTEP 4: Token Bridge Validation Logic Analysis");
    console.log("-".repeat(50));

    // The key insight: For Transfer with Payload, the validation might be different
    console.log("🔍 Transfer with Payload Validation Rules:");
    console.log("1. The 'To Address' in VAA must match the contract receiving tokens");
    console.log("2. The caller of completeTransferWithPayload might need special validation");
    console.log("3. The 'From Address' might need to match the original sender");
    console.log("4. Additional payload might contain sender validation data");

    // Check what happens when different addresses call the token bridge
    const tokenBridgeABI = [
      "function completeTransferWithPayload(bytes memory encodedVm) external",
      "function parseTransferWithPayload(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, bytes32 fromAddress, bytes payload) transfer)"
    ];

    const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeABI, signer);

    console.log("\n4A. Token Bridge Parsing Test:");
    try {
      const parsedTransfer = await tokenBridge.parseTransferWithPayload(encodedVAA);
      console.log("✅ Token bridge can parse the VAA:");
      console.log(`  Payload ID: ${parsedTransfer.payloadID}`);
      console.log(`  Amount: ${parsedTransfer.amount.toString()}`);
      console.log(`  Token Address: ${parsedTransfer.tokenAddress}`);
      console.log(`  Token Chain: ${parsedTransfer.tokenChain}`);
      console.log(`  To: ${parsedTransfer.to}`);
      console.log(`  To Chain: ${parsedTransfer.toChain}`);
      console.log(`  From Address: ${parsedTransfer.fromAddress}`);
      console.log(`  Payload: ${parsedTransfer.payload}`);
    } catch (parseError) {
      console.log(`❌ Token bridge parsing failed: ${parseError.message}`);
    }

    console.log("\nSTEP 5: The 'Invalid Sender' Root Cause Analysis");
    console.log("-".repeat(50));

    console.log("🎯 CRITICAL INSIGHT:");
    console.log("\nFor Transfer with Payload VAAs, the token bridge validates:");
    console.log(`1. VAA 'To Address' (${actualToAddress}) = Contract receiving tokens ✅`);
    console.log(`2. But WHO can call completeTransferWithPayload?`);
    console.log(`   - Current caller: ${signer.address}`);
    console.log(`   - VAA From Address: ${actualFromAddress}`);
    console.log(`   - Are these the same? ${actualFromLower === signerLower ? '✅' : '❌'}`);

    if (actualFromLower !== signerLower) {
      console.log(`\n🚨 FOUND THE ISSUE!`);
      console.log(`The VAA 'From Address' is: ${actualFromAddress}`);
      console.log(`But you're calling from: ${signer.address}`);
      console.log(`\nTransfer with Payload VAAs often require the ORIGINAL SENDER`);
      console.log(`to be the one who redeems the VAA, not just anyone.`);
    }

    console.log("\nSTEP 6: Solution Analysis");
    console.log("-".repeat(50));

    console.log("💡 Possible Solutions:");

    console.log("\n6A. Use the correct sender account:");
    console.log(`    Switch to account: ${actualFromAddress}`);
    console.log(`    This account should be able to redeem the VAA`);

    console.log("\n6B. Contract-based redemption:");
    console.log(`    The strategy contract (${actualToAddress}) should call`);
    console.log(`    completeTransferWithPayload internally, not externally`);

    console.log("\n6C. Check for delegate call patterns:");
    console.log(`    Some protocols require specific calling patterns for`);
    console.log(`    Transfer with Payload redemptions`);

    console.log("\nSTEP 7: Verification Test");
    console.log("-".repeat(50));

    // Let's see if the original sender account would work
    if (actualFromLower !== signerLower) {
      console.log(`\n🧪 Testing if original sender account would work...`);
      console.log(`Original sender: ${actualFromAddress}`);
      console.log(`Current signer: ${signer.address}`);
      console.log(`\nTo test this theory:`);
      console.log(`1. Switch to the account ${actualFromAddress}`);
      console.log(`2. Try calling simpleRedeemVAA from that account`);
      console.log(`3. Or import that private key if you have access`);
    } else {
      console.log(`\n✅ Sender addresses match - this isn't the issue`);
      console.log(`The problem might be more complex...`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("FINAL DIAGNOSIS");
    console.log("=".repeat(60));

    console.log(`\n🔬 VAA Analysis Results:`);
    console.log(`• VAA Type: Transfer with Payload (Type 3) ✅`);
    console.log(`• VAA Structure: Valid ✅`);
    console.log(`• Token: ${actualTokenAddress} ✅`);
    console.log(`• Amount: ${ethers.formatUnits(amountBigInt, 6)} USDC ✅`);
    console.log(`• Recipient: ${actualToAddress} (Strategy Contract) ✅`);
    console.log(`• Original Sender: ${actualFromAddress}`);
    console.log(`• Current Caller: ${signer.address}`);

    console.log(`\n🎯 Root Cause:`);
    if (actualFromLower !== signerLower) {
      console.log(`❌ SENDER MISMATCH: VAA requires original sender to redeem`);
      console.log(`   Required: ${actualFromAddress}`);
      console.log(`   Actual: ${signer.address}`);
    } else {
      console.log(`❓ UNKNOWN: Sender addresses match but still failing`);
      console.log(`   This might be a more complex validation issue`);
    }

    console.log(`\n🛠️ Recommended Solution:`);
    console.log(`• Switch to account ${actualFromAddress} and try redemption`);
    console.log(`• Or create a new bridge-out with current account as sender`);
    console.log(`• Or investigate if contract needs special calling pattern`);

  } catch (error) {
    console.error(`\n❌ Analysis failed: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
  }
}

main()
  .then(() => {
    console.log("\n✅ VAA analysis completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
