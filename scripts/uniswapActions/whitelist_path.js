const {
  JsonRpcProvider,
  Wallet,
  ethers,
  solidityPacked,
  Contract,
} = require("ethers");
const swapConfig = require("./swap.json");
require("dotenv").config();

// Strategy contract configuration
const STRATEGY_CONTRACT_ADDRESS = "0x536eFD341e6B17798c52a201B4A87a961f0dC159"; // mainnet

const {
  tokens: tokensConfig,
  pools: poolsConfig,
  swaps: swapsConfig,
} = swapConfig;

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

// Helper function to encode a swap path
function encodeSwapPath(swapPath) {
  const pathComponents = [];
  for (let i = 0; i < swapPath.length - 1; i++) {
    pathComponents.push(ethers.getAddress(tokensConfig[swapPath[i]].address));
    pathComponents.push(getFee(swapPath[i], swapPath[i + 1]));
  }
  pathComponents.push(
    ethers.getAddress(tokensConfig[swapPath[swapPath.length - 1]].address)
  );

  const types = [];
  for (let i = 0; i < pathComponents.length; i++) {
    types.push(i % 2 === 0 ? "address" : "uint24");
  }

  return solidityPacked(types, pathComponents);
}

async function main() {
  // --- Configuration ---
  // Set the name of the swap path to whitelist from swap.json
  // const SWAP_NAME_TO_WHITELIST = "USDC to WBTC (Single Hop)";
  const SWAP_NAME_TO_WHITELIST = "USDC to WBTC (Single Hop)";

  // Set to true to also whitelist the reverse path (e.g., WBTC to USDC)
  const WHITELIST_REVERSE_PATH = true;
  // -------------------

  const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  const wallet = new Wallet(process.env.MAIN_NET_PK, provider);

  console.log(`Using signer: ${wallet.address}`);
  console.log(`Strategy contract: ${STRATEGY_CONTRACT_ADDRESS}`);

  const strategyContractAbi = [
    "function allowSwapPath(bytes memory path)",
    "function isPathAllowed(bytes32 pathHash) view returns (bool)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function ADMIN() view returns (bytes32)",
  ];

  const strategyContract = new Contract(
    STRATEGY_CONTRACT_ADDRESS,
    strategyContractAbi,
    wallet
  );

  try {
    // Verify signer has the ADMIN role
    const adminRole = await strategyContract.ADMIN();
    const hasAdmin = await strategyContract.hasRole(adminRole, wallet.address);
    console.log(`Signer has ADMIN role? ${hasAdmin}`);

    if (!hasAdmin) {
      console.error("Error: signer does not have ADMIN role. Aborting.");
      process.exit(1);
    }

    const swapToWhitelist = swapsConfig.find(
      (s) => s.name === SWAP_NAME_TO_WHITELIST
    );

    if (!swapToWhitelist) {
      console.error(`Swap "${SWAP_NAME_TO_WHITELIST}" not found in swap.json.`);
      const availableSwaps = swapsConfig
        .map((s) => `  - "${s.name}"`)
        .join("\n");
      console.error("\nAvailable swaps:\n" + availableSwaps);
      process.exit(1);
    }

    console.log(`\n--- Whitelisting Swap Path: "${swapToWhitelist.name}" ---`);
    await whitelistPath(strategyContract, swapToWhitelist);

    if (WHITELIST_REVERSE_PATH) {
      const reverseSwap = {
        name: `(REVERSE) ${swapToWhitelist.name}`,
        path: [...swapToWhitelist.path].reverse(),
      };
      console.log(`\n--- Whitelisting Reverse Path: "${reverseSwap.name}" ---`);
      await whitelistPath(strategyContract, reverseSwap);
    }

    console.log("\n✅ Path whitelisting completed successfully!");
    console.log("-------------------------------------------");
  } catch (error) {
    console.error("Error during path whitelisting:", error);
    process.exit(1);
  }
}

async function whitelistPath(strategyContract, swap) {
  try {
    const { name, path: swapPath } = swap;

    if (swapPath.length < 2) {
      console.warn(`\nCannot whitelist "${name}": path is too short.`);
      return;
    }

    const tokenInSymbol = swapPath[0];
    const tokenOutSymbol = swapPath[swapPath.length - 1];

    const tokenIn = tokensConfig[tokenInSymbol];
    const tokenOut = tokensConfig[tokenOutSymbol];

    if (!tokenIn || !tokenOut) {
      throw new Error(
        `Token configuration not found for a token in swap: "${name}"`
      );
    }

    // Encode the swap path
    const encodedPath = encodeSwapPath(swapPath);
    const pathHash = ethers.keccak256(encodedPath);

    console.log(`\nPath details for "${name}":`);
    console.log(`From: ${tokenIn.symbol} (${tokenIn.address})`);
    console.log(`To: ${tokenOut.symbol} (${tokenOut.address})`);
    console.log(`Encoded path: ${encodedPath}`);
    console.log(`Path hash: ${pathHash}`);

    // Check if path is already whitelisted
    const isAlreadyAllowed = await strategyContract.isPathAllowed(pathHash);
    console.log(`Already whitelisted? ${isAlreadyAllowed}`);

    if (isAlreadyAllowed) {
      console.log(`✅ Path "${name}" is already whitelisted.`);
      return;
    }

    // Whitelist the path
    console.log(`Whitelisting path "${name}"...`);
    const tx = await strategyContract.allowSwapPath(encodedPath);
    console.log(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    // Verify the path was whitelisted
    const isNowAllowed = await strategyContract.isPathAllowed(pathHash);
    if (isNowAllowed) {
      console.log(`✅ Path "${name}" successfully whitelisted!`);
    } else {
      console.log(`❌ Path "${name}" whitelisting verification failed.`);
    }

    // Look for the PathAllowed event in the receipt
    const pathAllowedEvent = receipt.logs.find((log) => {
      try {
        const decoded = strategyContract.interface.parseLog(log);
        return decoded && decoded.name === "PathAllowed";
      } catch (e) {
        return false;
      }
    });

    if (pathAllowedEvent) {
      const decoded = strategyContract.interface.parseLog(pathAllowedEvent);
      console.log(
        `📝 PathAllowed event emitted with hash: ${decoded.args.pathHash}`
      );
    }
  } catch (error) {
    console.error(`\nError whitelisting path "${swap.name}":`, error.message);
    throw error;
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
