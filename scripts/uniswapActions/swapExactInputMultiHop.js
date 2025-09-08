const { JsonRpcProvider, Wallet, ethers, Contract } = require("ethers");
const swapConfig = require("./swap.json");
require("dotenv").config();

// Strategy contract configuration
const STRATEGY_CONTRACT_ADDRESS = "0x536eFD341e6B17798c52a201B4A87a961f0dC159"; // mainnet

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
  // const TOKEN_IN_SYMBOL = "USDC";
  // const TOKEN_OUT_SYMBOL = "TRX";
  // const AMOUNT_TO_SWAP = "1"; // 1 USDC
  // // const SLIPPAGE_TOLERANCE = 0.005; // 0.5% slippage tolerance
  // const SLIPPAGE_TOLERANCE = 1; // 100% slippage tolerance
  // const SWAP_PATH = ["USDC", "WETH", "TRX"]; // Multi-hop path

  // -------------------

  // --- Configuration ---
  const TOKEN_IN_SYMBOL = "TRX";
  const TOKEN_OUT_SYMBOL = "USDC";
  const AMOUNT_TO_SWAP = "1.3204"; // 1 USDC
  // const SLIPPAGE_TOLERANCE = 0.005; // 0.5% slippage tolerance
  const SLIPPAGE_TOLERANCE = 1; // 100% slippage tolerance
  const SWAP_PATH = ["TRX", "WETH", "USDC"]; // Multi-hop path

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

  // Encode multi-hop path: USDC -> WETH -> TRX
  const pathComponents = [];
  for (let i = 0; i < SWAP_PATH.length - 1; i++) {
    pathComponents.push(ethers.getAddress(tokensConfig[SWAP_PATH[i]].address));
    pathComponents.push(getFee(SWAP_PATH[i], SWAP_PATH[i + 1]));
  }
  pathComponents.push(
    ethers.getAddress(tokensConfig[SWAP_PATH[SWAP_PATH.length - 1]].address)
  );

  const types = [];
  for (let i = 0; i < pathComponents.length; i++) {
    types.push(i % 2 === 0 ? "address" : "uint24");
  }

  const encodedPath = ethers.solidityPacked(types, pathComponents);

  console.log(`\n--- Executing Multi-Hop Swap via Strategy Contract ---`);
  console.log(`From: ${tokenIn.symbol} (${tokenIn.address})`);
  console.log(`To: ${tokenOut.symbol} (${tokenOut.address})`);
  console.log(`Amount In: ${AMOUNT_TO_SWAP} ${tokenIn.symbol}`);
  console.log(`Path: ${SWAP_PATH.join(" -> ")}`);
  console.log(`Encoded Path: ${encodedPath}`);

  const strategyContractAbi = [
    "function swapExactInputMultiHop(bytes memory path, uint256 amountIn, uint256 amountOutMinimum) returns (uint256 amountOut)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function REPORTING_MANAGER() view returns (bytes32)",
    "function underlyingToken() view returns (address)",
    "function assetLedger(address) view returns (uint256 totalBought, uint256 totalSold, uint256 underlyingSpentOnBuys, uint256 underlyingReceivedOnSells)",
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

    // Check asset ledger before swap
    const ledgerBefore = await strategyContract.assetLedger(
      isBuyOperation ? tokenOut.address : tokenIn.address
    );

    console.log(`\n--- Asset Ledger Before Swap ---`);
    if (isBuyOperation) {
      console.log(
        `${tokenOut.symbol} Total Bought: ${ethers.formatUnits(
          ledgerBefore.totalBought,
          tokenOut.decimals
        )}`
      );
      console.log(
        `${tokenOut.symbol} Underlying Spent: ${ethers.formatUnits(
          ledgerBefore.underlyingSpentOnBuys,
          tokenIn.decimals
        )}`
      );
    } else if (isSellOperation) {
      console.log(
        `${tokenIn.symbol} Total Sold: ${ethers.formatUnits(
          ledgerBefore.totalSold,
          tokenIn.decimals
        )}`
      );
      console.log(
        `${tokenIn.symbol} Underlying Received: ${ethers.formatUnits(
          ledgerBefore.underlyingReceivedOnSells,
          tokenOut.decimals
        )}`
      );
    }

    console.log(`\nExecuting multi-hop swap...`);
    const tx = await strategyContract.swapExactInputMultiHop(
      encodedPath,
      amountIn,
      amountOutMinimum,
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

    // Check asset ledger after swap
    const ledgerAfter = await strategyContract.assetLedger(
      isBuyOperation ? tokenOut.address : tokenIn.address
    );

    console.log(`\n--- Asset Ledger After Swap ---`);
    if (isBuyOperation) {
      console.log(
        `${tokenOut.symbol} Total Bought: ${ethers.formatUnits(
          ledgerAfter.totalBought,
          tokenOut.decimals
        )}`
      );
      console.log(
        `${tokenOut.symbol} Underlying Spent: ${ethers.formatUnits(
          ledgerAfter.underlyingSpentOnBuys,
          tokenIn.decimals
        )}`
      );
    } else if (isSellOperation) {
      console.log(
        `${tokenIn.symbol} Total Sold: ${ethers.formatUnits(
          ledgerAfter.totalSold,
          tokenIn.decimals
        )}`
      );
      console.log(
        `${tokenIn.symbol} Underlying Received: ${ethers.formatUnits(
          ledgerAfter.underlyingReceivedOnSells,
          tokenOut.decimals
        )}`
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
