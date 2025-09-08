const { ethers } = require("hardhat");
const axios = require("axios");
require("dotenv").config();

// Wormhole Testnet Configuration
const WORMHOLE_CONFIG = {
  // Chain IDs (Wormhole format)
  SEPOLIA_WORMHOLE_CHAIN_ID: 10002,
  BSC_WORMHOLE_CHAIN_ID: 4,

  // Contract Addresses
  SEPOLIA_TOKEN_BRIDGE: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
  SEPOLIA_CORE_BRIDGE: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
  BSC_TOKEN_BRIDGE: "0x9dcF9D205C9De35334D646BeE44b2D2859712A09",
  BSC_CORE_BRIDGE: "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D",

  // RPC URLs
  SEPOLIA_RPC: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
  BSC_RPC: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",

  // Wormhole API
  WORMHOLE_API: "https://wormhole-v2-testnet-api.certus.one",
};

// Contract ABIs
const TOKEN_BRIDGE_ABI = [
  "function attestToken(address tokenAddress, uint32 nonce) payable returns (uint64)",
  "function createWrapped(bytes memory encodedVm) returns (address)",
  "function wrappedAsset(uint16 tokenChainId, bytes32 tokenAddress) view returns (address)",
  "function wormhole() view returns (address)"
];

const CORE_BRIDGE_ABI = [
  "function messageFee() view returns (uint256)",
  "function publishMessage(uint32 nonce, bytes memory payload, uint8 consistencyLevel) payable returns (uint64)",
  "function parseAndVerifyVM(bytes memory encodedVM) view returns (tuple(uint8 version, uint32 timestamp, uint32 nonce, uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, uint8 consistencyLevel, bytes payload, uint32 guardianSetIndex, tuple(bytes32 r, bytes32 s, uint8 v, uint8 guardianIndex)[] signatures) vm, bool valid, string reason)"
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)"
];

class DirectWormholeAttestationService {
  constructor() {
    this.initializeProviders();
  }

  initializeProviders() {
    this.sepoliaProvider = new ethers.JsonRpcProvider(WORMHOLE_CONFIG.SEPOLIA_RPC);
    this.bscProvider = new ethers.JsonRpcProvider(WORMHOLE_CONFIG.BSC_RPC);

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required");
    }

    this.sepoliaSigner = new ethers.Wallet(privateKey, this.sepoliaProvider);
    this.bscSigner = new ethers.Wallet(privateKey, this.bscProvider);

