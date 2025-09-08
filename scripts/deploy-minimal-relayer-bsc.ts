import { ethers } from "hardhat";

// BSC Mainnet Addresses
const BSC_ADDRESSES = {
    WORMHOLE_CORE: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B", // Wormhole Core Bridge
    WORMHOLE_TOKEN_BRIDGE: "0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7", // Wormhole Token Bridge
    PANCAKESWAP_V3_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14", // PancakeSwap V3 Router
};

async function main() {
    console.log("Deploying MinimalWormholeRelayerV2 to BSC Mainnet...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

    // Get the contract factory
    const MinimalWormholeRelayerV2 = await ethers.getContractFactory("MinimalWormholeRelayerV2");

    console.log("Contract addresses:");
    console.log("- Wormhole Core:", BSC_ADDRESSES.WORMHOLE_CORE);
    console.log("- Wormhole Token Bridge:", BSC_ADDRESSES.WORMHOLE_TOKEN_BRIDGE);
    console.log("- PancakeSwap V3 Router:", BSC_ADDRESSES.PANCAKESWAP_V3_ROUTER);

    // Deploy the contract
    const minimalRelayer = await MinimalWormholeRelayerV2.deploy(
        BSC_ADDRESSES.WORMHOLE_CORE,
        BSC_ADDRESSES.WORMHOLE_TOKEN_BRIDGE,
        BSC_ADDRESSES.PANCAKESWAP_V3_ROUTER
    );

    await minimalRelayer.waitForDeployment();

    const contractAddress = await minimalRelayer.getAddress();
    console.log("✅ MinimalWormholeRelayerV2 deployed to:", contractAddress);

    // Verify ownership
    const owner = await minimalRelayer.owner();
    console.log("Contract owner:", owner);

    // Log important information for testing
    console.log("\n📋 Deployment Summary:");
    console.log("Contract Address:", contractAddress);
    console.log("Owner:", owner);
    console.log("Network: BSC Mainnet");
    console.log("\n🔧 Next Steps:");
    console.log("1. Fund the contract with tokens you want to swap/bridge");
    console.log("2. Test swapExactInputSingle() with small amounts first");
    console.log("3. Test bridgeOut() functionality");
    console.log("4. Monitor transactions on BSCScan");

    return contractAddress;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
