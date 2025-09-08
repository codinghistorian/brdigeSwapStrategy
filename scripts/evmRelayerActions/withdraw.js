const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed CustomStrategyWormhole proxy
  const strategyContractAddress = "0xa11410E204234599A9dE3b1b40535F02AdBFEA72";

  const strategyContractAbi = [
    "function withdraw(uint256 amount)"
  ];

  const customStrategyWormhole = new ethers.Contract(strategyContractAddress, strategyContractAbi, signer);

  // The amount to withdraw.
  // IMPORTANT: This assumes the underlying token has 6 decimals.
  // Please adjust the amount and decimals accordingly.
  const amount = ethers.parseUnits("0.1", 6); 

  console.log(`Calling withdraw on CustomStrategyWormhole at ${strategyContractAddress}`);
  console.log(`Signer address: ${signer.address}`);
  console.log(`Withdrawal amount: ${ethers.formatUnits(amount, 6)} tokens`);

  try {
    const tx = await customStrategyWormhole.withdraw(amount);
    console.log("Transaction sent. Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    
    console.log("withdraw executed successfully.");

  } catch (error) {
    console.error("Error executing withdraw:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
