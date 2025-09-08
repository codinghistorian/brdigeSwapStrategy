const { JsonRpcProvider, Wallet, ethers, solidityPacked, Contract } = require("ethers");
const { Token, TradeType, CurrencyAmount, Percent } = require("@uniswap/sdk-core");
const { Pool, Route, Trade } = require("@uniswap/v3-sdk");
const { abi: IUniswapV3PoolABI } = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");
const { abi: ISwapRouter02ABI } = require('@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json');
const ERC20ABI = require("@openzeppelin/contracts/build/contracts/ERC20.json").abi;
const swapConfig = require("./swap.json");
require('dotenv').config();

const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
const wallet = new Wallet(process.env.MAIN_NET_PK, provider);

const { SWAP_ROUTER_ADDRESS, tokens: tokensConfig, pools: poolsConfig, swaps: swapsConfig } = swapConfig;

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
    // Set the name of the swap to execute from swap.json (e.g., "USDC to WBTC (Single Hop)")
    const SWAP_NAME_TO_EXECUTE = "USDC to WBTC (Single Hop)"; 
    // Set the amount of the input token to swap
    const AMOUNT_TO_SWAP = "0.1";
    // Set to true to execute the reverse of the swap path (e.g., selling the asset back to USDC)
    const EXECUTE_REVERSE = false;
    // -------------------

    const originalSwap = swapsConfig.find(s => s.name === SWAP_NAME_TO_EXECUTE);

    if (!originalSwap) {
        console.error(`Swap "${SWAP_NAME_TO_EXECUTE}" not found in swap.json.`);
        const availableSwaps = swapsConfig.map(s => `  - "${s.name}"`).join('\n');
        console.error("\nAvailable swaps:\n" + availableSwaps);
        process.exit(1);
    }

    const swapPath = EXECUTE_REVERSE ? [...originalSwap.path].reverse() : originalSwap.path;
    const directionLog = EXECUTE_REVERSE ? "(REVERSE)" : "";

    console.log(`--- Executing Swap ${directionLog}: "${originalSwap.name}" ---`);

    const tokenInSymbol = swapPath[0];
    const tokenOutSymbol = swapPath[swapPath.length - 1];
    const tokenIn = tokensConfig[tokenInSymbol];

    const amountIn = ethers.parseUnits(AMOUNT_TO_SWAP, tokenIn.decimals);

    // Construct the execution path
    const pathComponents = [];
    for (let i = 0; i < swapPath.length - 1; i++) {
        pathComponents.push(ethers.getAddress(tokensConfig[swapPath[i]].address));
        pathComponents.push(getFee(swapPath[i], swapPath[i+1]));
    }
    pathComponents.push(ethers.getAddress(tokensConfig[swapPath[swapPath.length - 1]].address));
    
    // This logic was buggy, simplified it
    const types = [];
    for (let i = 0; i < pathComponents.length; i++) {
        types.push(i % 2 === 0 ? 'address' : 'uint24');
    }

    const encodedPath = solidityPacked(types, pathComponents);

    // Approve the router
    const tokenInContract = new Contract(ethers.getAddress(tokenIn.address), ERC20ABI, wallet);
    const approvalTx = await tokenInContract.approve(SWAP_ROUTER_ADDRESS, amountIn);
    console.log(`Approving ${tokenIn.symbol} for swap... Tx hash: ${approvalTx.hash}`);
    await approvalTx.wait();
    console.log("Approval confirmed.");

    const swapRouterContract = new Contract(SWAP_ROUTER_ADDRESS, ISwapRouter02ABI, wallet);

    // Note: For simplicity, we are setting amountOutMinimum to 0.
    // In a production environment, you would want to calculate a realistic minimum amount based on a quote and slippage tolerance.
    const params = {
        path: encodedPath,
        recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + (60 * 20), // 20 minutes
        amountIn: amountIn,
        amountOutMinimum: 0,
    };

    console.log(`Swapping ${AMOUNT_TO_SWAP} ${tokenInSymbol} for ${tokenOutSymbol}...`);

    const tx = await swapRouterContract.exactInput(params, {
        gasLimit: 1000000 
    });

    console.log('Swap transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Swap transaction confirmed in block', receipt.blockNumber);
    console.log("\n-------------------------------------------");
}

main().catch((error) => {
    console.error("\nAn error occurred during the swap execution:", error);
    process.exit(1);
}); 