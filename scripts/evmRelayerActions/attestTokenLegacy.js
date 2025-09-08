const { ethers } = require("hardhat");
const {
  getEmitterAddressEth,
  getSignedVAAWithRetry,
  parseSequenceFromLogEth,
  tryNativeToHexString,
} = require("@certusone/wormhole-sdk");
const { NodeHttpTransport } = require("@improbable-eng/grpc-web-node-http-transport");
require("dotenv").config();

// Wormhole contract addresses for testnet
const WORMHOLE_RPC_HOSTS = ["https://wormhole-v2-testnet-api.certus.one"];
const ETH_TOKEN_BRIDGE_ADDRESS = "0x3ee18B2214AFF97000D974cf647E7C347E8fa585"; // Sepolia
const BSC_TOKEN_BRIDGE_ADDRESS = "0x9dcF9D205C9De35334D646BeE44b2D2859712A09"; // BSC Testnet
const ETH_CORE_BRIDGE_ADDRESS = "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78"; // Sepolia
const BSC_CORE_BRIDGE_ADDRESS = "0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D"; // BSC Testnet

// Chain IDs (Wormhole format)
const WORMHOLE_CHAIN_ID_ETH = 10002; // Sepolia
const WORMHOLE_CHAIN_ID_BSC = 4; // BSC Testnet

// RPC URLs
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";

// Token Bridge ABI (minimal for attestation)
const TOKEN_BRIDGE_ABI = [
  "function attestToken(address tokenAddress, uint32 nonce) payable returns (uint64 sequence)",
  "function createWrapped(bytes encodedVm) returns (address token)",
  "function wrappedAsset(uint16 tokenChainId, bytes32 tokenAddress) view returns (address)",
  "function isWrappedAsset(address token) view returns (bool)",
  "function wormhole() view returns (address)",
];

// Core Bridge ABI (for getting message fee)
const CORE_BRIDGE_ABI = [
  "function messageFee() view returns (uint256)"
];

// ERC20 ABI
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

class WormholeAttestationService {
  constructor() {
    this.sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    this.bscProvider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);

