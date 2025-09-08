
const { JsonRpcProvider, Wallet, ethers } = require("ethers");
const ERC20ABI = require("@openzeppelin/contracts/build/contracts/ERC20.json").abi;
const swapConfig = require("./swap.json");
require('dotenv').config();

const provider = new JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

const { tokens: tokensConfig } = swapConfig;

async function main() {
    // --- Configuration ---
    // Set the symbol of the token to check (e.g., "USDC", "WETH")
    const TOKEN_SYMBOL_TO_CHECK = "USDC"; 
    // Set the address to check the balance of (e.g., "0x...", can be any valid Ethereum address)
    const ADDRESS_TO_CHECK = "0xa11410E204234599A9dE3b1b40535F02AdBFEA72"; // <<< SET YOUR DESIRED ADDRESS HERE
    // -------------------

    console.log(`--- Getting Balance for ${TOKEN_SYMBOL_TO_CHECK} at Address ${ADDRESS_TO_CHECK} ---`);

    const tokenInfo = tokensConfig[TOKEN_SYMBOL_TO_CHECK];

    if (!tokenInfo) {
        console.error(`Token "${TOKEN_SYMBOL_TO_CHECK}" not found in swap.json.`);
        const availableTokens = Object.keys(tokensConfig).map(s => `  - "${s}"`).join('\n');
        console.error("\nAvailable tokens:\n" + availableTokens);
        process.exit(1);
    }

    try {
        const tokenContract = new ethers.Contract(ethers.getAddress(tokenInfo.address), ERC20ABI, provider);
        const balance = await tokenContract.balanceOf(ADDRESS_TO_CHECK);
        const formattedBalance = ethers.formatUnits(balance, tokenInfo.decimals);

        console.log(`Balance of ${tokenInfo.symbol} for ${ADDRESS_TO_CHECK}: ${formattedBalance}`);
    } catch (error) {
        console.error(`\nError fetching balance for ${tokenInfo.symbol}:`, error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("\nAn unexpected error occurred:", error);
    process.exit(1);
});

