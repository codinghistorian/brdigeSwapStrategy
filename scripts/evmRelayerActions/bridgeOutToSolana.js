const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = "0x536eFD341e6B17798c52a201B4A87a961f0dC159"; // mainnet
  // const contractAddress = "0x487c7E54C092A56440Df2e3Facb72482d690C718"; // sepolia

  // Amount of the underlying token to send (in its smallest unit, e.g., 6 decimals for USDC)
  const amount = ethers.parseUnits("0.01", 6); // e.g., 0.1 USDC

  // --- SCRIPT LOGIC ---
  const [signer] = await ethers.getSigners();
  console.log(`Using signer: ${signer.address}`);

  // Get the contract instance
  const strategyContractAbi = [
    "function bridgeOutToSolana(uint256 amount) payable",
    "function getWormholeFee() view returns (uint256)",
  ];
  const strategyContract = new ethers.Contract(
    contractAddress,
    strategyContractAbi,
    signer
  );

  // 1. Fetch the Wormhole message fee from our contract's getter
  console.log("Fetching Wormhole message fee from strategy contract...");
  const messageFee = await strategyContract.getWormholeFee();
  console.log(`Required message fee: ${ethers.formatEther(messageFee)} ETH`);

  // Call the bridgeOutToSolana function
  console.log(
    `Calling bridgeOutToSolana with amount: ${ethers.formatUnits(
      amount,
      6
    )} of underlying token...`
  );

  const tx = await strategyContract.bridgeOutToSolana(amount, {
    value: messageFee, // Pass the message fee as msg.value
    gasLimit: 500000, // Set a reasonable gas limit
  });

  console.log(`Transaction sent! Hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log("Transaction confirmed.");

  // Find and log the event from the receipt
  const event = receipt.events?.find((e) => e.event === "BridgedOut");
  if (event) {
    console.log("\n--- BridgedOut Event ---");
    console.log(`Amount: ${ethers.formatUnits(event.args.amount, 6)}`);
    console.log(`Wormhole Sequence: ${event.args.sequence.toString()}`);
    console.log("--------------------------\n");
    console.log(
      "You can use the Wormhole Sequence to track the VAA on Wormhole Scan."
    );
  } else {
    console.log("BridgedOut event not found in the transaction receipt.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