    console.log(`Sepolia Signer: ${this.sepoliaSigner.address}`);
    console.log(`BSC Signer: ${this.bscSigner.address}`);
  }

  // Convert address to bytes32 format for Wormhole
  addressToBytes32(address) {
    return ethers.zeroPadValue(address.toLowerCase(), 32);
  }

  // Get emitter address for token bridge
  getEmitterAddress(contractAddress) {
    return ethers.zeroPadValue(contractAddress.toLowerCase(), 32);
  }

  async getTokenDetails(tokenAddress) {
    console.log("🔍 Getting token details...");

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.sepoliaSigner);

    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply()
      ]);

      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log(`Decimals: ${decimals}`);
      console.log(`Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);
      console.log(`Address: ${tokenAddress}\n`);

      return { name, symbol, decimals, totalSupply };
    } catch (error) {
      throw new Error(`Failed to get token details: ${error.message}`);
    }
  }

  async checkIfAttested(tokenAddress) {
    console.log("🔍 Checking if token is already attested...");

    const bscTokenBridge = new ethers.Contract(
      WORMHOLE_CONFIG.BSC_TOKEN_BRIDGE,
      TOKEN_BRIDGE_ABI,
      this.bscSigner
    );

    try {
      const tokenBytes32 = this.addressToBytes32(tokenAddress);
      const wrappedAddress = await bscTokenBridge.wrappedAsset(
        WORMHOLE_CONFIG.SEPOLIA_WORMHOLE_CHAIN_ID,
        tokenBytes32
      );

      const isAttested = wrappedAddress !== ethers.ZeroAddress;

      if (isAttested) {
        console.log(`✅ Already attested! Wrapped address: ${wrappedAddress}\n`);
        return { isAttested: true, wrappedAddress };
      } else {
        console.log("❌ Token not yet attested\n");
        return { isAttested: false };
      }
    } catch (error) {
      console.log("❌ Could not check attestation status, assuming not attested\n");
      return { isAttested: false };
    }
  }

  async performAttestation(tokenAddress) {
    console.log("🔗 Performing attestation on Sepolia...");

    const sepoliaTokenBridge = new ethers.Contract(
      WORMHOLE_CONFIG.SEPOLIA_TOKEN_BRIDGE,
      TOKEN_BRIDGE_ABI,
      this.sepoliaSigner
    );

    const sepoliaCoreBridge = new ethers.Contract(
      WORMHOLE_CONFIG.SEPOLIA_CORE_BRIDGE,
      CORE_BRIDGE_ABI,
      this.sepoliaSigner
    );

    try {
      // Get message fee
      const messageFee = await sepoliaCoreBridge.messageFee();
      console.log(`Message fee: ${ethers.formatEther(messageFee)} ETH`);

      // Check balance
      const balance = await this.sepoliaProvider.getBalance(this.sepoliaSigner.address);
      console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

      if (balance < messageFee) {
        throw new Error(`Insufficient balance. Need ${ethers.formatEther(messageFee)} ETH`);
      }

      // Generate random nonce
      const nonce = Math.floor(Math.random() * 1000000);

      console.log("Sending attestation transaction...");
      const tx = await sepoliaTokenBridge.attestToken(tokenAddress, nonce, {
        value: messageFee,
        gasLimit: 300000
      });

      console.log(`Transaction hash: ${tx.hash}`);
      console.log("Waiting for confirmation...");

      const receipt = await tx.wait();
      console.log(`Confirmed in block: ${receipt.blockNumber}`);

      // Extract sequence from logs
      const sequence = await this.extractSequenceFromReceipt(receipt);
      console.log(`Sequence: ${sequence}\n`);

      return { sequence, transactionHash: tx.hash };

    } catch (error) {
      throw new Error(`Attestation failed: ${error.message}`);
    }
  }

  async extractSequenceFromReceipt(receipt) {
    // Look for LogMessagePublished event in the receipt
    const logMessageTopic = "0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2";

    for (const log of receipt.logs) {
      if (log.topics[0] === logMessageTopic) {
        // Decode the sequence from the log data
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["uint32", "uint64", "uint8"],
          log.data
        );
        return decoded[1]; // sequence is the second parameter
      }
    }

    throw new Error("Could not find sequence in transaction receipt");
  }

  async getVAA(sequence, retries = 60) {
    console.log("⏳ Waiting for VAA (this may take 2-5 minutes)...");

    const emitterAddress = this.getEmitterAddress(WORMHOLE_CONFIG.SEPOLIA_TOKEN_BRIDGE);

    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Attempt ${i + 1}/${retries} - Checking for VAA...`);

        const url = `${WORMHOLE_CONFIG.WORMHOLE_API}/v1/signed_vaa/${WORMHOLE_CONFIG.SEPOLIA_WORMHOLE_CHAIN_ID}/${emitterAddress}/${sequence}`;

        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json'
          }
        });

        if (response.data && response.data.vaaBytes) {
          console.log("✅ VAA retrieved successfully!\n");
          return Buffer.from(response.data.vaaBytes, 'base64');
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          // VAA not ready yet, continue waiting
        } else {
          console.log(`API Error: ${error.message}`);
        }
      }

      // Wait 10 seconds before next attempt
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    throw new Error("Timeout waiting for VAA. The attestation may still be processing.");
  }

  async submitAttestation(vaaBytes) {
    console.log("📤 Submitting attestation to BSC...");

    const bscTokenBridge = new ethers.Contract(
      WORMHOLE_CONFIG.BSC_TOKEN_BRIDGE,
      TOKEN_BRIDGE_ABI,
      this.bscSigner
    );

    try {
      // Check balance
      const balance = await this.bscProvider.getBalance(this.bscSigner.address);
      console.log(`BSC account balance: ${ethers.formatEther(balance)} BNB`);

      if (balance < ethers.parseEther("0.01")) {
        throw new Error("Insufficient BNB for gas fees");
      }

      console.log("Sending createWrapped transaction...");
      const tx = await bscTokenBridge.createWrapped(vaaBytes, {
        gasLimit: 500000
      });

      console.log(`Transaction hash: ${tx.hash}`);
      console.log("Waiting for confirmation...");

      const receipt = await tx.wait();
      console.log(`Confirmed in block: ${receipt.blockNumber}\n`);

      return receipt;

    } catch (error) {
      if (error.message.includes("wrapped asset already exists")) {
        console.log("✅ Wrapped asset already exists (this is fine)\n");
        return;
      }
      throw new Error(`Failed to submit attestation: ${error.message}`);
    }
  }

  async verifyAttestation(tokenAddress) {
    console.log("🔍 Verifying attestation...");

    const result = await this.checkIfAttested(tokenAddress);

    if (result.isAttested) {
      console.log("🎉 Attestation verified successfully!");
      console.log(`Wrapped token address: ${result.wrappedAddress}`);

      // Try to get wrapped token details
      try {
        const wrappedTokenContract = new ethers.Contract(
          result.wrappedAddress,
          ERC20_ABI,
          this.bscSigner
        );

        const name = await wrappedTokenContract.name();
        const symbol = await wrappedTokenContract.symbol();
        console.log(`Wrapped token name: ${name}`);
        console.log(`Wrapped token symbol: ${symbol}`);
      } catch (e) {
        console.log("Wrapped token details will be available shortly");
      }

      return result.wrappedAddress;
    } else {
      throw new Error("Attestation verification failed");
    }
  }

  async attestToken(tokenAddress) {
    console.log("🚀 Starting Direct Wormhole Token Attestation\n");
    console.log(`Token: ${tokenAddress}`);
    console.log(`Source: Sepolia Testnet`);
    console.log(`Destination: BSC Testnet\n`);

    try {
      // Step 1: Get token details
      await this.getTokenDetails(tokenAddress);

      // Step 2: Check if already attested
      const attestationStatus = await this.checkIfAttested(tokenAddress);
      if (attestationStatus.isAttested) {
        console.log("✅ Token is already attested and ready for bridging!");
        return attestationStatus.wrappedAddress;
      }

      // Step 3: Perform attestation
      const { sequence } = await this.performAttestation(tokenAddress);

      // Step 4: Get VAA
      const vaaBytes = await this.getVAA(sequence);

      // Step 5: Submit to destination
      await this.submitAttestation(vaaBytes);

      // Step 6: Verify
      const wrappedAddress = await this.verifyAttestation(tokenAddress);

      console.log("\n🎉 Token attestation completed successfully!");
      console.log("You can now use your bridgeOutToChain.js and bridgeInFromChain.js scripts.");

      return wrappedAddress;

    } catch (error) {
      console.error(`\n❌ Attestation failed: ${error.message}`);

      // Provide helpful error messages
      if (error.message.includes("insufficient")) {
        console.error("💡 Make sure you have enough ETH on Sepolia and BNB on BSC Testnet");
      } else if (error.message.includes("timeout")) {
        console.error("💡 VAA generation is taking longer than expected. You can:");
        console.error("   1. Wait a bit longer and run the check command");
        console.error("   2. Check Wormhole Scan for your transaction");
      }

      throw error;
    }
  }

  async checkStatus(tokenAddress) {
    console.log("🔍 Checking Token Attestation Status\n");

    try {
      await this.getTokenDetails(tokenAddress);
      const result = await this.checkIfAttested(tokenAddress);

      if (result.isAttested) {
        console.log("🎉 Token is attested and ready for bridging!");
        console.log(`Wrapped address: ${result.wrappedAddress}`);
      } else {
        console.log("❌ Token is not attested yet");
        console.log("💡 Run: npm run attest-token-direct");
      }

      return result.isAttested;
    } catch (error) {
      console.error(`Error checking status: ${error.message}`);
      return false;
    }
  }
}

// Main execution
async function main() {
  const tokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  try {
    const attestationService = new DirectWormholeAttestationService();

    const args = process.argv.slice(2);
    if (args.includes("--check")) {
      await attestationService.checkStatus(tokenAddress);
    } else {
      await attestationService.attestToken(tokenAddress);
    }

  } catch (error) {
    console.error(`\n❌ Operation failed: ${error.message}`);

    if (error.message.includes("PRIVATE_KEY")) {
      console.error("💡 Set your PRIVATE_KEY in the .env file");
    } else if (error.message.includes("network") || error.message.includes("connection")) {
      console.error("💡 Check your internet connection and RPC URLs");
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("\n✅ Operation completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unexpected error:", error.message);
      process.exit(1);
    });
}

module.exports = { DirectWormholeAttestationService };
