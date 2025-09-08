const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed MinimalWormholeRelayer contract
  const relayerContractAddress = "0xDB505e30Be5f3541F6267163dC90050c09488b64";

  // Token to bridge (USDT on Ethereum)
  const tokenAddress = "0xdac17f958d2ee523a2206206994597c13d831ec7";
  // USDC on Ethereum
  // const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  // Amount to bridge (0.1 USDT with 6 decimals)
  const amount = 1000; // 0.1 USDT in smallest units (6 decimals)

  // Destination chain ID (4 = BSC according to Wormhole chain IDs)
  const destinationChainId = 4;

  // Recipient address on destination chain (convert to bytes32)
  const recipientAddress = "0xa7e6014b1c6147Dd54d80A0AF2883978b67D7263"; // Replace with actual recipient
  const recipient = ethers.zeroPadValue(recipientAddress, 32);

  console.log(`Using signer: ${signer.address}`);
  console.log(`Relayer contract: ${relayerContractAddress}`);
  console.log(`Token to bridge: ${tokenAddress}`);
  console.log(`Amount: ${amount} (${ethers.formatUnits(amount, 6)} USDT)`);
  console.log(`Destination chain ID: ${destinationChainId}`);
  console.log(`Recipient: ${recipientAddress}`);
  console.log(`Recipient (bytes32): ${recipient}`);

  // Contract ABIs
  const relayerContractAbi = [
    "function bridgeOut(address token, uint256 amount, uint16 destinationChainId, bytes32 recipient) payable",
    "function getMessageFee() view returns (uint256)",
    "function withdraw(address token, uint256 amount)",
  ];

  const erc20Abi = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function balanceOf(address owner) public view returns (uint256)",
  ];

  // Contract instances
  const relayerContract = new ethers.Contract(
    relayerContractAddress,
    relayerContractAbi,
    signer
  );

  const token = new ethers.Contract(tokenAddress, erc20Abi, signer);

  try {
    // 1. Check that relayer contract has enough tokens
    console.log("\n--- Checking Relayer Contract Token Balance ---");
    const relayerBalance = await token.balanceOf(relayerContractAddress);
    console.log(`Relayer contract token balance: ${ethers.formatUnits(relayerBalance, 6)} USDT`);

    if (relayerBalance < amount) {
      console.error(
        `Insufficient token balance in relayer contract. Required: ${ethers.formatUnits(
          amount,
          6
        )}, Available: ${ethers.formatUnits(relayerBalance, 6)}`
      );
      console.error("Please transfer tokens to the relayer contract first.");
      process.exit(1);
    }

    // 2. Get Wormhole message fee
    console.log("\n--- Fetching Wormhole Message Fee ---");
    const messageFee = await relayerContract.getMessageFee();
    console.log(`Required message fee: ${ethers.formatEther(messageFee)} ETH`);

    // 3. Call bridgeOut function
    console.log("\n--- Executing Bridge Transaction ---");
    console.log("Calling bridgeOut...");

    console.log(`\n--- Debug Info ---`);
    console.log(`Token Address: ${tokenAddress}`);
    console.log(`Amount: ${amount}`);
    console.log(`Destination Chain ID: ${destinationChainId}`);
    console.log(`Recipient: ${recipient}`);
    console.log(`Message Fee: ${messageFee}`);

    // Check if contract exists and has code
    const code = await ethers.provider.getCode(relayerContractAddress);
    console.log(`Contract code length: ${code.length}`);
    if (code === '0x') {
      console.error('❌ Contract not found at address!');
      process.exit(1);
    }

    // Log first 200 characters of bytecode to identify contract type
    console.log(`Contract bytecode (first 200 chars): ${code.substring(0, 200)}...`);

    // Check what functions the contract actually has
    console.log('\n--- Checking contract functions ---');
    const functionSignatures = [
      '0x8ba9f35e', // bridgeOut(address,uint256,uint16,bytes32)
      '0x6ea056a9', // getMessageFee()
      '0x70a08231', // balanceOf(address)
    ];

    for (const sig of functionSignatures) {
      try {
        const result = await ethers.provider.call({
          to: relayerContractAddress,
          data: sig + '0000000000000000000000000000000000000000000000000000000000000000' // padded call
        });
        console.log(`✅ Function ${sig} exists`);
      } catch (error) {
        console.log(`❌ Function ${sig} does not exist or failed`);
      }
    }

    // Try to call a simple view function to test contract connectivity
    try {
      const fee = await relayerContract.getMessageFee();
      console.log(`✅ Contract is responsive. Message fee: ${ethers.formatEther(fee)} ETH`);
    } catch (error) {
      console.error('❌ Contract not responding to getMessageFee:', error.message);
      process.exit(1);
    }

    // Test individual steps before the main transaction
    console.log("\n--- Pre-flight Checks ---");

    // Check if we can call the contract functions individually
    try {
      // Test the balance check that the contract does
      const contractBalance = await token.balanceOf(relayerContractAddress);
      console.log(`Contract balance check: ${ethers.formatUnits(contractBalance, 6)} USDT`);

      if (contractBalance < amount) {
        console.error("❌ Contract balance check failed!");
        process.exit(1);
      }

      console.log("✅ Contract balance check passed");
    } catch (error) {
      console.error("❌ Error checking contract balance:", error.message);
      process.exit(1);
    }

    // Try to estimate gas first
    
    console.log("\n--- Gas Estimation ---");
    try {
      const gasEstimate = await relayerContract.bridgeOut.estimateGas(
        tokenAddress,
        amount,
        destinationChainId,
        recipient,
        {
          value: messageFee,
          gasLimit: 500000, // Set a reasonable gas limit
        }
      );
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log("❌ Gas estimation failed:", error.message);
      if (error.data) {
        console.log("Error data:", error.data);
      }
    }

    // Add 5-second delay before executing the transaction
    console.log("\n--- Adding 5-second delay before transaction ---");
    console.log("Waiting 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log("Delay completed. Proceeding with transaction...");

    const tx = await relayerContract.bridgeOut(
      tokenAddress,
      amount,
      destinationChainId,
      recipient,
      {
        value: messageFee, // Pay the Wormhole message fee
        gasLimit: 1000000, // Increased gas limit
      }
    );

    console.log(`Transaction sent! Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();

    if (receipt.status === 0) {
      console.log("❌ Transaction reverted! Let's debug what went wrong...");

      // Try to simulate the call to get the revert reason
      /*
      try {
        await relayerContract.callStatic.bridgeOut(
          tokenAddress,
          amount,
          destinationChainId,
          recipient,
          {
            value: messageFee,
          }
        );
      } catch (error) {
        console.log("Revert reason:", error.message);
        if (error.data) {
          console.log("Error data:", error.data);
        }
      }
      */
      process.exit(1);
    }

    console.log("Transaction confirmed.");
    console.log(`Block number: ${receipt.blockNumber}`);

    // 5. Transaction completed successfully
    console.log("\n--- Transaction Events ---");
    console.log("Bridge transaction completed successfully!");
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log("\n🎉 Bridge transaction completed successfully!");
    console.log("The tokens have been bridged to the destination chain.");
    console.log("Monitor the transaction hash on Wormhole Scan to track the VAA.");
  } catch (error) {
    console.error("\n❌ Error executing bridgeOut:", error);

    // Parse common error messages
    if (error.message.includes("insufficient funds")) {
      console.error(
        "Insufficient ETH balance to pay for gas and Wormhole fee."
      );
    } else if (error.message.includes("Insufficient balance")) {
      console.error("Relayer contract doesn't have enough tokens to bridge.");
    } else if (error.message.includes("Amount must be greater than 0")) {
      console.error("Bridge amount must be greater than 0.");
    } else if (error.message.includes("Insufficient fee")) {
      console.error("Insufficient ETH to pay Wormhole message fee.");
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
