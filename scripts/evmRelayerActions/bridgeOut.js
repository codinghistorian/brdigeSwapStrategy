const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed BridgeSwapStrategy
  const strategyContractAddress = "0xf90e6E8E1faFFCf4a204e45b3806390a877fcd7B"; // mainnet
  // const strategyContractAddress = "0x487c7E54C092A56440Df2e3Facb72482d690C718"; // sepolia

  // Token to bridge (USDT)
  const tokenAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  // Amount to bridge (6 decimals)
  const amount = 998; // 0.499852 USDT

  // Destination chain ID (Wormhole: 4 = BSC Mainnet)
  const destinationChainId = 4;

  // Recipient address on destination chain (convert to bytes32)
  const recipientAddress = "0x4F3862D359D8f76498f69732740E4d53b7676639";
  const recipient = ethers.zeroPadValue(recipientAddress, 32);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Strategy contract: ${strategyContractAddress}`);
  console.log(`Token to bridge: ${tokenAddress}`);
  console.log(`Amount: ${amount} (${ethers.formatUnits(amount, 6)} USDT)`);
  console.log(`Destination chain ID: ${destinationChainId}`);
  console.log(`Recipient: ${recipientAddress}`);
  console.log(`Recipient (bytes32): ${recipient}`);

  // Contract ABIs
  const strategyContractAbi = [
    "function bridgeOut(address token, uint256 amount, uint16 destinationChainId, bytes32 recipient) payable",
    "function getMessageFee() view returns (uint256)",
    "function REPORTING_MANAGER() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
  ];

  const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
  ];

  // Contract instances
  const strategyContract = new ethers.Contract(
    strategyContractAddress,
    strategyContractAbi,
    signer
  );
  const token = new ethers.Contract(tokenAddress, erc20Abi, signer);

  try {
    // 1) Verify caller role
    const reportingManagerRole = await strategyContract.REPORTING_MANAGER();
    const isManager = await strategyContract.hasRole(reportingManagerRole, signer.address);
    if (!isManager) {
      console.error("Caller is not REPORTING_MANAGER. Grant the role before calling bridgeOut.");
      process.exit(1);
    }

    // 2) Check contract's token balance
    console.log("\n--- Checking Contract Token Balance ---");
    const contractBalance = await token.balanceOf(strategyContractAddress);
    console.log(
      `Strategy token balance: ${ethers.formatUnits(contractBalance, 6)} USDT`
    );
    if (contractBalance < amount) {
      console.error(
        `Insufficient contract token balance. Required: ${ethers.formatUnits(amount, 6)}, Available: ${ethers.formatUnits(contractBalance, 6)}`
      );
      process.exit(1);
    }

    // 3) Get Wormhole message fee
    console.log("\n--- Fetching Wormhole Message Fee ---");
    const messageFee = await strategyContract.getMessageFee();
    console.log(`Required message fee: ${ethers.formatEther(messageFee)} ETH`);

    // 4) Call bridgeOut on the strategy contract (contract holds the tokens)
    console.log("\n--- Executing Bridge Transaction ---");
    console.log("Calling strategy.bridgeOut...");
    const tx = await strategyContract.bridgeOut(
      tokenAddress,
      amount,
      destinationChainId,
      recipient,
      {
        value: messageFee,
        gasLimit: 500000,
      }
    );

    console.log(`Transaction sent! Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Block number: ${receipt.blockNumber}`);

    // 5) Parse BridgedOut event
    console.log("\n--- Transaction Events ---");
    const event = receipt.logs?.find((log) => {
      try {
        const parsedLog = strategyContract.interface.parseLog(log);
        return parsedLog && parsedLog.name === "BridgedOut";
      } catch (e) {
        return false;
      }
    });

    if (event) {
      const parsedEvent = strategyContract.interface.parseLog(event);
      console.log("--- BridgedOut Event ---");
      console.log(`Token: ${parsedEvent.args.token}`);
      console.log(`Amount: ${ethers.formatUnits(parsedEvent.args.amount, 6)} USDT`);
      console.log(`Destination Chain: ${parsedEvent.args.destinationChainId}`);
      console.log(`Recipient: ${parsedEvent.args.recipient}`);
      console.log(`Wormhole Sequence: ${parsedEvent.args.sequence.toString()}`);
      console.log("----------------------------------");
      console.log("\n🎉 Bridge transaction completed successfully!");
    } else {
      console.log("BridgedOut event not found in the transaction receipt.");
    }
  } catch (error) {
    console.error("\n❌ Error executing bridgeOut:", error);
    if (error.message?.includes("Unauthorized") || error.message?.includes("AccessControl")) {
      console.error("Access control: ensure the signer has REPORTING_MANAGER role.");
    }
    if (error.message?.includes("InsufficientBalance")) {
      console.error("Contract doesn't have enough tokens to bridge.");
    }
    if (error.message?.includes("insufficient funds")) {
      console.error("Insufficient ETH for gas and Wormhole fee on the signer.");
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
