const { ethers } = require("hardhat");
require("dotenv").config();

// Contract configuration
const CONTRACT_ADDRESS = "0xe91E965Ff0039531aD339BD543E07A87ae0E474b";

// Withdrawal parameters
const TOKEN_ADDRESS = "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc"; // USDTwh
// const TOKEN_ADDRESS = "0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6"; // EOS
const AMOUNT = "500000"; // 0.5 USDTwh (6 decimals)
// const AMOUNT = "1000000"; // 1 USDTwh
// const AMOUNT = "990727525767458969"; // EOS (18 decimals)

// Contract ABI
const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// ERC20 ABI
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];

// Utility function to retry transaction with fresh nonce
async function retryTransactionWithFreshNonce(contract, method, params, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n--- Transaction Attempt ${attempt}/${maxRetries} ---`);

      // Get fresh nonce for each attempt
      const signer = contract.runner;
      const freshNonce = await signer.getNonce();
      console.log(`Fresh nonce for attempt ${attempt}: ${freshNonce}`);

      // Merge options with fresh nonce
      const txOptions = {
        ...options,
        nonce: freshNonce,
      };

      // Execute transaction
      const tx = await contract[method](...params, txOptions);
      console.log(`Transaction hash: ${tx.hash}`);

      return tx;
    } catch (error) {
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw new Error(`Transaction failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait a bit before retrying
      console.log(`Waiting 2 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  console.log("=== Token Withdrawal from Contract ===\n");

  // Setup signer
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);

  // Create contract instances
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, ethers.provider);

  // Get token decimals for formatting
  const tokenDecimals = await token.decimals();

  // Check balances before withdrawal
  const contractBalanceBefore = await token.balanceOf(CONTRACT_ADDRESS);
  const signerBalanceBefore = await token.balanceOf(signer.address);

  console.log("Balances Before Withdrawal:");
  console.log(
    `Contract balance: ${ethers.formatUnits(
      contractBalanceBefore,
      tokenDecimals
    )} USDTwh`
  );
  console.log(
    `Signer balance: ${ethers.formatUnits(
      signerBalanceBefore,
      tokenDecimals
    )} USDTwh\n`
  );

  // Verify sufficient balance in contract
  if (contractBalanceBefore < BigInt(AMOUNT)) {
    throw new Error(
      `Insufficient balance in contract. Has: ${ethers.formatUnits(
        contractBalanceBefore,
        tokenDecimals
      )}, Needs: ${ethers.formatUnits(AMOUNT, tokenDecimals)}`
    );
  }

  console.log(
    `Withdrawing ${ethers.formatUnits(
      AMOUNT,
      tokenDecimals
    )} USDTwh from contract\n`
  );

  try {
    // Gas estimation before executing withdrawal
    console.log("--- Gas Estimation ---");
    try {
      const gasEstimate = await contract.withdraw.estimateGas(
        TOKEN_ADDRESS,
        AMOUNT
      );
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log("❌ Gas estimation failed:", error.message);
      if (error.data) {
        console.log("Error data:", error.data);
      }
      throw error; // Don't proceed if gas estimation fails
    }

    // Execute withdrawal with retry mechanism for nonce handling
    console.log("\n--- Executing Withdrawal ---");
    const tx = await retryTransactionWithFreshNonce(
      contract,
      "withdraw",
      [TOKEN_ADDRESS, AMOUNT],
      { gasLimit: 200000 },
      3 // max retries
    );

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Withdrawal completed (Block: ${receipt.blockNumber})`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Check balances after withdrawal
    const contractBalanceAfter = await token.balanceOf(CONTRACT_ADDRESS);
    const signerBalanceAfter = await token.balanceOf(signer.address);

    console.log("Balances After Withdrawal:");
    console.log(
      `Contract balance: ${ethers.formatUnits(
        contractBalanceAfter,
        tokenDecimals
      )} USDTwh`
    );
    console.log(
      `Signer balance: ${ethers.formatUnits(
        signerBalanceAfter,
        tokenDecimals
      )} USDTwh\n`
    );

    // Calculate changes
    const contractChange = contractBalanceBefore - contractBalanceAfter;
    const signerChange = signerBalanceAfter - signerBalanceBefore;

    console.log("Changes:");
    console.log(
      `Withdrawn from contract: ${ethers.formatUnits(
        contractChange,
        tokenDecimals
      )} USDTwh`
    );
    console.log(
      `Received by signer: ${ethers.formatUnits(
        signerChange,
        tokenDecimals
      )} USDTwh`
    );

    // Verify the amounts match
    if (contractChange.toString() === signerChange.toString()) {
      console.log("✅ Withdrawal amounts match perfectly!");
    } else {
      console.log("⚠️ Warning: Withdrawal amounts don't match");
    }
  } catch (error) {
    console.error("❌ Withdrawal failed:");
    console.error(error.message);
    if (error.data) {
      console.error(`Error data: ${error.data}`);
    }

    // Handle nonce-related errors specifically
    if (error.message.includes("nonce too low") || error.message.includes("nonce")) {
      console.log("\n--- Nonce Error Detected ---");
      console.log("This usually happens when:");
      console.log("1. Previous transactions are still pending");
      console.log("2. Multiple scripts are running simultaneously");
      console.log("3. Network congestion causing nonce desynchronization");
      console.log("\nTry running the script again in a few seconds.");
      console.log("If the issue persists, check for pending transactions in your wallet.");
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
