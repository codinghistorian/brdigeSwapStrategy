const { ethers } = require("hardhat");
require("dotenv").config();

// Contract configuration
const CONTRACT_ADDRESS = "0x12f0012a5f8256935FEA24EB03A072CE5E12857B"; // MinimalWormholeRelayerV2

// Token addresses
const USDTWH_ADDRESS = "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc"; // USDTwh
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; // USDT
const EOS_ADDRESS = "0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6"; // EOS

// Swap configuration
const AMOUNT_TO_SWAP = "500000"; // 1 USDTwh (6 decimals)
const SLIPPAGE_TOLERANCE = 1; // 0.05; // 5% slippage tolerance
const SWAP_PATH = [
  { address: USDTWH_ADDRESS, symbol: "USDTwh" },
  { address: USDT_ADDRESS, symbol: "USDT" },
  { address: EOS_ADDRESS, symbol: "EOS" },
];
const FEES = [100, 2500]; // 0.01% for USDTwh/USDT, 0.25% for USDT/EOS

// Contract ABI
const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "path", type: "bytes" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
    ],
    name: "swapExactInput",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // Custom errors
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "InvalidAmount",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "available", type: "uint256" },
    ],
    name: "InsufficientBalance",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "expected", type: "uint256" },
      { internalType: "uint256", name: "received", type: "uint256" },
    ],
    name: "InsufficientOutput",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidPath",
    type: "error",
  },
];

// ERC20 ABI for balance and allowance checks
const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

// PancakeSwap V3 Factory ABI for pool verification
const FACTORY_ADDRESS = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // Pancake V3 factory
const FACTORY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" }
    ],
    name: "getPool",
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

// Pool ABI for liquidity check
const POOL_ABI = [
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
];

// Helper function to encode multi-hop path
function encodeMultiHopPath(tokens, fees) {
  if (tokens.length !== fees.length + 1) {
    throw new Error("Invalid path: number of tokens must be fees + 1");
  }

  const pathComponents = [];
  const types = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    // Add token address
    pathComponents.push(ethers.getAddress(tokens[i].address));
    types.push("address");

    // Add fee
    pathComponents.push(fees[i]);
    types.push("uint24");
  }

  // Add final token address
  pathComponents.push(ethers.getAddress(tokens[tokens.length - 1].address));
  types.push("address");

  return ethers.solidityPacked(types, pathComponents);
}

// Pool verification function
async function checkPool(tokenA, tokenB, fee, provider) {
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

  try {
    const pool = await factory.getPool(tokenA, tokenB, fee);
    console.log(`Pool ${tokenA}/${tokenB} fee ${(fee / 10000).toFixed(2)}%: ${pool}`);

    if (pool === ethers.ZeroAddress) {
      console.log(`❌ Pool does not exist`);
      return { exists: false, hasLiquidity: false, address: pool };
    }

    const poolContract = new ethers.Contract(pool, POOL_ABI, provider);
    const liquidity = await poolContract.liquidity();
    console.log(`  ✅ Liquidity: ${liquidity.toString()}`);

    return {
      exists: true,
      hasLiquidity: liquidity > 0n,
      address: pool,
      liquidity: liquidity
    };
  } catch (error) {
    console.log(`❌ Error checking pool: ${error.message}`);
    return { exists: false, hasLiquidity: false, error: error.message };
  }
}

// Error decoding helper
function decodeError(error, contractInterface) {
  if (!error.data) return null;

  try {
    const decoded = contractInterface.parseError(error.data);
    return {
      name: decoded.name,
      args: decoded.args,
      decoded: true,
    };
  } catch (e) {
    return {
      name: "Unknown",
      data: error.data,
      decoded: false,
    };
  }
}

// Format readable error message
function formatErrorMessage(error, contractInterface) {
  const decoded = decodeError(error, contractInterface);

  if (!decoded || !decoded.decoded) {
    return error.message;
  }

  switch (decoded.name) {
    case "InvalidAmount":
      return `Invalid amount: ${decoded.args[0]}`;
    case "InsufficientBalance":
      return `Insufficient balance in token ${decoded.args[0]}. Required: ${decoded.args[1]}, Available: ${decoded.args[2]}`;
    case "InsufficientOutput":
      return `Insufficient output. Expected: ${decoded.args[0]}, Received: ${decoded.args[1]}`;
    case "InvalidPath":
      return "Invalid swap path provided";
    default:
      return `Custom error ${decoded.name}: ${JSON.stringify(decoded.args)}`;
  }
}

