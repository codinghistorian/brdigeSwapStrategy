const { ethers, upgrades } = require("hardhat");

async function main() {
  // ==================================================================================
  // IMPORTANT: Replace this with the address of your deployed proxy contract
  // You can get this address from the output of the deploy script.
  // const PROXY_ADDRESS = "0x487c7E54C092A56440Df2e3Facb72482d690C718"; // Sepolia
  // const PROXY_ADDRESS = "0xD4597d6358F0533337022579147972F432553Bf0"; // Mainnet
  // const PROXY_ADDRESS = "0x6C43f551916C67D6c1f410220F06256B208E1468"; // BSC testnet
  //
  const PROXY_ADDRESS = "0xc00c9Be09d18Af4791e0Ac910866c57613D1EF5d"; // Mainnet

  // ==================================================================================

  if (
    PROXY_ADDRESS === "YOUR_PROXY_ADDRESS" ||
    !ethers.isAddress(PROXY_ADDRESS)
  ) {
    console.error(
      "Please replace 'YOUR_PROXY_ADDRESS' with the actual address of your proxy contract in scripts/upgrade.js"
    );
    process.exit(1);
  }

  // This will get the new version of the contract.
  // Make sure you have made the desired changes in MinimalWormholeRelayer.sol
  // before running this script.
  const MinimalWormholeRelayer = await ethers.getContractFactory(
    "MinimalWormholeRelayer"
  );

  console.log("Preparing upgrade...");

  const upgradedProxy = await upgrades.upgradeProxy(
    PROXY_ADDRESS,
    MinimalWormholeRelayer
  );
  await upgradedProxy.waitForDeployment();

  const proxyAddress = await upgradedProxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  console.log("MinimalWormholeRelayer has been successfully upgraded.");
  console.log("Proxy is at:", proxyAddress);
  console.log("New implementation is at:", implementationAddress);

  // Optional: Verify the upgrade by calling an existing function
  const upgradedContract = await ethers.getContractAt(
    "MinimalWormholeRelayer",
    proxyAddress
  );

  // const fee = await upgradedContract.getWormholeFee();
  // console.log("Wormhole Fee from contract:", ethers.formatEther(fee), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
