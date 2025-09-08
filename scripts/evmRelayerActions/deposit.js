const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed CustomStrategyWormhole proxy
  const strategyContractAddress = "0x487c7E54C092A56440Df2e3Facb72482d690C718";
  const underlyingTokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // USDC on Sepolia

  const strategyContractAbi = [
    "function deposit(uint256 amount)"
  ];
  
  const erc20Abi = [
      "function approve(address spender, uint256 amount) public returns (bool)"
  ];

  const customStrategyWormhole = new ethers.Contract(strategyContractAddress, strategyContractAbi, signer);
  const underlyingToken = new ethers.Contract(underlyingTokenAddress, erc20Abi, signer);

  // The amount to deposit.
  // IMPORTANT: This assumes the underlying token has 6 decimals.
  // Please adjust the amount and decimals accordingly.
  const amount = ethers.parseUnits("0.1", 6); 

  // Approve the strategy contract to spend the underlying token
  console.log(`Approving strategy contract to spend ${ethers.formatUnits(amount, 6)} USDC...`);
  const approveTx = await underlyingToken.approve(strategyContractAddress, amount);
  console.log("Approval transaction sent, waiting for confirmation... Tx hash:", approveTx.hash);
  await approveTx.wait();
  console.log("Approval confirmed.");


  console.log(`Calling deposit on CustomStrategyWormhole at ${strategyContractAddress}`);
  console.log(`Signer address: ${signer.address}`);
  console.log(`Deposit amount: ${ethers.formatUnits(amount, 6)} tokens`);

  try {
    const tx = await customStrategyWormhole.deposit(amount);
    console.log("Transaction sent. Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    
    console.log("deposit executed successfully.");

  } catch (error) {
    console.error("Error executing deposit:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