async function main() {
  console.log("=== PancakeSwap V3 Multi-Hop Swap: USDTwh -> USDT -> EOS ===\n");

  // Setup signer
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);

  // Create contract instances
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tokenIn = new ethers.Contract(
    USDTWH_ADDRESS,
    ERC20_ABI,
    ethers.provider
  );
  const tokenOut = new ethers.Contract(EOS_ADDRESS, ERC20_ABI, ethers.provider);

  console.log("--- Pre-flight Checks ---");

  // Check if contract exists
  const contractCode = await ethers.provider.getCode(CONTRACT_ADDRESS);
  if (contractCode === "0x") {
    throw new Error(`Contract not found at address ${CONTRACT_ADDRESS}`);
  }
  console.log(`✅ Contract exists at ${CONTRACT_ADDRESS}`);

  // Check owner
  try {
    const owner = await contract.owner();
    console.log(`Contract owner: ${owner}`);
    console.log(
      `Signer is owner: ${owner.toLowerCase() === signer.address.toLowerCase()}`
    );

    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(
        "⚠️ Warning: Signer is not the contract owner. Function calls will fail due to onlyOwner modifier."
      );
    }
  } catch (error) {
    console.log("❌ Could not verify contract owner:", error.message);
  }

  // Verify token contracts exist
  const tokenInCode = await ethers.provider.getCode(USDTWH_ADDRESS);
  const tokenOutCode = await ethers.provider.getCode(EOS_ADDRESS);

  if (tokenInCode === "0x") {
    throw new Error(`TokenIn contract not found at ${USDTWH_ADDRESS}`);
  }
  if (tokenOutCode === "0x") {
    throw new Error(`TokenOut contract not found at ${EOS_ADDRESS}`);
  }
  console.log(`✅ All token contracts exist`);

  console.log("\n--- Token Information ---");

  // Get token information
  let tokenInDecimals, tokenOutDecimals, tokenInSymbol, tokenOutSymbol;
  try {
    tokenInDecimals = await tokenIn.decimals();
    tokenInSymbol = await tokenIn.symbol();
    tokenOutDecimals = await tokenOut.decimals();
    tokenOutSymbol = await tokenOut.symbol();

    console.log(`TokenIn: ${tokenInSymbol} (${tokenInDecimals} decimals)`);
    console.log(`TokenOut: ${tokenOutSymbol} (${tokenOutDecimals} decimals)`);
  } catch (error) {
    console.log(`❌ Could not get token information: ${error.message}`);
    // Use fallbacks
    tokenInDecimals = 6; // USDTwh
    tokenOutDecimals = 18; // EOS
    tokenInSymbol = "USDTwh";
    tokenOutSymbol = "EOS";
  }

  // Encode multi-hop path
  const encodedPath = encodeMultiHopPath(SWAP_PATH, FEES);
  console.log(`\nSwap Path: ${SWAP_PATH.map((t) => t.symbol).join(" -> ")}`);
  console.log(`Fees: ${FEES.map((f) => `${f / 10000}%`).join(", ")}`);
  console.log(`Encoded Path: ${encodedPath}`);

  // Check balances before swap
  console.log("\n--- Contract Balances Before Swap ---");

  let tokenInBalance, tokenOutBalance;
  try {
    tokenInBalance = await tokenIn.balanceOf(CONTRACT_ADDRESS);
    tokenOutBalance = await tokenOut.balanceOf(CONTRACT_ADDRESS);

    console.log(
      `${tokenInSymbol} Balance: ${ethers.formatUnits(
        tokenInBalance,
        tokenInDecimals
      )}`
    );
    console.log(
      `${tokenOutSymbol} Balance: ${ethers.formatUnits(
        tokenOutBalance,
        tokenOutDecimals
      )}`
    );
  } catch (error) {
    console.log(`❌ Could not get token balances: ${error.message}`);
    throw error;
  }

  // Verify sufficient balance
  const amountIn = BigInt(AMOUNT_TO_SWAP);
  if (tokenInBalance < amountIn) {
    throw new Error(
      `Insufficient balance. Has: ${ethers.formatUnits(
        tokenInBalance,
        tokenInDecimals
      )}, Needs: ${ethers.formatUnits(amountIn, tokenInDecimals)}`
    );
  }

  console.log(
    `\n✅ Ready to swap ${ethers.formatUnits(
      amountIn,
      tokenInDecimals
    )} ${tokenInSymbol}`
  );

  // Calculate minimum amount out (with slippage tolerance)
  // This is a simplified calculation - in production you'd want to get a quote first
  const estimatedAmountOut = ethers.parseUnits("0.01", tokenOutDecimals); // Conservative estimate
  const amountOutMinimum =
    (estimatedAmountOut * BigInt(Math.floor((1 - SLIPPAGE_TOLERANCE) * 1000))) /
    BigInt(1000);

  console.log(
    `Amount Out Minimum: ${ethers.formatUnits(
      amountOutMinimum,
      tokenOutDecimals
    )} ${tokenOutSymbol}`
  );

  // Verify pools exist and have liquidity before attempting swap
  console.log("\n--- Pool Verification ---");

  const poolChecks = [];

  // Check each hop in the path
  for (let i = 0; i < SWAP_PATH.length - 1; i++) {
    const tokenA = SWAP_PATH[i].address;
    const tokenB = SWAP_PATH[i + 1].address;
    const fee = FEES[i];

    console.log(`\nChecking hop ${i + 1}: ${SWAP_PATH[i].symbol} → ${SWAP_PATH[i + 1].symbol}`);
    const poolCheck = await checkPool(tokenA, tokenB, fee, ethers.provider);
    poolChecks.push(poolCheck);

    if (!poolCheck.exists) {
      console.log(`⚠️ Pool ${SWAP_PATH[i].symbol}/${SWAP_PATH[i + 1].symbol} does not exist at fee ${(fee / 10000).toFixed(2)}%`);
    } else if (!poolCheck.hasLiquidity) {
      console.log(`⚠️ Pool ${SWAP_PATH[i].symbol}/${SWAP_PATH[i + 1].symbol} exists but has zero liquidity`);
    } else {
      console.log(`✅ Pool ${SWAP_PATH[i].symbol}/${SWAP_PATH[i + 1].symbol} is ready for trading`);
    }
  }

  // Check if any pools are problematic
  const problematicPools = poolChecks.filter(check => !check.exists || !check.hasLiquidity);
  if (problematicPools.length > 0) {
    console.log(`\n⚠️ Warning: ${problematicPools.length} pool(s) may cause swap to fail`);
    console.log("Consider adjusting fee tiers or routing through different paths:");
    console.log("- Try fee 500 or 10000 for USDT↔EOS");
    console.log("- Route via WBNB: USDTwh → USDT → WBNB → EOS");
    console.log("- Route via BUSD: USDTwh → USDT → BUSD → EOS");
  } else {
    console.log("\n✅ All pools verified and ready for swap");
  }

  try {
    // Estimate gas
    console.log("\n--- Gas Estimation ---");
    try {
      const gasEstimate = await contract.swapExactInput.estimateGas(
        encodedPath,
        amountIn,
        amountOutMinimum
      );
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (gasError) {
      console.log(`❌ Gas estimation failed: ${gasError.message}`);

      // Try to get more detailed error information
      const contractInterface = new ethers.Interface(CONTRACT_ABI);
      const readableError = formatErrorMessage(gasError, contractInterface);
      console.log(`Detailed error: ${readableError}`);
    }

    // Get current nonce from network to avoid nonce issues
    console.log("\n--- Fetching Current Nonce ---");
    const currentNonce = await signer.getNonce();
    console.log(`Current nonce: ${currentNonce}`);

    // Execute swap
    console.log("\n--- Executing Multi-Hop Swap ---");

    const tx = await contract.swapExactInput(
      encodedPath,
      amountIn,
      amountOutMinimum,
      {
        gasLimit: 300000, // Set reasonable gas limit for multi-hop swap
        nonce: currentNonce, // Explicitly set nonce to avoid conflicts
      }
    );

    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Check balances after swap
    console.log("\n--- Contract Balances After Swap ---");

    const tokenInBalanceAfter = await tokenIn.balanceOf(CONTRACT_ADDRESS);
    const tokenOutBalanceAfter = await tokenOut.balanceOf(CONTRACT_ADDRESS);

    console.log(
      `${tokenInSymbol} Balance: ${ethers.formatUnits(
        tokenInBalanceAfter,
        tokenInDecimals
      )}`
    );
    console.log(
      `${tokenOutSymbol} Balance: ${ethers.formatUnits(
        tokenOutBalanceAfter,
        tokenOutDecimals
      )}`
    );

    // Calculate actual amounts
    const actualAmountIn = tokenInBalance - tokenInBalanceAfter;
    const actualAmountOut = tokenOutBalanceAfter - tokenOutBalance;

    console.log(`\n--- Swap Results ---`);
    console.log(
      `Actual Amount In: ${ethers.formatUnits(
        actualAmountIn,
        tokenInDecimals
      )} ${tokenInSymbol}`
    );
    console.log(
      `Actual Amount Out: ${ethers.formatUnits(
        actualAmountOut,
        tokenOutDecimals
      )} ${tokenOutSymbol}`
    );

    // Calculate effective price
    if (actualAmountOut > 0n) {
      const effectivePrice = (
        Number(ethers.formatUnits(actualAmountIn, tokenInDecimals)) /
        Number(ethers.formatUnits(actualAmountOut, tokenOutDecimals))
      ).toFixed(6);
      console.log(
        `Effective Price: ${effectivePrice} ${tokenInSymbol} per ${tokenOutSymbol}`
      );
    }

    console.log(`\n✅ Multi-hop swap executed successfully!`);
    console.log("-------------------------------------------");
  } catch (error) {
    console.error("\n❌ Swap execution failed:", error.message);

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

    // Try to decode the error if it's a contract error
    if (error.data) {
      try {
        const contractInterface = new ethers.Interface(CONTRACT_ABI);
        const readableError = formatErrorMessage(error, contractInterface);
        console.error("Contract error:", readableError);
      } catch (decodeError) {
        console.error("Raw error data:", error.data);
      }
    }

    // Try static call to get more detailed error
    try {
      console.log("\n--- Attempting Static Call for Error Details ---");
      await contract.swapExactInput.staticCall(
        encodedPath,
        amountIn,
        amountOutMinimum
      );
    } catch (staticError) {
      console.error("Static call error:", staticError.message);

      const contractInterface = new ethers.Interface(CONTRACT_ABI);
      const readableStaticError = formatErrorMessage(
        staticError,
        contractInterface
      );
      console.error("Detailed static error:", readableStaticError);
    }

    throw error;
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
