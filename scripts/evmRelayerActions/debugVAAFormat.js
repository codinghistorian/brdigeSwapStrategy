const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("🐛 VAA FORMAT DEBUGGING");
  console.log("=======================");
  console.log(`Using signer: ${signer.address}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // The problematic VAA
  const problematicVAABase64 =
    "AQAAAAABADPjyWk3Vvk/SNcqG+9qmKCV6M2s8cZ2C6n2Ezs+kAzwH8SeOCWCiFVs71/QfJuy57h/us4pQR7IYy8cJaOYV20BaK231Gitt9QnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADMoUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQ==";
  const problematicVAABytes = Buffer.from(problematicVAABase64, "base64");
  const problematicVAA = "0x" + problematicVAABytes.toString("hex");

  const tokenBridgeAddress = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09";
  const coreBridgeAddress = "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D";

  try {
    console.log("STEP 1: VAA Basic Format Validation");
    console.log("-".repeat(50));

    console.log(`VAA Base64 length: ${problematicVAABase64.length}`);
    console.log(`VAA Bytes length: ${problematicVAABytes.length}`);
    console.log(`VAA Hex length: ${problematicVAA.length}`);

    // Check minimum VAA size
    if (problematicVAABytes.length < 6) {
      console.log("❌ VAA too short - invalid format");
      return;
    }

    console.log("✅ VAA has minimum required length");

    console.log("\nSTEP 2: Core Bridge VAA Validation");
    console.log("-".repeat(50));

    const coreBridgeABI = [
      "function parseAndVerifyVM(bytes memory encodedVM) external view returns (tuple(uint8 version, uint32 timestamp, uint32 nonce, uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, uint8 consistencyLevel, bytes payload, uint32 guardianSetIndex, tuple(bytes32 r, bytes32 s, uint8 v, uint8 guardianIndex)[] signatures) vm, bool valid, string memory reason)",
    ];

    const coreBridge = new ethers.Contract(
      coreBridgeAddress,
      coreBridgeABI,
      signer
    );

    console.log("2A. Testing core bridge VAA parsing...");
    try {
      const result = await coreBridge.parseAndVerifyVM(problematicVAA);
      console.log(`✅ Core bridge validation successful`);
      console.log(`   Valid: ${result.valid}`);
      console.log(`   Version: ${result.vm.version}`);
      console.log(`   Emitter Chain: ${result.vm.emitterChainId}`);
      console.log(`   Sequence: ${result.vm.sequence.toString()}`);
      console.log(`   Payload Length: ${result.vm.payload.length}`);

      if (!result.valid) {
        console.log(`❌ Core bridge says VAA is invalid: ${result.reason}`);
      }
    } catch (coreError) {
      console.log(`❌ Core bridge parsing failed: ${coreError.message}`);
      console.log("This suggests fundamental VAA format issues");

      // Try to understand the core bridge error
      if (coreError.data) {
        console.log(`Error data: ${coreError.data}`);
      }
    }

    console.log("\nSTEP 3: Token Bridge Parsing Tests");
    console.log("-".repeat(50));

    const tokenBridgeABI = [
      "function parseTransfer(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, uint256 fee) transfer)",
      "function parseTransferWithPayload(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, bytes32 fromAddress, bytes payload) transfer)",
      "function completeTransferWithPayload(bytes memory encodedVm) external",
      "function isTransferCompleted(bytes32 hash) view returns (bool)",
    ];

    const tokenBridge = new ethers.Contract(
      tokenBridgeAddress,
      tokenBridgeABI,
      signer
    );

    // Test 3A: Parse as regular transfer
    console.log("3A. Testing parseTransfer...");
    try {
      const regularTransfer = await tokenBridge.parseTransfer(problematicVAA);
      console.log(`✅ parseTransfer successful:`);
      console.log(`   Payload ID: ${regularTransfer.payloadID}`);
      console.log(`   Amount: ${regularTransfer.amount.toString()}`);
      console.log(`   Token Chain: ${regularTransfer.tokenChain}`);
    } catch (regularError) {
      console.log(`❌ parseTransfer failed: ${regularError.message}`);
    }

    // Test 3B: Parse as transfer with payload
    console.log("\n3B. Testing parseTransferWithPayload...");
    try {
      const payloadTransfer = await tokenBridge.parseTransferWithPayload(
        problematicVAA
      );
      console.log(`✅ parseTransferWithPayload successful:`);
      console.log(`   Payload ID: ${payloadTransfer.payloadID}`);
      console.log(`   Amount: ${payloadTransfer.amount.toString()}`);
      console.log(`   Token Chain: ${payloadTransfer.tokenChain}`);
      console.log(`   To Chain: ${payloadTransfer.toChain}`);
      console.log(`   From Address: ${payloadTransfer.fromAddress}`);
    } catch (payloadError) {
      console.log(
        `❌ parseTransferWithPayload failed: ${payloadError.message}`
      );

      // This is the key error - let's analyze it
      if (payloadError.message.includes("invalid Transfer")) {
        console.log(`🎯 KEY INSIGHT: Token bridge rejects VAA format`);
        console.log(
          `   This suggests the VAA structure doesn't match expected format`
        );
      }
    }

    console.log("\nSTEP 4: Manual Payload Structure Analysis");
    console.log("-".repeat(50));

    // Let's manually parse the payload to see what's wrong
    console.log("4A. Manual payload parsing...");

    // Skip VAA header to get to payload
    let offset = 0;
    const version = problematicVAABytes.readUInt8(offset);
    offset += 1;

    const guardianSetIndex = problematicVAABytes.readUInt32BE(offset);
    offset += 4;

    const signaturesLength = problematicVAABytes.readUInt8(offset);
    offset += 1;

    // Skip signatures
    offset += signaturesLength * 66;

    // Skip timestamp, nonce, emitter chain, emitter address, sequence, consistency level
    offset += 4 + 4 + 2 + 32 + 8 + 1;

    const payload = problematicVAABytes.subarray(offset);
    console.log(`Payload length: ${payload.length} bytes`);
    console.log(`Payload hex: 0x${payload.toString("hex")}`);

    // Parse payload structure
    if (payload.length >= 1) {
      const payloadType = payload.readUInt8(0);
      console.log(`Payload type: ${payloadType}`);

      if (payloadType === 1) {
        console.log("This is a regular Transfer (type 1)");
        if (payload.length < 101) {
          console.log(
            `❌ Transfer payload too short: ${payload.length} bytes, expected at least 101`
          );
        }
      } else if (payloadType === 3) {
        console.log("This is a Transfer with Payload (type 3)");
        if (payload.length < 133) {
          console.log(
            `❌ Transfer with Payload too short: ${payload.length} bytes, expected at least 133`
          );
        }
      } else {
        console.log(`❌ Unknown payload type: ${payloadType}`);
      }
    }

    console.log("\nSTEP 5: Byte-by-Byte Payload Analysis");
    console.log("-".repeat(50));

    if (payload.length >= 133 && payload[0] === 3) {
      console.log("5A. Analyzing Transfer with Payload structure:");

      let payloadOffset = 0;

      // Payload type
      const pType = payload.readUInt8(payloadOffset);
      payloadOffset += 1;
      console.log(`  Offset 0: Payload Type = ${pType}`);

      // Amount (32 bytes)
      const amount = payload.subarray(payloadOffset, payloadOffset + 32);
      payloadOffset += 32;
      console.log(`  Offset 1-32: Amount = 0x${amount.toString("hex")}`);

      // Token address (32 bytes)
      const tokenAddress = payload.subarray(payloadOffset, payloadOffset + 32);
      payloadOffset += 32;
      console.log(`  Offset 33-64: Token = 0x${tokenAddress.toString("hex")}`);

      // Token chain (2 bytes)
      if (payloadOffset + 2 <= payload.length) {
        const tokenChain = payload.readUInt16BE(payloadOffset);
        payloadOffset += 2;
        console.log(`  Offset 65-66: Token Chain = ${tokenChain}`);
      } else {
        console.log(`❌ Payload too short at token chain offset`);
      }

      // To address (32 bytes)
      if (payloadOffset + 32 <= payload.length) {
        const toAddress = payload.subarray(payloadOffset, payloadOffset + 32);
        payloadOffset += 32;
        console.log(
          `  Offset 67-98: To Address = 0x${toAddress.toString("hex")}`
        );
      } else {
        console.log(`❌ Payload too short at to address offset`);
      }

      // To chain (2 bytes)
      if (payloadOffset + 2 <= payload.length) {
        const toChain = payload.readUInt16BE(payloadOffset);
        payloadOffset += 2;
        console.log(`  Offset 99-100: To Chain = ${toChain}`);
      } else {
        console.log(`❌ Payload too short at to chain offset`);
      }

      // From address (32 bytes) - this is where Transfer with Payload differs
      if (payloadOffset + 32 <= payload.length) {
        const fromAddress = payload.subarray(payloadOffset, payloadOffset + 32);
        payloadOffset += 32;
        console.log(
          `  Offset 101-132: From Address = 0x${fromAddress.toString("hex")}`
        );
      } else {
        console.log(`❌ Payload too short at from address offset`);
      }

      // Additional payload
      if (payloadOffset < payload.length) {
        const additionalPayload = payload.subarray(payloadOffset);
        console.log(
          `  Offset ${payloadOffset}+: Additional = 0x${additionalPayload.toString(
            "hex"
          )}`
        );
      }

      console.log(
        `\nTotal payload analyzed: ${payloadOffset} bytes of ${payload.length}`
      );
    }

    console.log("\nSTEP 6: Comparison with Expected Format");
    console.log("-".repeat(50));

    console.log("6A. Expected vs Actual format comparison:");
    console.log("Expected Transfer with Payload format:");
    console.log("  - Payload Type (1 byte): 3");
    console.log("  - Amount (32 bytes)");
    console.log("  - Token Address (32 bytes)");
    console.log("  - Token Chain (2 bytes)");
    console.log("  - To Address (32 bytes)");
    console.log("  - To Chain (2 bytes)");
    console.log("  - From Address (32 bytes)");
    console.log("  - Additional Payload (variable)");
    console.log("  - Minimum total: 133 bytes");

    console.log(`\nActual payload: ${payload.length} bytes`);
    if (payload.length < 133) {
      console.log("❌ ISSUE: Payload is shorter than minimum required!");
    } else {
      console.log("✅ Payload meets minimum length requirement");
    }

    console.log("\nSTEP 7: Root Cause Analysis");
    console.log("-".repeat(50));

    console.log("🔬 Format Analysis Summary:");
    console.log("1. VAA has correct basic structure ✅");
    console.log("2. Core bridge validation: Check Step 2");
    console.log("3. Token bridge parsing: Check Steps 3A & 3B");
    console.log("4. Payload structure: Check Steps 4-6");

    console.log("\n🎯 Most Likely Issues:");
    console.log(
      "• Payload structure doesn't match BSC token bridge expectations"
    );
    console.log("• VAA was created with different/incompatible version");
    console.log("• Emitter contract format differs from standard");
    console.log("• Chain-specific formatting differences");

    console.log("\n💡 Next Steps:");
    console.log("1. Compare with a known working VAA from BSC testnet");
    console.log(
      "2. Check if the Sepolia contract uses standard Wormhole format"
    );
    console.log("3. Try creating a new VAA with current account as sender");
    console.log(
      "4. Consider using regular Transfer (type 1) instead of Transfer with Payload"
    );

    console.log("\nSTEP 8: Generate Fresh VAA Recommendation");
    console.log("-".repeat(50));

    console.log("🛠️ RECOMMENDED SOLUTION:");
    console.log("Create a fresh bridge-out transaction:");
    console.log(
      "1. Run: npx hardhat run scripts/evmRelayerActions/bridgeOutToChain.js --network sepolia"
    );
    console.log("2. Use YOUR current account as sender (not contract)");
    console.log("3. Get the new VAA from Wormhole Scan");
    console.log(
      "4. The new VAA should have proper format and sender validation"
    );
  } catch (error) {
    console.error(`\n❌ Debug analysis failed: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
  }
}

main()
  .then(() => {
    console.log("\n✅ VAA format debugging completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
