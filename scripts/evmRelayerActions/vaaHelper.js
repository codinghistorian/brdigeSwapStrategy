const { ethers } = require("hardhat");
const axios = require("axios");
require("dotenv").config();

// Wormhole Testnet Configuration
const WORMHOLE_CONFIG = {
  BSC_TOKEN_BRIDGE: "0x9dcF9D205C9De35334D646BeE44b2D2859712A09",
  BSC_CORE_BRIDGE: "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D",
  SEPOLIA_TOKEN_BRIDGE: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
  BSC_RPC:
    process.env.BSC_TESTNET_RPC_URL ||
    "https://data-seed-prebsc-1-s1.binance.org:8545",
  WORMHOLE_API: "https://wormhole-v2-testnet-api.certus.one",
  SEPOLIA_WORMHOLE_CHAIN_ID: 10002,
  BSC_WORMHOLE_CHAIN_ID: 4,
};

// Contract ABIs
const CORE_BRIDGE_ABI = [
  "function parseAndVerifyVM(bytes memory encodedVM) view returns (tuple(uint8 version, uint32 timestamp, uint32 nonce, uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, uint8 consistencyLevel, bytes payload, uint32 guardianSetIndex, tuple(bytes32 r, bytes32 s, uint8 v, uint8 guardianIndex)[] signatures) vm, bool valid, string reason)",
  "function isTransferCompleted(bytes32 hash) view returns (bool)",
];

const TOKEN_BRIDGE_ABI = [
  "function isTransferCompleted(bytes32 hash) view returns (bool)",
  "function parseTransfer(bytes memory encoded) pure returns (tuple(uint8 payloadID, uint256 amount, bytes32 tokenAddress, uint16 tokenChain, bytes32 to, uint16 toChain, uint256 fee) transfer)",
];

class VAA_Helper {
  constructor() {
    this.bscProvider = new ethers.JsonRpcProvider(WORMHOLE_CONFIG.BSC_RPC);

    const privateKey = process.env.PRIVATE_KEY;
    if (privateKey) {
      this.bscSigner = new ethers.Wallet(privateKey, this.bscProvider);
    }
  }

  // Decode VAA structure
  decodeVAA(vaaBytes) {
    console.log("🔍 Decoding VAA structure...\n");

    try {
      const buffer = Buffer.isBuffer(vaaBytes)
        ? vaaBytes
        : Buffer.from(vaaBytes.replace("0x", ""), "hex");

      if (buffer.length < 6) {
        throw new Error("VAA too short");
      }

      let offset = 0;

      // Header
      const version = buffer.readUInt8(offset);
      offset += 1;

      const guardianSetIndex = buffer.readUInt32BE(offset);
      offset += 4;

      const signaturesLength = buffer.readUInt8(offset);
      offset += 1;

      console.log(`Version: ${version}`);
      console.log(`Guardian Set Index: ${guardianSetIndex}`);
      console.log(`Signatures Count: ${signaturesLength}`);

      // Skip signatures
      offset += signaturesLength * 66;

      if (buffer.length <= offset + 51) {
        throw new Error("VAA body too short");
      }

      // Body
      const timestamp = buffer.readUInt32BE(offset);
      offset += 4;

      const nonce = buffer.readUInt32BE(offset);
      offset += 4;

      const emitterChainId = buffer.readUInt16BE(offset);
      offset += 2;

      const emitterAddress = buffer.subarray(offset, offset + 32);
      offset += 32;

      const sequence = buffer.readBigUInt64BE(offset);
      offset += 8;

      const consistencyLevel = buffer.readUInt8(offset);
      offset += 1;

      const payload = buffer.subarray(offset);

      console.log(`Timestamp: ${new Date(timestamp * 1000).toISOString()}`);
      console.log(`Nonce: ${nonce}`);
      console.log(`Emitter Chain ID: ${emitterChainId}`);
      console.log(`Emitter Address: 0x${emitterAddress.toString("hex")}`);
      console.log(`Sequence: ${sequence.toString()}`);
      console.log(`Consistency Level: ${consistencyLevel}`);
      console.log(`Payload Length: ${payload.length} bytes`);

      // Try to decode payload based on type and length
      console.log(`\n📦 Payload Analysis:`);
      console.log(`First byte (payload type): ${payload[0]}`);
      console.log(
        `Payload hex: 0x${payload.toString("hex").substring(0, 20)}...`
      );

      if (payload.length >= 133 && payload[0] === 1) {
        console.log("\n📦 Decoding Token Transfer Payload:");
        this.decodeTransferPayload(payload);
      } else if (payload.length >= 100 && payload[0] === 2) {
        console.log("\n📦 Decoding Token Attestation Payload:");
        this.decodeAttestationPayload(payload);
      } else if (payload.length >= 133 && payload[0] === 3) {
        console.log("\n📦 Decoding Token Transfer with Payload:");
        this.decodeTransferWithPayloadPayload(payload);
      } else {
        console.log(`\n📦 Unknown or custom payload type: ${payload[0]}`);
        console.log(`Payload length: ${payload.length} bytes`);
        // Still try to decode as transfer in case the type check is wrong
        if (payload.length >= 133) {
          console.log("\n📦 Attempting to decode as Token Transfer anyway:");
          this.decodeTransferPayload(payload);
        }
      }

      return {
        version,
        guardianSetIndex,
        signaturesLength,
        timestamp,
        nonce,
        emitterChainId,
        emitterAddress: "0x" + emitterAddress.toString("hex"),
        sequence: sequence.toString(),
        consistencyLevel,
        payload: "0x" + payload.toString("hex"),
      };
    } catch (error) {
      console.error(`❌ Failed to decode VAA: ${error.message}`);
      throw error;
    }
  }

