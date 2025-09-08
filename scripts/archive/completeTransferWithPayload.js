const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const tokenBridgeAddress = "0xDB5492265f6038831E89f495670FF909aDe94bd9";

  const tokenBridgeAbi = [
    "function completeTransferWithPayload(bytes memory encodedVm) external payable returns (bytes memory)"
  ];

  const tokenBridge = new ethers.Contract(tokenBridgeAddress, tokenBridgeAbi, signer);

  // The VAA, in base64 format.
  // You can get this from the Wormhole explorer page(advanced tab) for your source transaction.
  const vaaBase64 = "AQAAAAABAL7cLnixVYJk9ZqPYuGuRx3In1G+jMhLfxfIayWERd1jSe5V4epKXp12CzwotHHkSeng+VEj0zyKF1C2tiuUzScAaFVLCAAAAAAAATsmQJ+Kre0/XdyhhGlapqD6gpsMhcr4SFYySJbSFMqYAAAAAAAAfhkgAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAO0Qss5EhV/E6kz0BNCgtAytf/s0Botvxt3kGCN8ALqcAAQAAAAAAAAAAAAAAAErkO4u9jWz70hF3/v+9atv6mmeSJxKezD67sl4WeA+ipW5l4i8KcBM12BkvZ88gXVl4OAQ4VgAAAAAAAAAAAAAAAErkO4u9jWz70hF3/v+9atv6mmeSvK2ptkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAAAAAAA==";

  if (vaaBase64 === "YOUR_VAA_IN_BASE64_HERE" || !vaaBase64) {
    console.error("Please replace 'YOUR_VAA_IN_BASE64_HERE' with the actual VAA in base64 format in the script.");
    process.exit(1);
  }

  // Convert the base64 VAA to a hex string for the transaction
  const encodedVm = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  console.log(`Calling completeTransferWithPayload on TokenBridge at ${tokenBridgeAddress}`);
  console.log(`Signer address: ${signer.address}`);
  console.log(`Encoded VAA (hex): ${encodedVm.substring(0, 100)}...`);

  try {
    const tx = await tokenBridge.completeTransferWithPayload(encodedVm);
    console.log("Transaction sent. Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    
    // The `completeTransferWithPayload` function returns the payload, but we can't directly
    // get return values from a state-changing transaction.
    // However, we can look for events if we know what event to look for.
    // For now, we'll just log that it was successful.
    console.log("completeTransferWithPayload executed successfully.");

  } catch (error) {
    console.error("Error executing completeTransferWithPayload:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
