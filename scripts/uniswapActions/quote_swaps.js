const { JsonRpcProvider, ethers, solidityPacked } = require("ethers");
const swapConfig = require("./swap.json");
require('dotenv').config();

const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

const { QUOTER_ADDRESS, tokens: tokensConfig, pools: poolsConfig, swaps: swapsConfig } = swapConfig;

const quoterAbi = [
    'function quoteExactInput(bytes memory path, uint256 amountIn) external view returns (uint256 amountOut)'
];
const quoterContract = new ethers.Contract(QUOTER_ADDRESS, quoterAbi, provider);

// Helper function to find the fee for a given pair of tokens
function getFee(tokenA_symbol, tokenB_symbol) {
    const pool = poolsConfig.find(p => 
        (p.tokens.includes(tokenA_symbol) && p.tokens.includes(tokenB_symbol))
    );
    if (!pool) {
        throw new Error(`Pool not found for ${tokenA_symbol}/${tokenB_symbol}`);
    }
    return pool.fee;
}

async function main() {
    // --- Configuration ---
    // Set the name of the swap to quote from swap.json
    const SWAP_NAME_TO_QUOTE = "USDC to WHITE (Multi-Hop)"; 
    // Set the amount of the input token to quote
    const AMOUNT_TO_QUOTE = "1";
    // Set to true to also quote the reverse path (e.g., selling the asset back to USDC)
    const QUOTE_REVERSE_PATH = true;
    // -------------------

    console.log(`--- Getting Quote for Swap: "${SWAP_NAME_TO_QUOTE}" ---`);

    const swapToQuote = swapsConfig.find(s => s.name === SWAP_NAME_TO_QUOTE);

    if (!swapToQuote) {
        console.error(`Swap "${SWAP_NAME_TO_QUOTE}" not found in swap.json.`);
        const availableSwaps = swapsConfig.map(s => `  - "${s.name}"`).join('\n');
        console.error("\nAvailable swaps:\n" + availableSwaps);
        process.exit(1);
    }

    await getQuote(swapToQuote, AMOUNT_TO_QUOTE);
    
    if (QUOTE_REVERSE_PATH) {
        const reverseSwap = {
            name: `(REVERSE) ${swapToQuote.name}`,
            path: [...swapToQuote.path].reverse()
        };
        console.log(`\n--- Getting Quote for Reverse Swap: "${reverseSwap.name}" ---`);
        
        // Use the same AMOUNT_TO_QUOTE for the reverse path for a direct 1-to-1 comparison
        await getQuote(reverseSwap, AMOUNT_TO_QUOTE);
    }

    console.log("\n-------------------------------------------");
}

async function getRawQuote(swap, amountInString) {
    const { path: swapPath } = swap;
    const tokenInSymbol = swapPath[0];
    const tokenIn = tokensConfig[tokenInSymbol];
    const amountIn = ethers.parseUnits(amountInString, tokenIn.decimals);

    const pathComponents = [];
    for (let i = 0; i < swapPath.length - 1; i++) {
        pathComponents.push(ethers.getAddress(tokensConfig[swapPath[i]].address));
        pathComponents.push(getFee(swapPath[i], swapPath[i+1]));
    }
    pathComponents.push(ethers.getAddress(tokensConfig[swapPath[swapPath.length - 1]].address));

    const types = [];
    for (let i = 0; i < pathComponents.length; i++) {
        types.push(i % 2 === 0 ? 'address' : 'uint24');
    }
    
    const encodedPath = solidityPacked(types, pathComponents);
    return await quoterContract.quoteExactInput(encodedPath, amountIn);
}

async function getQuote(swap, amountInString) {
    try {
        const { name, path: swapPath } = swap;
        
        if (swapPath.length < 2) {
            console.warn(`\nCannot quote swap "${name}": path is too short.`);
            return;
        }

        const tokenInSymbol = swapPath[0];
        const tokenOutSymbol = swapPath[swapPath.length - 1];

        const tokenIn = tokensConfig[tokenInSymbol];
        const tokenOut = tokensConfig[tokenOutSymbol];

        if (!tokenIn || !tokenOut) {
            throw new Error(`Token configuration not found for a token in swap: "${name}"`);
        }

        const quotedAmountOut = await getRawQuote(swap, amountInString);
        const formattedAmountOut = ethers.formatUnits(quotedAmountOut, tokenOut.decimals);

        console.log(`\nQuote for "${name}":`);
        console.log(`${amountInString} ${tokenIn.symbol} = ~${formattedAmountOut} ${tokenOut.symbol}`);

    } catch (error) {
        console.error(`\nError getting quote for "${swap.name}":`, error.message);
    }
}

main().catch((error) => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
}); 