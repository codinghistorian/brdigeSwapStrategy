const hre = require("hardhat");
const bs58 = require("bs58");

async function main() {
  const CustomStrategyWormhole = await hre.ethers.getContractFactory("CustomStrategyWormhole");

  // These are the same addresses from your deploy script.
  // The actual values don't significantly impact the gas estimate for deployment,
  // but they need to be valid addresses.
  const wormholeAddress = "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78";
  const tokenBridgeAddress = "0xDB5492265f6038831E89f495670FF909aDe94bd9";
  const underlyingTokenAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const solanaAggregatorAddressBase58 = "7ohados57dtV56mTcyVouonwHzejzfhDQeDM2qEH4k26";
  const decodedAddress = bs58.decode(solanaAggregatorAddressBase58);
  const solanaAggregatorAddress = "0x" + Buffer.from(decodedAddress).toString('hex');

  // There is no `estimateGas` function on `deployProxy`.
  // We can estimate the gas for deploying the implementation contract,
  // which is the main component of the deployment cost.
  const estimatedGas = await hre.ethers.provider.estimateGas(
    CustomStrategyWormhole.getDeployTransaction()
  );

  console.log(`Estimated gas for implementation deployment: ${estimatedGas.toString()}`);
  console.log("This estimate is for the implementation contract only.");
  console.log("The actual gas cost of deployProxy will be higher, as it also includes deploying the proxy and proxy admin contracts, and calling the initializer.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 