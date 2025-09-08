const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Using signer:", signer.address);
  // IMPORTANT: Replace with your deployed proxy contract address
  const proxyAddress = "0x536eFD341e6B17798c52a201B4A87a961f0dC159";

  // The account to grant the REPORTING_MANAGER role to
  const accountToGrant = "0x799D51984aC46B79A2e762C0B7F8b5430c27487E";

  // Get the contract factory for V2. The ABI includes the new grantReportingManager function.
  const CustomStrategyWormholeV2 = await hre.ethers.getContractFactory("CustomStrategyWormhole");
  const contract = CustomStrategyWormholeV2.attach(proxyAddress);

  console.log(`Attached to CustomStrategyWormholeV2 at: ${await contract.getAddress()}`);
  console.log(`Granting REPORTING_MANAGER to: ${accountToGrant}`);
  // Verify signer has the ADMIN role via AccessControl's hasRole
  const adminRole = await contract.ADMIN();
  const hasAdmin = await contract.hasRole(adminRole, signer.address);
  console.log(`Signer has ADMIN role? ${hasAdmin}`);
  if (!hasAdmin) {
    console.error("Error: signer does not have ADMIN role. Aborting.");
    process.exit(1);
  }
  // Call the grantReportingManager function
  const tx = await contract.grantReportingManager(accountToGrant);
  console.log("Transaction sent. Waiting for confirmation...");
  await tx.wait();

  console.log(`Successfully granted REPORTING_MANAGER to ${accountToGrant}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
