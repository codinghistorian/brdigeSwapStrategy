import { ethers } from "hardhat";

// BSC Mainnet Token Addresses
const BSC_TOKENS = {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
};

// PancakeSwap V3 Fee Tiers
const FEE_TIERS = {
    LOW: 500,      // 0.05%
    MEDIUM: 2500,  // 0.25%
    HIGH: 10000,   // 1.0%
};

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress) {
        console.error("❌ Please set CONTRACT_ADDRESS environment variable");
        process.exit(1);
    }

    console.log("Testing MinimalWormholeRelayerV2 on BSC Mainnet...");
    console.log("Contract Address:", contractAddress);

    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);

    // Get contract instance
    const MinimalWormholeRelayerV2 = await ethers.getContractFactory("MinimalWormholeRelayerV2");
    const relayer = MinimalWormholeRelayerV2.attach(contractAddress);

    // Check ownership
    const owner = await relayer.owner();
    console.log("Contract owner:", owner);

    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.error("❌ You are not the owner of this contract");
        process.exit(1);
    }

    console.log("✅ You are the contract owner");

    // Example 1: Test single-hop swap (USDT -> USDC)
    console.log("\n🔄 Testing single-hop swap (USDT -> USDC)...");

    const swapAmount = ethers.parseUnits("1", 18); // 1 USDT (assuming 18 decimals)
    const minOut = ethers.parseUnits("0.95", 18); // Minimum 0.95 USDC

    try {
        console.log(`Swapping ${ethers.formatUnits(swapAmount, 18)} USDT for at least ${ethers.formatUnits(minOut, 18)} USDC`);

        const tx = await relayer.swapExactInputSingle(
            BSC_TOKENS.USDT,
            BSC_TOKENS.USDC,
            FEE_TIERS.MEDIUM, // 0.25% fee
            swapAmount,
            minOut,
            0 // No price limit
        );

        console.log("✅ Swap transaction sent:", tx.hash);
        await tx.wait();
        console.log("✅ Swap completed successfully");

    } catch (error) {
        console.error("❌ Swap failed:", error.message);
    }

    // Example 2: Test multi-hop swap (USDT -> WBNB -> BUSD)
    console.log("\n🔄 Testing multi-hop swap (USDT -> WBNB -> BUSD)...");

    // Encode path: USDT -> 0.25% -> WBNB -> 0.25% -> BUSD
    const path = ethers.solidityPacked(
        ["address", "uint24", "address", "uint24", "address"],
        [BSC_TOKENS.USDT, FEE_TIERS.MEDIUM, BSC_TOKENS.WBNB, FEE_TIERS.MEDIUM, BSC_TOKENS.BUSD]
    );

    try {
        const multiHopAmount = ethers.parseUnits("2", 18); // 2 USDT
        const multiHopMinOut = ethers.parseUnits("1.8", 18); // Minimum 1.8 BUSD

        console.log(`Multi-hop swapping ${ethers.formatUnits(multiHopAmount, 18)} USDT -> WBNB -> BUSD`);

        const tx = await relayer.swapExactInput(
            path,
            multiHopAmount,
            multiHopMinOut
        );

        console.log("✅ Multi-hop swap transaction sent:", tx.hash);
        await tx.wait();
        console.log("✅ Multi-hop swap completed successfully");

    } catch (error) {
        console.error("❌ Multi-hop swap failed:", error.message);
    }

    // Check balances
    console.log("\n💰 Checking contract balances...");

    const usdtBalance = await ethers.getContractAt("IERC20", BSC_TOKENS.USDT).balanceOf(contractAddress);
    const usdcBalance = await ethers.getContractAt("IERC20", BSC_TOKENS.USDC).balanceOf(contractAddress);
    const busdBalance = await ethers.getContractAt("IERC20", BSC_TOKENS.BUSD).balanceOf(contractAddress);
    const wbnbBalance = await ethers.getContractAt("IERC20", BSC_TOKENS.WBNB).balanceOf(contractAddress);

    console.log("Contract balances:");
    console.log(`- USDT: ${ethers.formatUnits(usdtBalance, 18)}`);
    console.log(`- USDC: ${ethers.formatUnits(usdcBalance, 18)}`);
    console.log(`- BUSD: ${ethers.formatUnits(busdBalance, 18)}`);
    console.log(`- WBNB: ${ethers.formatUnits(wbnbBalance, 18)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
