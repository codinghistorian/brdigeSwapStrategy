const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed CustomStrategyWormhole proxy
  const strategyContractAddress = "0xf90e6E8E1faFFCf4a204e45b3806390a877fcd7B"; // mainnet

  const strategyContractAbi = [
    "function bridgeInFromSolana(bytes memory encodedVAA)",
  ];

  const customStrategyWormhole = new ethers.Contract(
    strategyContractAddress,
    strategyContractAbi,
    signer
  );

  // The VAA, in base64 format.
  // You can get this from the Wormhole explorer page(advanced tab) for your source transaction.
  const vaaBase64 =
    "AQAAAAQNAB5efP5RnMt3vd0q7ZLqHLU+/tPuKlSesUB0BT61NniMB9ZdZQBLcA6rCo1eDxK19uiGFYmirsZ9YWetINngFUEAAlyhQFxBpD5AMNKaD/lsK69X6r3zwZUOTaEfT97YW0e8A6KCpMOKdduRVgqbXKhyPmZGzVx5/VRISLb7SGBG7eQAA5pAJNb3wRU9liT31VirryaSIrugpJ4EtH7UYSc5/+5ob+8VqhqvNGM419SWrqWCS5VOK3nHJCqPal0wUpgakVMABJpcq+y2pj2scYtTMnzizW+Hv1l78S7Mt2zcktjxsyN3f1ucPne8c+7B6qASKflLRc4+HV/NLBic0H9cqW87rBwABd1IyCMCbZfy4wksfpTfKuAYM6eMx9h2rQeQfV8btVlaQrR5clDbIiMShIxpv3Tzr0l4YqWgRdP3FA4kCyA039QBBgpqc4h75YCFJrn4o5KJ8cPmXkqLHf9sYnupJ9u3QyqyWn+OUFAHxVOnl95Tf8/w6egSdw+toeix0XZhdMwY6NoACLgWO2wwnQqCJWFVyNe1gtOUHYZ+CQ+hC3Wio6c5nuhFeKq5SeTWy8Cld2xj8MaBnSCe9z9l/JcwR93CrCNm9W0ACVi8wa+cC0S07n/ahiCRN0g2j9cAdFxHwk5MafcAbigMQ35HLcAqDw2J/YuymSbVrqehnngzsA6oiNGfB2+3Q98BCj2LmACvjZ62/VwMaQrXKzwdjZrg8WebTTM/THGCYvFgHQyeThF3mMWFn50hKc7PxE4DDOs8izvUeUw63vrxsNwBDd1b0TtCwz++yWSPcYLdee0DwTg8Vy8WNnNfQTmSGltlCpiQSY4c8UXhyGBM7ROnTCuI/ZhpAOfRrkhALheS4K8BD0RAjX+c+9nKm9ucU+z4xAYPPGq/3Y/u8wyX2r6XKerKMUW8xR2Hh0WetBR1Dlpn9kDgU3DXW17s2gtShi/VnVkBEGkrWV88XMajatgVlJKtYiciKy0n7FIBEVAW6XYeSGBFFI7sPm2zBaPXS69QW5Gab90BLrTtu4+/VyPfNK0/x6EAEU/gIg02ujXFXiWBEZwJs8CHNrHwuMxceaqo731uFpl2fMiV8AP6Z9fHCNqON0zwzZ/Gd8E5d2Uwn7tOy/SoaH8BaLrL46a/nuEAAexzcpldXMhzI5f7CtNcASHg6qkNJvgopTTKtUORs6T1AAAAAAAT6GkgAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPoAAAAAAAAAAAAAAAAoLhpkcYhizbB0Z1KLp6wzjYG60gAAgAAAAAAAAAAAAAAAPkObo4fr/z0ogTkWzgGOQqHf817AAIRoozcHfU7AqdTrffW9JjOBnfXt+EBj0HYBqM1/Lkh90hlbGxvIGZyb20gU29sYW5hIEFzc2V0IE1hbmFnZXIh";

  if (vaaBase64 === "YOUR_VAA_IN_BASE64_HERE" || !vaaBase64) {
    console.error(
      "Please replace 'YOUR_VAA_IN_BASE64_HERE' with the actual VAA in base64 format in the script."
    );
    process.exit(1);
  }

  // Convert the base64 VAA to a hex string for the transaction
  const encodedVm = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  console.log(
    `Calling bridgeInFromSolana on CustomStrategyWormhole at ${strategyContractAddress}`
  );
  console.log(`Signer address: ${signer.address}`);
  console.log(`Encoded VAA (hex): ${encodedVm.substring(0, 100)}...`);

  try {
    const tx = await customStrategyWormhole.bridgeInFromSolana(encodedVm);
    console.log("Transaction sent. Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Transaction hash: ${receipt.transactionHash}`);

    console.log("bridgeInFromSolana executed successfully.");
  } catch (error) {
    console.error("Error executing bridgeInFromSolana:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
