const { JsonRpcProvider, Wallet, ethers, Contract } = require("ethers");
const swapConfig = require("./swap.json");
require("dotenv").config();

// Strategy contract configuration
const STRATEGY_CONTRACT_ADDRESS = "0xf90e6E8E1faFFCf4a204e45b3806390a877fcd7B"; // mainnet

const { tokens: tokensConfig, pools: poolsConfig } = swapConfig;

// Helper function to find the fee for a given pair of tokens
function getFee(tokenA_symbol, tokenB_symbol) {
  const pool = poolsConfig.find(
    (p) => p.tokens.includes(tokenA_symbol) && p.tokens.includes(tokenB_symbol)
  );
  if (!pool) {
    throw new Error(`Pool not found for ${tokenA_symbol}/${tokenB_symbol}`);
  }
  return pool.fee;
}

async function main() {
  // --- Configuration ---
  const TOKEN_IN_SYMBOL = "USDC";
  const TOKEN_OUT_SYMBOL = "USDT";
  const AMOUNT_TO_SWAP = "0.001"; // 0.1 USDC
  // const SLIPPAGE_TOLERANCE = 0.005; // 0.5% slippage tolerance
  const SLIPPAGE_TOLERANCE = 1; // 100% slippage tolerance

  // -------------------

  const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  const wallet = new Wallet(process.env.MAIN_NET_PK, provider);

  console.log(`Using signer: ${wallet.address}`);
  console.log(`Strategy contract: ${STRATEGY_CONTRACT_ADDRESS}`);

  const tokenIn = tokensConfig[TOKEN_IN_SYMBOL];
  const tokenOut = tokensConfig[TOKEN_OUT_SYMBOL];

  if (!tokenIn || !tokenOut) {
    console.error(
      `Token configuration not found for ${TOKEN_IN_SYMBOL} or ${TOKEN_OUT_SYMBOL}`
    );
    process.exit(1);
  }

  const amountIn = ethers.parseUnits(AMOUNT_TO_SWAP, tokenIn.decimals);
  const fee = getFee(TOKEN_IN_SYMBOL, TOKEN_OUT_SYMBOL);

  console.log(`\n--- Executing Single Hop Swap via Strategy Contract ---`);
  console.log(`From: ${tokenIn.symbol} (${tokenIn.address})`);
  console.log(`To: ${tokenOut.symbol} (${tokenOut.address})`);
  console.log(`Amount In: ${AMOUNT_TO_SWAP} ${tokenIn.symbol}`);
  console.log(`Pool Fee: ${fee / 10000}%`);

  const strategyContractAbi = [
    "function swapExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function REPORTING_MANAGER() view returns (bytes32)",
    "function underlyingToken() view returns (address)",
  ];

  const strategyContract = new Contract(
    STRATEGY_CONTRACT_ADDRESS,
    strategyContractAbi,
    wallet
  );

  try {
    // Verify signer has the REPORTING_MANAGER role
    const reportingManagerRole = await strategyContract.REPORTING_MANAGER();
    const hasReportingManager = await strategyContract.hasRole(
      reportingManagerRole,
      wallet.address
    );
    console.log(`Signer has REPORTING_MANAGER role? ${hasReportingManager}`);

    if (!hasReportingManager) {
      console.error(
        "Error: signer does not have REPORTING_MANAGER role. Aborting."
      );
      process.exit(1);
    }

    // Get underlying token to understand the swap direction
    const underlyingToken = await strategyContract.underlyingToken();
    console.log(`Strategy underlying token: ${underlyingToken}`);

    const isBuyOperation =
      tokenIn.address.toLowerCase() === underlyingToken.toLowerCase();
    const isSellOperation =
      tokenOut.address.toLowerCase() === underlyingToken.toLowerCase();

    console.log(
      `Operation type: ${
        isBuyOperation ? "BUY" : isSellOperation ? "SELL" : "CROSS-ASSET"
      }`
    );

    // Get quote for minimum amount out (using simple slippage calculation)
    // In production, you'd want to get a real quote from Uniswap
    const estimatedAmountOut = ethers.parseUnits("0.000003", tokenOut.decimals); // Very conservative estimate
    const amountOutMinimum =
      (estimatedAmountOut *
        BigInt(Math.floor((1 - SLIPPAGE_TOLERANCE) * 1000))) /
      BigInt(1000);

    console.log(
      `Amount out minimum: ${ethers.formatUnits(
        amountOutMinimum,
        tokenOut.decimals
      )} ${tokenOut.symbol}`
    );

    console.log(`\nExecuting swap...`);
    const tx = await strategyContract.swapExactInputSingle(
      ethers.getAddress(tokenIn.address),
      ethers.getAddress(tokenOut.address),
      fee,
      amountIn,
      amountOutMinimum,
      0, // sqrtPriceLimitX96 - 0 means no price limit
      {
        gasLimit: 500000, // Set reasonable gas limit
      }
    );

    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    // Parse events from the receipt
    const swappedEvent = receipt.logs.find((log) => {
      try {
        const decoded = strategyContract.interface.parseLog(log);
        return decoded && decoded.name === "Swapped";
      } catch (e) {
        return false;
      }
    });

    if (swappedEvent) {
      const decoded = strategyContract.interface.parseLog(swappedEvent);
      const actualAmountIn = decoded.args.amountIn;
      const actualAmountOut = decoded.args.amountOut;

      console.log(`\n--- Swap Results ---`);
      console.log(
        `Actual Amount In: ${ethers.formatUnits(
          actualAmountIn,
          tokenIn.decimals
        )} ${tokenIn.symbol}`
      );
      console.log(
        `Actual Amount Out: ${ethers.formatUnits(
          actualAmountOut,
          tokenOut.decimals
        )} ${tokenOut.symbol}`
      );

      // Calculate effective price
      const effectivePrice = (
        Number(ethers.formatUnits(actualAmountIn, tokenIn.decimals)) /
        Number(ethers.formatUnits(actualAmountOut, tokenOut.decimals))
      ).toFixed(2);
      console.log(
        `Effective Price: ${effectivePrice} ${tokenIn.symbol} per ${tokenOut.symbol}`
      );
    }

    console.log(`\n✅ Swap executed successfully!`);
    console.log("-------------------------------------------");
  } catch (error) {
    console.error("Error executing swap:", error);

    // Try to decode the error if it's a contract error
    if (error.data) {
      try {
        const decoded = strategyContract.interface.parseError(error.data);
        console.error("Contract error:", decoded);
      } catch (decodeError) {
        console.error("Raw error data:", error.data);
      }
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
