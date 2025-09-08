const hre = require("hardhat");
const bs58 = require("bs58");

async function main() {
  // IMPORTANT: Replace with your deployed contract's proxy address
  const proxyAddress = "0xf6AD96912E396bD5acbfe8D871AF7634CD26baa3";

  // The new Solana aggregator PDA public key you want to set.
  const newSolanaAggregatorAddressBase58 = "FvALbfmsdBqENQWJmbaE8cdAhihMv8WudVZBqz6pB6Ji";

  // Get the contract factory for V2. The ABI will include the new function.
  const CustomStrategyWormholeV2 = await hre.ethers.getContractFactory("CustomStrategyWormholeV2");
  const contract = CustomStrategyWormholeV2.attach(proxyAddress);

  console.log(`Attached to CustomStrategyWormholeV2 at: ${await contract.getAddress()}`);
  
  // Convert the Base58 address to bytes32 hex string
  const decodedAddress = bs58.decode(newSolanaAggregatorAddressBase58);
  const newSolanaAggregatorAddressHex = "0x" + Buffer.from(decodedAddress).toString('hex');
  
  console.log(`Attempting to set Solana aggregator address to: ${newSolanaAggregatorAddressBase58}`);
  console.log(`Hex representation (bytes32): ${newSolanaAggregatorAddressHex}`);

  // Call the setSolanaAggregatorAddress function
  const tx = await contract.setSolanaAggregatorAddress(newSolanaAggregatorAddressHex);
  
  console.log("Transaction sent. Waiting for confirmation...");
  await tx.wait();

  console.log("Successfully updated the Solana Aggregator Address.");

  // Optional: Verify the change by reading the state variable
  const updatedAddress = await contract.solanaAggregatorAddress();
  console.log(`New solanaAggregatorAddress from contract: ${updatedAddress}`);

  if (updatedAddress.toLowerCase() === newSolanaAggregatorAddressHex.toLowerCase()) {
    console.log("Verification successful: The address was updated correctly.");
  } else {
    console.error("Error: The address in the contract does not match the new address.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
