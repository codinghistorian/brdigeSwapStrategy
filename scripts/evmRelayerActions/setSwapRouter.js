const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed CustomStrategyWormholeV2 proxy
  const strategyContractAddress = "0xD4597d6358F0533337022579147972F432553Bf0"; // mainnet

  // Uniswap V3 SwapRouter02 address on Ethereum mainnet
  const UNISWAP_V3_SWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

  const strategyContractAbi = [
    "function setSwapRouter(address _newRouter)",
    "function swapRouter() view returns (address)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function ADMIN() view returns (bytes32)",
  ];

  const customStrategyWormhole = new ethers.Contract(
    strategyContractAddress,
    strategyContractAbi,
    signer
  );

  console.log(`Using signer: ${signer.address}`);
  console.log(`Strategy contract: ${strategyContractAddress}`);
  console.log(`Setting SwapRouter to: ${UNISWAP_V3_SWAP_ROUTER}`);

  try {
    // Verify signer has the ADMIN role
    const adminRole = await customStrategyWormhole.ADMIN();
    const hasAdmin = await customStrategyWormhole.hasRole(
      adminRole,
      signer.address
    );
    console.log(`Signer has ADMIN role? ${hasAdmin}`);

    if (!hasAdmin) {
      console.error("Error: signer does not have ADMIN role. Aborting.");
      process.exit(1);
    }

    // Check current router address
    try {
      const currentRouter = await customStrategyWormhole.swapRouter();
      console.log(`Current SwapRouter: ${currentRouter}`);

      if (
        currentRouter.toLowerCase() === UNISWAP_V3_SWAP_ROUTER.toLowerCase()
      ) {
        console.log("SwapRouter is already set to the desired address.");
        return;
      }
    } catch (error) {
      console.log("No current router set or unable to read current router.");
    }

    console.log("Calling setSwapRouter...");
    const tx = await customStrategyWormhole.setSwapRouter(
      UNISWAP_V3_SWAP_ROUTER
    );
    console.log("Transaction sent. Waiting for confirmation...");
    console.log(`Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Block number: ${receipt.blockNumber}`);

    // Verify the update
    const newRouter = await customStrategyWormhole.swapRouter();
    console.log(`New SwapRouter address: ${newRouter}`);

    if (newRouter.toLowerCase() === UNISWAP_V3_SWAP_ROUTER.toLowerCase()) {
      console.log("✅ SwapRouter successfully updated!");
    } else {
      console.log("❌ SwapRouter update verification failed.");
    }
  } catch (error) {
    console.error("Error executing setSwapRouter:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
