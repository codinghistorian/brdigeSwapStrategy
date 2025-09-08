const { JsonRpcProvider, Wallet } = require("ethers");
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
    const usdcWethPoolInfo = pools.find(p => p.name === "USDC/WETH");

    if (!usdcWethPoolInfo) {
        throw new Error("Required USDC/WETH pool not found in swap.json");
    }

    const poolAddress = Pool.getAddress(wethToken, usdcToken, usdcWethPoolInfo.fee);
    const poolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI, provider);
    const poolData = await getPoolData(poolContract);

    const pool = new Pool(
        usdcToken,
        wethToken,
        poolData.fee,
        poolData.sqrtPriceX96.toString(),
        poolData.liquidity.toString(),
        poolData.tick
    );
    console.log("Pool:", pool);
    // Quote WETH out for 1 USDC using the Uniswap V3 Quoter contract
    const quoterContract = new ethers.Contract(QUOTER_ADDRESS, quoterAbi, provider);
    const quoteAmountIn = ethers.parseUnits('1', tokens.USDC.decimals); // 1 USDC
    const quotedAmountOutRaw = await quoterContract.quoteExactInputSingle(
      tokens.USDC.address,
      tokens.WETH.address,
      poolData.fee,
      quoteAmountIn,
      0
    );
    const quotedAmountOut = ethers.formatUnits(quotedAmountOutRaw, tokens.WETH.decimals);
    console.log(`Quote: for ${ethers.formatUnits(quoteAmountIn, tokens.USDC.decimals)} USDC, you get ~${quotedAmountOut} WETH`);

    // // Swap USDC to WETH
    // const amountIn = ethers.parseUnits("1", 6);
    // const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20ABI, wallet);
    // await usdcContract.approve(swapRouterAddress, amountIn);
    // console.log("Approved USDC for swap");

    // const route = new Route([pool], usdcToken, wethToken);

    // const trade = await Trade.createUncheckedTrade({
    //     route,
    //     inputAmount: CurrencyAmount.fromRawAmount(usdcToken, amountIn.toString()),
    //     outputAmount: CurrencyAmount.fromRawAmount(wethToken, 0),
    //     tradeType: TradeType.EXACT_INPUT,
    // });

    // const slippageTolerance = new Percent(50, 10000); // 0.5%
    // const amountOutMin = trade.minimumAmountOut(slippageTolerance).toExact();
    // const amountOutMinBigNumber = ethers.parseUnits(amountOutMin, 18);

    // const params = {
    //     tokenIn: USDC_ADDRESS,
    //     tokenOut: WETH_ADDRESS,
    //     fee: poolData.fee,
    //     recipient: wallet.address,
    //     deadline: Math.floor(Date.now() / 1000) + (60 * 20),
    //     amountIn,
    //     amountOutMinimum: amountOutMinBigNumber,
    //     sqrtPriceLimitX96: 0,
    // };

    // const swapRouterContract = new ethers.Contract(swapRouterAddress, ISwapRouter02ABI, wallet);

    // const tx = await swapRouterContract.exactInputSingle(params, { gasLimit: 1000000 });

    // console.log('Swap transaction sent:', tx.hash);
    // await tx.wait();
    // console.log('Swap transaction confirmed');

    // Quote USDC out for 0.000389856329333253 WETH using the Uniswap V3 Quoter contract
    const wethAmount = 0.000389856329333253;
    const quoteAmountIn2 = ethers.parseUnits(wethAmount.toString(), tokens.WETH.decimals); // WETH amount
    const quotedAmountOutRaw2 = await quoterContract.quoteExactInputSingle(
        tokens.WETH.address,
        tokens.USDC.address,
        poolData.fee,
        quoteAmountIn2,
        0
    );
    const quotedAmountOut2 = ethers.formatUnits(quotedAmountOutRaw2, tokens.USDC.decimals);
    console.log(`Quote: for ${ethers.formatUnits(quoteAmountIn2, tokens.WETH.decimals)} WETH, you get ~${quotedAmountOut2} USDC`);

    // Swap WETH back to USDC
    const amountIn2 = ethers.parseUnits(wethAmount.toString(), tokens.WETH.decimals);
    const wethContract = new ethers.Contract(tokens.WETH.address, ERC20ABI, wallet);
    await wethContract.approve(SWAP_ROUTER_ADDRESS, amountIn2);
    console.log("Approved WETH for swap");
    const swapRouterContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, ISwapRouter02ABI, wallet);

    const route2 = new Route([pool], wethToken, usdcToken);

    const trade2 = await Trade.createUncheckedTrade({
        route: route2,
        inputAmount: CurrencyAmount.fromRawAmount(wethToken, amountIn2.toString()),
        outputAmount: CurrencyAmount.fromRawAmount(usdcToken, 0),
        tradeType: TradeType.EXACT_INPUT,
    });

    const slippageTolerance2 = new Percent(50, 10000); // 0.5%
    const amountOutMin2 = trade2.minimumAmountOut(slippageTolerance2).toExact();
    const amountOutMinBigNumber2 = ethers.parseUnits(amountOutMin2, tokens.USDC.decimals);

    const params2 = {
        tokenIn: tokens.WETH.address,
        tokenOut: tokens.USDC.address,
        fee: poolData.fee,
        recipient: wallet.address,
        deadline: Math.floor(Date.now() / 1000) + (60 * 20),
        amountIn: amountIn2,
        amountOutMinimum: amountOutMinBigNumber2,
        sqrtPriceLimitX96: 0,
    };

    const tx2 = await swapRouterContract.exactInputSingle(params2, { gasLimit: 1000000 });
    console.log('Swap back transaction sent:', tx2.hash);
    await tx2.wait();
    console.log('Swap back transaction confirmed');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