  decodeTransferPayload(payload) {
    try {
      let offset = 0;

      const payloadType = payload.readUInt8(offset);
      offset += 1;

      // Amount (32 bytes)
      const amount = payload.subarray(offset, offset + 32);
      offset += 32;

      // Token address (32 bytes)
      const tokenAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // Token chain (2 bytes)
      const tokenChain = payload.readUInt16BE(offset);
      offset += 2;

      // To address (32 bytes)
      const toAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // To chain (2 bytes)
      const toChain = payload.readUInt16BE(offset);
      offset += 2;

      // Fee (32 bytes)
      const fee = payload.subarray(offset, offset + 32);

      console.log(`  Payload Type: ${payloadType} (Token Transfer)`);
      const amountBig = ethers.toBigInt("0x" + amount.toString("hex"));
      const feeBig = ethers.toBigInt("0x" + fee.toString("hex"));

      console.log(`  Amount: ${amountBig.toString()}`);
      console.log(
        `  Amount (formatted): ${ethers.formatUnits(
          amountBig,
          6
        )} (assuming 6 decimals)`
      );
      console.log(`  Token Address: 0x${tokenAddress.toString("hex")}`);
      console.log(
        `  Token Chain: ${tokenChain} ${
          tokenChain === 10002 ? "(Sepolia)" : ""
        }`
      );
      console.log(`  To Address: 0x${toAddress.toString("hex")}`);
      console.log(
        `  To Chain: ${toChain} ${toChain === 4 ? "(BSC Testnet)" : ""}`
      );
      console.log(`  Fee: ${feeBig.toString()}`);

      // Check if this matches expected token
      const expectedToken = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
      const tokenHex = "0x" + tokenAddress.toString("hex");
      const isExpectedToken = tokenHex
        .toLowerCase()
        .includes(expectedToken.toLowerCase().replace("0x", ""));
      console.log(
        `  ✅ Expected Token (${expectedToken}): ${
          isExpectedToken ? "MATCH" : "NO MATCH"
        }`
      );
    } catch (error) {
      console.log(
        `  ⚠️ Could not fully decode transfer payload: ${error.message}`
      );
    }
  }

  decodeTransferWithPayloadPayload(payload) {
    try {
      let offset = 0;

      const payloadType = payload.readUInt8(offset);
      offset += 1;

      // Amount (32 bytes)
      const amount = payload.subarray(offset, offset + 32);
      offset += 32;

      // Token address (32 bytes)
      const tokenAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // Token chain (2 bytes)
      const tokenChain = payload.readUInt16BE(offset);
      offset += 2;

      // To address (32 bytes)
      const toAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // To chain (2 bytes)
      const toChain = payload.readUInt16BE(offset);
      offset += 2;

      // From address (32 bytes)
      const fromAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // Additional payload length and data would follow...

      const amountBig = ethers.toBigInt("0x" + amount.toString("hex"));

      console.log(
        `  Payload Type: ${payloadType} (Token Transfer with Payload)`
      );
      console.log(`  Amount: ${amountBig.toString()}`);
      console.log(
        `  Amount (formatted): ${ethers.formatUnits(
          amountBig,
          6
        )} (assuming 6 decimals)`
      );
      console.log(`  Token Address: 0x${tokenAddress.toString("hex")}`);
      console.log(
        `  Token Chain: ${tokenChain} ${
          tokenChain === 10002 ? "(Sepolia)" : ""
        }`
      );
      console.log(`  To Address: 0x${toAddress.toString("hex")}`);
      console.log(
        `  To Chain: ${toChain} ${toChain === 4 ? "(BSC Testnet)" : ""}`
      );
      console.log(`  From Address: 0x${fromAddress.toString("hex")}`);

      // Check if this matches expected token
      const expectedToken = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
      const tokenHex = "0x" + tokenAddress.toString("hex");
      const isExpectedToken = tokenHex
        .toLowerCase()
        .includes(expectedToken.toLowerCase().replace("0x", ""));
      console.log(
        `  ✅ Expected Token (${expectedToken}): ${
          isExpectedToken ? "MATCH" : "NO MATCH"
        }`
      );
    } catch (error) {
      console.log(
        `  ⚠️ Could not fully decode transfer with payload: ${error.message}`
      );
    }
  }

