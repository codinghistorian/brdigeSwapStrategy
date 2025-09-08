const { JsonRpcProvider, Wallet, ethers, Contract } = require("ethers");
const swapConfig = require("./swap.json");
require("dotenv").config();

// Strategy contract configuration
const STRATEGY_CONTRACT_ADDRESS = "0xD4597d6358F0533337022579147972F432553Bf0"; // mainnet

const { tokens: tokensConfig } = swapConfig;

async function main() {
  // --- Configuration ---
  const TOKENS_TO_CHECK = ["TRX", "WBTC"]; // Tokens you've bought
  // -------------------

  const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  const wallet = new Wallet(process.env.MAIN_NET_PK, provider);

  console.log(`Using signer: ${wallet.address}`);
  console.log(`Strategy contract: ${STRATEGY_CONTRACT_ADDRESS}`);

  const strategyContractAbi = [
    "function assetLedger(address) view returns (uint256 totalBought, uint256 totalSold, uint256 underlyingSpentOnBuys, uint256 underlyingReceivedOnSells)",
    "function underlyingToken() view returns (address)",
    "function totalDeposited() view returns (uint256)",
    "function totalWithdrawn() view returns (uint256)",
    "function totalBridgedIn() view returns (uint256)",
    "function totalBridgedOut() view returns (uint256)",
  ];

  const strategyContract = new Contract(
    STRATEGY_CONTRACT_ADDRESS,
    strategyContractAbi,
    provider // Using provider instead of wallet since we're only reading
  );

  try {
    // Get underlying token info
    const underlyingTokenAddress = await strategyContract.underlyingToken();
    const underlyingTokenInfo = Object.values(tokensConfig).find(
      (token) =>
        token.address.toLowerCase() === underlyingTokenAddress.toLowerCase()
    );

    console.log(`\n--- Strategy Overview ---`);
    console.log(
      `Underlying Token: ${
        underlyingTokenInfo ? underlyingTokenInfo.symbol : "Unknown"
      } (${underlyingTokenAddress})`
    );

    // Get strategy totals
    const totalDeposited = await strategyContract.totalDeposited();
    const totalWithdrawn = await strategyContract.totalWithdrawn();
    const totalBridgedIn = await strategyContract.totalBridgedIn();
    const totalBridgedOut = await strategyContract.totalBridgedOut();

    if (underlyingTokenInfo) {
      console.log(
        `Total Deposited: ${ethers.formatUnits(
          totalDeposited,
          underlyingTokenInfo.decimals
        )} ${underlyingTokenInfo.symbol}`
      );
      console.log(
        `Total Withdrawn: ${ethers.formatUnits(
          totalWithdrawn,
          underlyingTokenInfo.decimals
        )} ${underlyingTokenInfo.symbol}`
      );
      console.log(
        `Total Bridged In: ${ethers.formatUnits(
          totalBridgedIn,
          underlyingTokenInfo.decimals
        )} ${underlyingTokenInfo.symbol}`
      );
      console.log(
        `Total Bridged Out: ${ethers.formatUnits(
          totalBridgedOut,
          underlyingTokenInfo.decimals
        )} ${underlyingTokenInfo.symbol}`
      );
    }

    console.log(`\n--- Asset Ledger Report ---`);

    for (const tokenSymbol of TOKENS_TO_CHECK) {
      const tokenInfo = tokensConfig[tokenSymbol];

      if (!tokenInfo) {
        console.error(`Token "${tokenSymbol}" not found in swap.json`);
        continue;
      }

      console.log(`\n🔍 ${tokenInfo.symbol} (${tokenInfo.address})`);

      try {
        const assetRecord = await strategyContract.assetLedger(
          tokenInfo.address
        );

        const totalBought = assetRecord.totalBought;
        const totalSold = assetRecord.totalSold;
        const underlyingSpentOnBuys = assetRecord.underlyingSpentOnBuys;
        const underlyingReceivedOnSells = assetRecord.underlyingReceivedOnSells;

        // Format the numbers with proper decimals
        const formattedTotalBought = ethers.formatUnits(
          totalBought,
          tokenInfo.decimals
        );
        const formattedTotalSold = ethers.formatUnits(
          totalSold,
          tokenInfo.decimals
        );
        const formattedUnderlyingSpent = underlyingTokenInfo
          ? ethers.formatUnits(
              underlyingSpentOnBuys,
              underlyingTokenInfo.decimals
            )
          : underlyingSpentOnBuys.toString();
        const formattedUnderlyingReceived = underlyingTokenInfo
          ? ethers.formatUnits(
              underlyingReceivedOnSells,
              underlyingTokenInfo.decimals
            )
          : underlyingReceivedOnSells.toString();

        console.log(
          `  📈 Total Bought: ${formattedTotalBought} ${tokenInfo.symbol}`
        );
        console.log(
          `  📉 Total Sold: ${formattedTotalSold} ${tokenInfo.symbol}`
        );

        if (underlyingTokenInfo) {
          console.log(
            `  💰 Underlying Spent on Buys: ${formattedUnderlyingSpent} ${underlyingTokenInfo.symbol}`
          );
          console.log(
            `  💵 Underlying Received on Sells: ${formattedUnderlyingReceived} ${underlyingTokenInfo.symbol}`
          );
        } else {
          console.log(
            `  💰 Underlying Spent on Buys: ${formattedUnderlyingSpent} (raw units)`
          );
          console.log(
            `  💵 Underlying Received on Sells: ${formattedUnderlyingReceived} (raw units)`
          );
        }

        // Calculate net position
        const netPosition =
          Number(formattedTotalBought) - Number(formattedTotalSold);
        const netUnderlyingFlow =
          Number(formattedUnderlyingReceived) -
          Number(formattedUnderlyingSpent);

        console.log(
          `  📊 Net Position: ${netPosition.toFixed(6)} ${tokenInfo.symbol}`
        );
        if (underlyingTokenInfo) {
          console.log(
            `  💼 Net Underlying Flow: ${netUnderlyingFlow.toFixed(6)} ${
              underlyingTokenInfo.symbol
            }`
          );
        }

        // Calculate average prices if there were transactions
        if (Number(formattedTotalBought) > 0) {
          const avgBuyPrice =
            Number(formattedUnderlyingSpent) / Number(formattedTotalBought);
          console.log(
            `  📊 Average Buy Price: ${avgBuyPrice.toFixed(6)} ${
              underlyingTokenInfo ? underlyingTokenInfo.symbol : "underlying"
            } per ${tokenInfo.symbol}`
          );
        }

        if (Number(formattedTotalSold) > 0) {
          const avgSellPrice =
            Number(formattedUnderlyingReceived) / Number(formattedTotalSold);
          console.log(
            `  📊 Average Sell Price: ${avgSellPrice.toFixed(6)} ${
              underlyingTokenInfo ? underlyingTokenInfo.symbol : "underlying"
            } per ${tokenInfo.symbol}`
          );
        }

        // Check if there's any activity
        const hasActivity =
          totalBought > 0n ||
          totalSold > 0n ||
          underlyingSpentOnBuys > 0n ||
          underlyingReceivedOnSells > 0n;
        if (!hasActivity) {
          console.log(
            `  ⚪ No trading activity detected for ${tokenInfo.symbol}`
          );
        }
      } catch (error) {
        console.error(
          `  ❌ Error reading asset ledger for ${tokenInfo.symbol}:`,
          error.message
        );
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`✅ Asset ledger report completed`);
    console.log(`📅 Report generated at: ${new Date().toISOString()}`);
    console.log("-------------------------------------------");
  } catch (error) {
    console.error("Error reading accounting data:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
