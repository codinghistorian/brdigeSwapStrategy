const { JsonRpcProvider, Wallet, Contract, ethers, solidityPacked } = require("ethers");
const { Pool, Route, Trade } = require("@uniswap/v3-sdk");
const { Token, TradeType, CurrencyAmount, Percent } = require("@uniswap/sdk-core");
const { abi: IUniswapV3PoolABI } = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");
const { abi: ISwapRouter02ABI } = require('@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json');
const ERC20ABI = require("@openzeppelin/contracts/build/contracts/ERC20.json").abi;
const swapConfig = require("../swap.json");

require('dotenv').config();

const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
const wallet = new Wallet(process.env.MAIN_NET_PK, provider);

const { SWAP_ROUTER_ADDRESS, QUOTER_ADDRESS, tokens, pools } = swapConfig;

// Create Token instances from config
const usdcToken = new Token(1, tokens.USDC.address, tokens.USDC.decimals, tokens.USDC.symbol, "USD Coin");
const wethToken = new Token(1, tokens.WETH.address, tokens.WETH.decimals, tokens.WETH.symbol, "Wrapped Ether");
const wstethToken = new Token(1, tokens.wstETH.address, tokens.wstETH.decimals, tokens.wstETH.symbol, "Wrapped liquid staked Ether 2.0");

async function getPoolData(poolContract) {
    const [fee, tickSpacing, liquidity, slot0] = await Promise.all([
        poolContract.fee(),
        poolContract.tickSpacing(),
        poolContract.liquidity(),
        poolContract.slot0(),
    ]);

    return {
        fee: Number(fee),
        tickSpacing: Number(tickSpacing),
        liquidity: liquidity.toString(),
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tick: Number(slot0.tick),
    };
}