  decodeAttestationPayload(payload) {
    try {
      let offset = 0;

      const payloadType = payload.readUInt8(offset);
      offset += 1;

      // Token address (32 bytes)
      const tokenAddress = payload.subarray(offset, offset + 32);
      offset += 32;

      // Token chain (2 bytes)
      const tokenChain = payload.readUInt16BE(offset);
      offset += 2;

      // Decimals (1 byte)
      const decimals = payload.readUInt8(offset);
      offset += 1;

      // Symbol (32 bytes)
      const symbol = payload.subarray(offset, offset + 32);
      offset += 32;

      // Name (32 bytes)
      const name = payload.subarray(offset, offset + 32);

      console.log(`  Payload Type: ${payloadType} (Token Attestation)`);
      console.log(`  Token Address: 0x${tokenAddress.toString("hex")}`);
      console.log(`  Token Chain: ${tokenChain}`);
      console.log(`  Decimals: ${decimals}`);
      console.log(`  Symbol: ${symbol.toString().replace(/\0/g, "")}`);
      console.log(`  Name: ${name.toString().replace(/\0/g, "")}`);
    } catch (error) {
      console.log(
        `  ⚠️ Could not fully decode attestation payload: ${error.message}`
      );
    }
  }

  // Check if VAA has been processed
  async checkVAAStatus(vaaBytes) {
    console.log("🔍 Checking VAA processing status...\n");

    try {
      const coreBridge = new ethers.Contract(
        WORMHOLE_CONFIG.BSC_CORE_BRIDGE,
        CORE_BRIDGE_ABI,
        this.bscProvider
      );

      const tokenBridge = new ethers.Contract(
        WORMHOLE_CONFIG.BSC_TOKEN_BRIDGE,
        TOKEN_BRIDGE_ABI,
        this.bscProvider
      );

      // Get VAA hash
      const vaaHash = ethers.keccak256(vaaBytes);
      console.log(`VAA Hash: ${vaaHash}`);

      // Check if transfer completed using both bridges
      const [coreCompleted, tokenCompleted] = await Promise.all([
        coreBridge.isTransferCompleted(vaaHash).catch(() => false),
        tokenBridge.isTransferCompleted(vaaHash).catch(() => false),
      ]);

      console.log(`Core Bridge - Transfer Completed: ${coreCompleted}`);
      console.log(`Token Bridge - Transfer Completed: ${tokenCompleted}`);

      const isCompleted = coreCompleted || tokenCompleted;

      if (isCompleted) {
        console.log("\n❌ This VAA has already been processed!");
        console.log(
          "💡 You need a new VAA from a fresh bridge-out transaction."
        );
      } else {
        console.log("\n✅ This VAA has not been processed yet.");
      }

      return {
        isCompleted,
        vaaHash,
        coreCompleted,
        tokenCompleted,
      };
    } catch (error) {
      console.error(`❌ Error checking VAA status: ${error.message}`);
      return { isCompleted: null, error: error.message };
    }
  }

  // Validate VAA against core bridge
  async validateVAA(vaaBytes) {
    console.log("🔍 Validating VAA with core bridge...\n");

    try {
      const coreBridge = new ethers.Contract(
        WORMHOLE_CONFIG.BSC_CORE_BRIDGE,
        CORE_BRIDGE_ABI,
        this.bscProvider
      );

      const result = await coreBridge.parseAndVerifyVM(vaaBytes);

      console.log(`Valid: ${result.valid}`);
      if (!result.valid) {
        console.log(`Reason: ${result.reason}`);
      }

      console.log(`Version: ${result.vm.version}`);
      console.log(`Emitter Chain: ${result.vm.emitterChainId}`);
      console.log(`Emitter Address: ${result.vm.emitterAddress}`);
      console.log(`Sequence: ${result.vm.sequence.toString()}`);

      return {
        isValid: result.valid,
        reason: result.reason,
        vm: result.vm,
      };
    } catch (error) {
      console.error(`❌ VAA validation failed: ${error.message}`);
      return { isValid: false, error: error.message };
    }
  }

