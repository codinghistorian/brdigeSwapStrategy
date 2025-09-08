const { ethers } = require("hardhat");
require("dotenv").config();

// Dynamic import helper for ES modules
async function importWormholeSDK() {
  const { wormhole, Wormhole } = await import("@wormhole-foundation/sdk");
  const evm = await import("@wormhole-foundation/sdk/evm");
  return { wormhole, Wormhole, evm: evm.default || evm };
}

// Helper function to get signer for a chain
async function getSigner(chain) {
  const [signer] = await ethers.getSigners();

  // Configure RPC endpoints for testnet chains
  const rpcEndpoints = {
    Sepolia: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
    Bsc:
      process.env.BSC_TESTNET_RPC_URL ||
      "https://data-seed-prebsc-1-s1.binance.org:8545",
  };

  const rpcUrl = rpcEndpoints[chain.chain];
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain: ${chain.chain}`);
  }

  // Create provider for the specific chain
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const chainSigner = new ethers.Wallet(
    signer.privateKey || process.env.PRIVATE_KEY,
    provider
  );

  return {
    signer: chainSigner,
    address: await chainSigner.getAddress(),
  };
}

async function attestToken() {
  try {
    console.log("🚀 Starting token attestation process...\n");

    // Dynamically import Wormhole SDK modules
    console.log("📡 Loading Wormhole SDK...");
    const { wormhole, Wormhole, evm } = await importWormholeSDK();
    console.log("✅ Wormhole SDK loaded successfully");

    // Initialize wormhole instance for testnet with EVM platforms
    console.log("📡 Initializing Wormhole SDK...");
    const wh = await wormhole("Testnet", [evm]);

    // Define source and destination chains
    const sourceChain = wh.getChain("Sepolia");
    const destinationChain = wh.getChain("Bsc"); // BSC testnet

    console.log(`Source chain: ${sourceChain.chain}`);
    console.log(`Destination chain: ${destinationChain.chain}\n`);

    // Get signers for both chains
    console.log("🔐 Setting up signers...");
    const sourceSigner = await getSigner(sourceChain);
    const destinationSigner = await getSigner(destinationChain);

    console.log(`Source signer address: ${sourceSigner.address}`);
    console.log(`Destination signer address: ${destinationSigner.address}\n`);

    // Define the token to attest (from your bridgeOutToChain.js)
    const tokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const tokenId = Wormhole.tokenId(sourceChain.chain, tokenAddress);

    console.log(`Token to attest: ${tokenAddress}`);
    console.log(`Token ID: ${JSON.stringify(tokenId)}\n`);

    // Check if the token is already registered on the destination chain
    console.log("🔍 Checking if token is already registered on destination...");
    let wrappedToken;
    try {
      wrappedToken = await wh.getWrappedAsset(destinationChain.chain, tokenId);
      console.log(`✅ Token already registered on ${destinationChain.chain}:`);
      console.log(`Wrapped token address: ${wrappedToken.address}`);
      console.log(
        "\n🎉 Attestation not needed! Token is already available on destination chain."
      );
      return wrappedToken;
    } catch (e) {
      console.log(
        `⚠️  Token is NOT registered on ${destinationChain.chain}. Running attestation flow...\n`
      );
    }

    // ===================================================================
    // START: Token Attestation Flow
    // ===================================================================

    console.log("📝 Creating attestation object...");
    // Create the attestation object
    const attestation = await wh.attest(tokenId, sourceSigner.address);
    console.log("✅ Attestation object created\n");

    // Step 1: Initiate the attestation on the source chain
    console.log(`🔗 Initiating attestation on ${sourceChain.chain}...`);
    const attestTxs = await attestation.attest(sourceSigner.signer);
    console.log(`✅ Source chain attestation transaction(s) sent:`);

    // Log transaction hashes instead of full objects to avoid circular references
    if (Array.isArray(attestTxs)) {
      attestTxs.forEach((tx, i) => {
        console.log(
          `  Transaction ${i + 1}: ${
            tx.hash || tx.txid || "Hash not available"
          }`
        );
      });
    } else {
      console.log(
        `  Transaction hash: ${
          attestTxs.hash || attestTxs.txid || "Hash not available"
        }`
      );
    }
    console.log("");

    // Step 2: Wait for the VAA (Verified Action Approval)
    console.log(
      "⏳ Waiting for attestation VAA (this may take a few minutes)..."
    );
    console.log(
      "Note: This process typically takes 2-5 minutes for testnet, up to 15 minutes for mainnet"
    );

    const attestationIds = await attestation.fetchAttestation(600_000); // 10 min timeout
    console.log("✅ Got attestation VAA!");

    // Log attestation IDs safely
    if (Array.isArray(attestationIds)) {
      console.log(
        `  Number of attestations received: ${attestationIds.length}`
      );
    } else {
      console.log("  Attestation received successfully");
    }
    console.log("");

    // Step 3: Submit the VAA to the destination chain to complete registration
    console.log(`📤 Submitting attestation to ${destinationChain.chain}...`);
    const registrationTxs = await attestation.submitAttestation(
      destinationSigner.signer
    );
    console.log("✅ Token registration transaction(s) sent:");

    // Log registration transaction hashes
    if (Array.isArray(registrationTxs)) {
      registrationTxs.forEach((tx, i) => {
        console.log(
          `  Registration Transaction ${i + 1}: ${
            tx.hash || tx.txid || "Hash not available"
          }`
        );
      });
    } else {
      console.log(
        `  Registration Transaction hash: ${
          registrationTxs.hash || registrationTxs.txid || "Hash not available"
        }`
      );
    }
    console.log("");

    // ===================================================================
    // END: Token Attestation Flow
    // ===================================================================

    // Verify the token is now registered
    console.log("🔍 Verifying token registration...");
    try {
      wrappedToken = await wh.getWrappedAsset(destinationChain.chain, tokenId);
      console.log(
        `🎉 SUCCESS! Token is now registered on ${destinationChain.chain}:`
      );
      console.log(`Wrapped token address: ${wrappedToken.address}`);
      console.log(
        `\n✅ You can now bridge tokens from ${sourceChain.chain} to ${destinationChain.chain}!`
      );
      return wrappedToken;
    } catch (e) {
      console.error("❌ Failed to verify token registration:", e.message);
      throw e;
    }
  } catch (error) {
    console.error("\n❌ Error during token attestation:", error);

    // Parse common error messages
    if (error.message.includes("insufficient funds")) {
      console.error("💸 Insufficient funds for gas fees on one of the chains.");
    } else if (error.message.includes("network")) {
      console.error("🌐 Network connection issue. Check your RPC endpoints.");
    } else if (error.message.includes("timeout")) {
      console.error(
        "⏰ Timeout waiting for VAA. The attestation may still be processing."
      );
      console.error(
        "   You can check the status later using: npm run check-attestation"
      );
    } else if (error.message.includes("loader is not a function")) {
      console.error("📦 SDK loading issue. Try reinstalling dependencies:");
      console.error("   npm uninstall @wormhole-foundation/sdk");
      console.error("   npm install @wormhole-foundation/sdk@latest");
    }

    process.exit(1);
  }
}

// Additional helper function to check attestation status
async function checkAttestationStatus() {
  const tokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  try {
    console.log("📡 Loading Wormhole SDK...");
    const { wormhole, Wormhole, evm } = await importWormholeSDK();

    const wh = await wormhole("Testnet", [evm]);
    const sourceChain = wh.getChain("Sepolia");
    const destinationChain = wh.getChain("Bsc");

    const tokenId = Wormhole.tokenId(sourceChain.chain, tokenAddress);

    console.log(`\n🔍 Checking attestation status for token: ${tokenAddress}`);
    console.log(
      `Source chain: ${sourceChain.chain} → Destination chain: ${destinationChain.chain}`
    );

    const wrappedToken = await wh.getWrappedAsset(
      destinationChain.chain,
      tokenId
    );

    console.log(`\n✅ Token is registered on ${destinationChain.chain}:`);
    console.log(`Wrapped token address: ${wrappedToken.address}`);
    console.log(`\n🎉 Ready for bridging!`);
    return true;
  } catch (e) {
    console.log(`\n❌ Token is NOT registered on destination chain.`);
    console.log(`Error: ${e.message}`);
    console.log(`\n💡 Run attestation first: npm run attest-token`);
    return false;
  }
}

// Main execution
if (require.main === module) {
  // Check if user wants to just check status
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    checkAttestationStatus()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Error checking attestation status:", error.message);
        process.exit(1);
      });
  } else {
    attestToken()
      .then(() => {
        console.log("\n🎉 Token attestation completed successfully!");
        console.log(
          "You can now use your bridgeOutToChain.js and bridgeInFromChain.js scripts."
        );
        process.exit(0);
      })
      .catch((error) => {
        console.error("Attestation failed:", error.message);
        process.exit(1);
      });
  }
}

module.exports = { attestToken, checkAttestationStatus };
