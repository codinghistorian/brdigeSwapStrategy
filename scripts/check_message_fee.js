const { ethers } = require("hardhat");
require("dotenv").config();

// ============ NETWORK CONFIGURATION ============
// Change this to switch between networks: 'mainnet', 'sepolia', or 'bscMainnet'
const NETWORK = process.env.NETWORK || "mainnet";

// Network configurations
const NETWORK_CONFIG = {
  mainnet: {
    name: "Ethereum Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
  },
  sepolia: {
    name: "Sepolia Testnet",
    wormhole: "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78",
  },
  bscMainnet: {
    name: "BSC Mainnet",
    wormhole: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
  },
};

async function main() {
  // Validate network configuration
  if (!NETWORK_CONFIG[NETWORK]) {
    throw new Error(
      `Invalid network: ${NETWORK}. Must be 'mainnet', 'sepolia', or 'bscMainnet'`
    );
  }

  const config = NETWORK_CONFIG[NETWORK];
  const wormholeAddress = config.wormhole;

  console.log(`Network: ${config.name}`);
  console.log(`Wormhole contract: ${wormholeAddress}`);

  // Wormhole contract ABI - only the messageFee function
  const wormholeAbi = [
    "function messageFee() external view returns (uint256)",
  ];

  // Create contract instance (no signer needed for view functions)
  const wormholeContract = new ethers.Contract(
    wormholeAddress,
    wormholeAbi,
    ethers.provider
  );

  try {
    console.log("\n--- Fetching Wormhole Message Fee ---");
    const messageFee = await wormholeContract.messageFee();

    console.log(`Message fee: ${messageFee.toString()} wei`);
    console.log(`Message fee: ${ethers.formatEther(messageFee)} ETH`);
    console.log(`Message fee: ${ethers.formatUnits(messageFee, 'gwei')} Gwei`);

  } catch (error) {
    console.error("❌ Error fetching message fee:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