  // Get fresh VAA from Wormhole API
  async getVAAFromAPI(emitterChain, emitterAddress, sequence) {
    console.log("🔍 Fetching VAA from Wormhole API...\n");

    try {
      const url = `${WORMHOLE_CONFIG.WORMHOLE_API}/v1/signed_vaa/${emitterChain}/${emitterAddress}/${sequence}`;
      console.log(`API URL: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });

      if (response.data && response.data.vaaBytes) {
        const vaaBytes = Buffer.from(response.data.vaaBytes, "base64");
        console.log("✅ Successfully retrieved VAA from API");
        console.log(`VAA Size: ${vaaBytes.length} bytes`);
        return vaaBytes;
      } else {
        throw new Error("No VAA data in response");
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(
          "❌ VAA not found in API. Transaction may still be processing."
        );
      } else {
        console.error(`❌ API error: ${error.message}`);
      }
      throw error;
    }
  }

  // Check what tokens can be bridged
  async checkBridgeableTokens() {
    console.log("🔍 Checking bridgeable token status...\n");

    const tokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const tokenBridge = new ethers.Contract(
      WORMHOLE_CONFIG.BSC_TOKEN_BRIDGE,
      [
        "function wrappedAsset(uint16 tokenChainId, bytes32 tokenAddress) view returns (address)",
      ],
      this.bscProvider
    );

    try {
      const tokenBytes32 = ethers.zeroPadValue(tokenAddress.toLowerCase(), 32);
      const wrappedAddress = await tokenBridge.wrappedAsset(
        WORMHOLE_CONFIG.SEPOLIA_WORMHOLE_CHAIN_ID,
        tokenBytes32
      );

      console.log(`Source Token: ${tokenAddress}`);
      console.log(`Wrapped Token on BSC: ${wrappedAddress}`);
      console.log(`Is Attested: ${wrappedAddress !== ethers.ZeroAddress}`);

      return {
        sourceToken: tokenAddress,
        wrappedToken: wrappedAddress,
        isAttested: wrappedAddress !== ethers.ZeroAddress,
      };
    } catch (error) {
      console.error(`❌ Error checking token: ${error.message}`);
      return null;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const helper = new VAA_Helper();

  try {
    if (args.includes("--decode")) {
      // Decode the VAA from bridgeInFromChain.js
      const vaaBase64 =
        "AQAAAAABADAhGx5BiRyQKC20jVkKrSBv2FPS6Za6sCiujxr1lm22GYTePLvYHE9QxOIHWLPMExWSxNNsTeqFjzqlD2t5x74AaKxrWGisa1gnEgAAAAAAAAAAAAAAANtUkiZfYDiDHon0lWcP+Qmt6UvZAAAAAAADHUUBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAAAAAAAAAAAAHH1LGWywx7AddD+8YRapAjeccjgnEgAAAAAAAAAAAAAAAGxD9VGRbGfWwfQQIg8GJWsgjhRoAAQAAAAAAAAAAAAAAABNtdCYiMv9pe0yZJc9cHqywYXHhQA=";
      const vaaBytes = Buffer.from(vaaBase64, "base64");

      console.log("=".repeat(60));
      console.log("VAA ANALYSIS REPORT");
      console.log("=".repeat(60));

      helper.decodeVAA(vaaBytes);

      console.log("\n" + "=".repeat(60));
      await helper.checkVAAStatus(vaaBytes);

      console.log("\n" + "=".repeat(60));
      await helper.validateVAA(vaaBytes);
    } else if (args.includes("--check-tokens")) {
      await helper.checkBridgeableTokens();
    } else if (args.includes("--get-vaa")) {
      // Example: node vaaHelper.js --get-vaa 10002 0x3ee18B2214AFF97000D974cf647E7C347E8fa585 123
      if (args.length < 5) {
        console.log(
          "Usage: node vaaHelper.js --get-vaa <emitterChain> <emitterAddress> <sequence>"
        );
        return;
      }

      const emitterChain = args[2];
      const emitterAddress = args[3];
      const sequence = args[4];

      const vaaBytes = await helper.getVAAFromAPI(
        emitterChain,
        emitterAddress,
        sequence
      );
      console.log(`\nVAA (Base64): ${vaaBytes.toString("base64")}`);
      console.log(`VAA (Hex): 0x${vaaBytes.toString("hex")}`);
    } else {
      console.log("🔧 VAA Helper Tool");
      console.log("==================");
      console.log("");
      console.log("Available commands:");
      console.log("  --decode           Decode and analyze the hardcoded VAA");
      console.log("  --check-tokens     Check which tokens are bridgeable");
      console.log(
        "  --get-vaa <chain> <emitter> <seq>  Get fresh VAA from API"
      );
      console.log("");
      console.log("Examples:");
      console.log("  npm run vaa-helper -- --decode");
      console.log("  npm run vaa-helper -- --check-tokens");
      console.log(
        "  npm run vaa-helper -- --get-vaa 10002 0x3ee18B2214AFF97000D974cf647E7C347E8fa585 123"
      );
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("\n✅ VAA helper completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unexpected error:", error.message);
      process.exit(1);
    });
}

module.exports = { VAA_Helper };