async function main() {
    // Find pools from config
    const usdcWethPoolInfo = pools.find(p => p.name === "USDC/WETH");
    const wethWstethPoolInfo = pools.find(p => p.name === "wstETH/WETH");

    if (!usdcWethPoolInfo || !wethWstethPoolInfo) {
        throw new Error("Required pools not found in swap.json");
    }

    // Pool 1: USDC/WETH
    const usdcWethFee = usdcWethPoolInfo.fee;
    const pool1Address = Pool.getAddress(usdcToken, wethToken, usdcWethFee);
    const pool1Contract = new Contract(pool1Address, IUniswapV3PoolABI, provider);
    const pool1Data = await getPoolData(pool1Contract);
    const usdcWethPool = new Pool(
        usdcToken,
        wethToken,
        pool1Data.fee,
        pool1Data.sqrtPriceX96.toString(),
        pool1Data.liquidity.toString(),
        pool1Data.tick
    );
    console.log("USDC/WETH Pool created");

    // Pool 2: WETH/wstETH
    const wethWstethFee = wethWstethPoolInfo.fee;
    const pool2Address = Pool.getAddress(wethToken, wstethToken, wethWstethFee);
    const pool2Contract = new Contract(pool2Address, IUniswapV3PoolABI, provider);
    const pool2Data = await getPoolData(pool2Contract);
    const wethWstethPool = new Pool(
        wethToken,
        wstethToken,
        pool2Data.fee,
        pool2Data.sqrtPriceX96.toString(),
        pool2Data.liquidity.toString(),
        pool2Data.tick
    );
    console.log("WETH/wstETH Pool created");

    // --- Get quote for forward swap: USDC -> WETH -> wstETH ---
    const quoterAbi = [
        'function quoteExactInput(bytes memory path, uint256 amountIn) external view returns (uint256 amountOut)'
    ];
    const quoterContract = new ethers.Contract(QUOTER_ADDRESS, quoterAbi, provider);

    const amountIn = ethers.parseUnits("0.1", tokens.USDC.decimals); // 0.1 USDC
    const path = solidityPacked(
        ['address', 'uint24', 'address', 'uint24', 'address'],
        [tokens.USDC.address, usdcWethFee, tokens.WETH.address, wethWstethFee, tokens.wstETH.address]
    );
    const quotedAmountOut = await quoterContract.quoteExactInput(path, amountIn);
    console.log(`\nQuote for forward swap: For ${ethers.formatUnits(amountIn, tokens.USDC.decimals)} USDC, you could get ~${ethers.formatUnits(quotedAmountOut, tokens.wstETH.decimals)} wstETH`);


    // Create route for USDC -> WETH -> wstETH
    // const swapRoute = new Route([usdcWethPool, wethWstethPool], usdcToken, wstethToken);

    // const amountIn = ethers.parseUnits(0.1, 6); // 0.1 USDC

    // // Approve USDC for swap
    // const usdcContract = new Contract(USDC_ADDRESS, ERC20ABI, wallet);
    // const approvalTx = await usdcContract.approve(swapRouterAddress, amountIn);
    // await approvalTx.wait();
    // console.log("Approved USDC for swap");

    // // Create trade
    // const trade = await Trade.createUncheckedTrade({
    //     route: swapRoute,
    //     inputAmount: CurrencyAmount.fromRawAmount(usdcToken, amountIn.toString()),
    //     outputAmount: CurrencyAmount.fromRawAmount(wstethToken, '0'), // exact input
    //     tradeType: TradeType.EXACT_INPUT,
    // });
    // console.log("Trade created");

    // const slippageTolerance = new Percent(50, 10000); // 0.5%
    // const amountOutMin = trade.minimumAmountOut(slippageTolerance).toExact();
    // const amountOutMinBigNumber = ethers.parseUnits(amountOutMin, tokens.wstETH.decimals); // wstETH has 18 decimals

    // const path = solidityPacked(
    //     ['address', 'uint24', 'address', 'uint24', 'address'],
    //     [tokens.USDC.address, usdcWethFee, tokens.WETH.address, wethWstethFee, tokens.wstETH.address]
    // );

    // const params = {
    //     path: path,
    //     recipient: wallet.address,
    //     deadline: Math.floor(Date.now() / 1000) + (60 * 20),
    //     amountIn: amountIn,
    //     amountOutMinimum: amountOutMinBigNumber,
    // };

    // const swapRouterContract = new Contract(swapRouterAddress, ISwapRouter02ABI, wallet);

    // console.log(`Swapping ${ethers.formatUnits(amountIn, 6)} USDC for at least ${ethers.formatUnits(amountOutMinBigNumber, 18)} wstETH`);

    // const tx = await swapRouterContract.exactInput(params, {
    //     gasLimit: 1000000
    // });

    // console.log('Swap transaction sent:', tx.hash);
    // const receipt = await tx.wait();
    // console.log('Swap transaction confirmed in block', receipt.blockNumber);

    // --- Reverse Swap: wstETH -> WETH -> USDC ---
    console.log("\n--- Starting reverse swap: wstETH -> WETH -> USDC ---");

    const swapRouterContract = new Contract(SWAP_ROUTER_ADDRESS, ISwapRouter02ABI, wallet);
    const amountToSwap = ethers.parseUnits("0.000030134745910111", tokens.wstETH.decimals); // Manually set amount of wstETH to swap

    // Get quote for the reverse swap
    const path2 = solidityPacked(
        ['address', 'uint24', 'address', 'uint24', 'address'],
        [tokens.wstETH.address, wethWstethFee, tokens.WETH.address, usdcWethFee, tokens.USDC.address]
    );
    const quotedAmountOut2 = await quoterContract.quoteExactInput(path2, amountToSwap);
    console.log(`Quote for reverse swap: For ${ethers.formatUnits(amountToSwap, tokens.wstETH.decimals)} wstETH, you could get ~${ethers.formatUnits(quotedAmountOut2, tokens.USDC.decimals)} USDC`);

    // Approve wstETH for the reverse swap
    const wstethContract = new Contract(tokens.wstETH.address, ERC20ABI, wallet);
    const approvalTx2 = await wstethContract.approve(SWAP_ROUTER_ADDRESS, amountToSwap);
    await approvalTx2.wait();
    console.log("Approved wstETH for the reverse swap.");

    // Create route for wstETH -> WETH -> USDC
    const swapRoute2 = new Route([wethWstethPool, usdcWethPool], wstethToken, usdcToken);

    // Create trade for the reverse swap
    const trade2 = await Trade.createUncheckedTrade({
        route: swapRoute2,
        inputAmount: CurrencyAmount.fromRawAmount(wstethToken, amountToSwap.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(usdcToken, '0'), // exact input
        tradeType: TradeType.EXACT_INPUT,
    });
    console.log("Reverse trade created.");

    const slippageTolerance2 = new Percent(50, 10000); // 0.5%
    const amountOutMin2 = trade2.minimumAmountOut(slippageTolerance2).toExact();
    const amountOutMinBigNumber2 = ethers.parseUnits(amountOutMin2, tokens.USDC.decimals); // USDC has 6 decimals

    /*const path2 = solidityPacked(
        ['address', 'uint24', 'address', 'uint24', 'address'],
        [tokens.wstETH.address, wethWstethFee, tokens.WETH.address, usdcWethFee, tokens.USDC.address]
    );*/

    const params2 = {
        path: path2,
        recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + (60 * 20),
        amountIn: amountToSwap,
        amountOutMinimum: amountOutMinBigNumber2,
    };

    // console.log(`Swapping ${ethers.formatUnits(amountToSwap, 18)} wstETH for at least ${ethers.formatUnits(amountOutMinBigNumber2, 6)} USDC`);

    // const tx2 = await swapRouterContract.exactInput(params2, {
    //     gasLimit: 1000000
    // });

    // console.log('Reverse swap transaction sent:', tx2.hash);
    // const receipt2 = await tx2.wait();
    // console.log('Reverse swap transaction confirmed in block', receipt2.blockNumber);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