    // Get signer from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required");
    }

    this.sepoliaSigner = new ethers.Wallet(privateKey, this.sepoliaProvider);
    this.bscSigner = new ethers.Wallet(privateKey, this.bscProvider);
  }

  async attestToken(tokenAddress) {
    console.log("🚀 Starting token attestation using legacy Wormhole SDK...\n");

    try {
      // Step 1: Verify token exists and get details
      await this.verifyToken(tokenAddress);

      // Step 2: Check if already attested
      const isAlreadyAttested = await this.checkIfAttested(tokenAddress);
      if (isAlreadyAttested) {
        console.log("✅ Token is already attested on BSC Testnet!");
        return;
      }

      // Step 3: Perform attestation on Sepolia
      const sequence = await this.performAttestation(tokenAddress);

      // Step 4: Get VAA
      const vaa = await this.getVAA(sequence);

      // Step 5: Submit VAA to BSC
      await this.submitAttestation(vaa);

      // Step 6: Verify attestation completed
      await this.verifyAttestation(tokenAddress);

      console.log("\n🎉 Token attestation completed successfully!");

    } catch (error) {
      console.error("\n❌ Attestation failed:", error.message);
      throw error;
    }
  }

  async verifyToken(tokenAddress) {
    console.log("🔍 Verifying token details...");

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.sepoliaSigner);

    try {
      const name = await tokenContract.name();
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();

      console.log(`Token Name: ${name}`);
      console.log(`Token Symbol: ${symbol}`);
      console.log(`Token Decimals: ${decimals}`);
      console.log(`Token Address: ${tokenAddress}\n`);

      return { name, symbol, decimals };
    } catch (error) {
      throw new Error(`Failed to read token details: ${error.message}`);
    }
  }

  async checkIfAttested(tokenAddress) {
    console.log("🔍 Checking if token is already attested on BSC Testnet...");

    const tokenBridge = new ethers.Contract(
      BSC_TOKEN_BRIDGE_ADDRESS,
      TOKEN_BRIDGE_ABI,
      this.bscSigner
    );

    try {
      // Convert token address to bytes32 format
      const tokenAddressBytes32 = tryNativeToHexString(tokenAddress, WORMHOLE_CHAIN_ID_ETH);

      // Check if wrapped asset exists
      const wrappedAddress = await tokenBridge.wrappedAsset(
        WORMHOLE_CHAIN_ID_ETH,
        tokenAddressBytes32
      );

      const isAttested = wrappedAddress !== ethers.ZeroAddress;

      if (isAttested) {
        console.log(`✅ Token already attested! Wrapped address: ${wrappedAddress}\n`);
      } else {
        console.log("❌ Token is not attested on BSC Testnet\n");
      }

      return isAttested;
    } catch (error) {
      console.log("❌ Error checking attestation status, assuming not attested\n");
      return false;
    }
  }

  async performAttestation(tokenAddress) {
    console.log("🔗 Performing attestation on Sepolia...");

    // Get contracts
    const tokenBridge = new ethers.Contract(
      ETH_TOKEN_BRIDGE_ADDRESS,
      TOKEN_BRIDGE_ABI,
      this.sepoliaSigner
    );

    const coreBridge = new ethers.Contract(
      ETH_CORE_BRIDGE_ADDRESS,
      CORE_BRIDGE_ABI,
      this.sepoliaSigner
    );

    try {
      // Get message fee
      const messageFee = await coreBridge.messageFee();
      console.log(`Message fee: ${ethers.formatEther(messageFee)} ETH`);

      // Check signer balance
      const balance = await this.sepoliaProvider.getBalance(this.sepoliaSigner.address);
      console.log(`Signer balance: ${ethers.formatEther(balance)} ETH`);

      if (balance < messageFee) {
        throw new Error("Insufficient ETH balance to pay message fee");
      }

      // Perform attestation
      console.log("Sending attestation transaction...");
      const nonce = Math.floor(Math.random() * 1000000);

      const tx = await tokenBridge.attestToken(tokenAddress, nonce, {
        value: messageFee,
        gasLimit: 300000
      });

      console.log(`Transaction sent: ${tx.hash}`);
      console.log("Waiting for confirmation...");

      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

      // Parse sequence from logs
      const sequence = parseSequenceFromLogEth(receipt, ETH_CORE_BRIDGE_ADDRESS);
      console.log(`Attestation sequence: ${sequence}\n`);

      return sequence;

    } catch (error) {
      throw new Error(`Attestation transaction failed: ${error.message}`);
    }
  }

  async getVAA(sequence) {
    console.log("⏳ Waiting for VAA (this may take 2-5 minutes)...");

    try {
      const emitterAddress = getEmitterAddressEth(ETH_TOKEN_BRIDGE_ADDRESS);

      console.log(`Emitter address: ${emitterAddress}`);
      console.log(`Sequence: ${sequence}`);
      console.log(`Source chain: ${WORMHOLE_CHAIN_ID_ETH}`);

      const { vaaBytes } = await getSignedVAAWithRetry(
        WORMHOLE_RPC_HOSTS,
        WORMHOLE_CHAIN_ID_ETH,
        emitterAddress,
        sequence.toString(),
        {
          transport: NodeHttpTransport(),
        },
        10000, // 10 second retry interval
        60 // 60 retries (10 minutes total)
      );

      console.log("✅ VAA retrieved successfully!\n");
      return vaaBytes;

    } catch (error) {
      throw new Error(`Failed to get VAA: ${error.message}`);
    }
  }

  async submitAttestation(vaaBytes) {
    console.log("📤 Submitting attestation to BSC Testnet...");

    const tokenBridge = new ethers.Contract(
      BSC_TOKEN_BRIDGE_ADDRESS,
      TOKEN_BRIDGE_ABI,
      this.bscSigner
    );

    try {
      // Check signer balance on BSC
      const balance = await this.bscProvider.getBalance(this.bscSigner.address);
      console.log(`BSC signer balance: ${ethers.formatEther(balance)} BNB`);

      if (balance < ethers.parseEther("0.01")) {
        throw new Error("Insufficient BNB balance for gas fees");
      }

      console.log("Sending createWrapped transaction...");

      const tx = await tokenBridge.createWrapped(vaaBytes, {
        gasLimit: 500000
      });

      console.log(`Transaction sent: ${tx.hash}`);
      console.log("Waiting for confirmation...");

      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block: ${receipt.blockNumber}\n`);

      return receipt;

    } catch (error) {
      if (error.message.includes("already deployed")) {
        console.log("✅ Token wrapper already exists (this is fine)\n");
        return;
      }
      throw new Error(`Failed to submit attestation: ${error.message}`);
    }
  }

  async verifyAttestation(tokenAddress) {
    console.log("🔍 Verifying attestation completion...");

    const tokenBridge = new ethers.Contract(
      BSC_TOKEN_BRIDGE_ADDRESS,
      TOKEN_BRIDGE_ABI,
      this.bscSigner
    );

    try {
      const tokenAddressBytes32 = tryNativeToHexString(tokenAddress, WORMHOLE_CHAIN_ID_ETH);

      const wrappedAddress = await tokenBridge.wrappedAsset(
        WORMHOLE_CHAIN_ID_ETH,
        tokenAddressBytes32
      );

      if (wrappedAddress === ethers.ZeroAddress) {
        throw new Error("Attestation verification failed - no wrapped token found");
      }

      console.log(`✅ Attestation verified!`);
      console.log(`Wrapped token address on BSC: ${wrappedAddress}`);

      // Get wrapped token details
      const wrappedToken = new ethers.Contract(wrappedAddress, ERC20_ABI, this.bscSigner);
      try {
        const name = await wrappedToken.name();
        const symbol = await wrappedToken.symbol();
        console.log(`Wrapped token name: ${name}`);
        console.log(`Wrapped token symbol: ${symbol}`);
      } catch (e) {
        // Some wrapped tokens might not have these functions immediately available
        console.log("Wrapped token details will be available shortly");
      }

      return wrappedAddress;

    } catch (error) {
      throw new Error(`Attestation verification failed: ${error.message}`);
    }
  }

  async checkAttestationStatus(tokenAddress) {
    console.log(`🔍 Checking attestation status for: ${tokenAddress}\n`);

    try {
      await this.verifyToken(tokenAddress);
      const isAttested = await this.checkIfAttested(tokenAddress);

      if (isAttested) {
        console.log("🎉 Token is ready for bridging!");
      } else {
        console.log("💡 Run attestation: npm run attest-token-legacy");
      }

      return isAttested;
    } catch (error) {
      console.error("Error checking status:", error.message);
      return false;
    }
  }
}

// Main execution
async function main() {
  const tokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  try {
    const attestationService = new WormholeAttestationService();

    const args = process.argv.slice(2);
    if (args.includes("--check")) {
      await attestationService.checkAttestationStatus(tokenAddress);
    } else {
      await attestationService.attestToken(tokenAddress);
    }

  } catch (error) {
    console.error("\n❌ Operation failed:", error.message);

    // Common error help
    if (error.message.includes("PRIVATE_KEY")) {
      console.error("💡 Make sure to set PRIVATE_KEY in your .env file");
    } else if (error.message.includes("insufficient")) {
      console.error("💡 Make sure you have enough ETH on Sepolia and BNB on BSC Testnet");
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("\n✅ Operation completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { WormholeAttestationService };
