const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed CustomStrategyWormhole proxy
  const strategyContractAddress = "0xD4597d6358F0533337022579147972F432553Bf0";

  const strategyContractAbi = [
    "function emergencyRedeem(bytes memory vaa)"
  ];

  const customStrategyWormhole = new ethers.Contract(strategyContractAddress, strategyContractAbi, signer);

  // The VAA, in base64 format.
  // You can get this from the Wormhole explorer page(advanced tab) for your source transaction.
  const vaaBase64 = "AQAAAAQNAO3mP7hfPYnWRd0Nn9rkRvSq+cc31HRQ4Jy42pI/QHXYHnqvhq0I9Qur/ZgXP1uvOavexd8SOX6rWB0Rz5OWvmMBAbFs9s0CZMhFUPl8f6rboZpu/1HKYnprEJ2RdN4B8XrEb3yqJuhlq2oFRzSgt2B0lGb0UES+dq/xY6sA/U4+AJ8AAqg/ooMmeL4dzYljunEkNpNX05MnTqfzWhHDIIAyCizQCuBMnLcn7kRoOS3oNnJg5+zqjmMeWKZ+J7nC1+/V5VwBA5H6uHlnAqTbQaku8V8mqs2QP9lquesxJVnyFfg7ad3jdtsPw6csGOjFxb/nfvxnVUFLErSXMwakYiGTQZPhXDkBBMr8tlUTNTQF5nfFMZRXmlBkHS+ux2k6evljz+A/TBgdEXAgz9LJWBfiOLZZLxQ2294Y9Qa1odm3dP57AOIPhzoABzqEtydT3nsyJ9FFoWqbvPcknE+8ZLkp1d/BG4DGZfWZDLF0ISKmXycjfpSvFstqmGnwRlt7Y3pbKlJ2DiabwSIBCJZTcj1Rs2M6Vrd51AtkU957My5KcFZf7hj8GDTD0D5PGEGdruIGlXagyhn0Y6TPN/IrvTWkzO4n0cnk3FFW8QQBCbRCfL/8ZKNszkjI8JoPKJwb+FoqPHZCmZSP8rz9hOjrJGJ1A2fDvFD+jIIqF9IyTwASmf8BPaopVBJEeJBQ58cBCiOwWUI2JaLViAJpQCDxslA3+pE8gt3QrI9BGqTZAGbOTU8eEtx77XvfroN10q2uhcTDL5Z8rFJ7+NVEViCqDjMBCyc4K+WA8MQy/RlOAzJJxTAxDCC7GaXLRCIA3rxhoCNTEfewsn9KugYQpqKjj1/tzz8IwSWjuJcHst0nZA5dohQADo5lyohQsNJZkhjWiU4MNfWspqAgSQezGEFAwnpcKMGJQIjnFV1rKGfgeQ7cBRwNViSFN0dyhIOzTQ2Ve77lodEAEIAU3RpY7LgPMocKhr1yF97AeKePNKVJ68j8/HY/NU9iUs3WPyLKVuamerMBscm2XIEWXB85o7B06AmyCI741yYBEZA5z1eEkDg2UnEISg2PnS051WNvruYBhPkHT8OUxlvXdsjz3N0Cm131y2FboJTWaIKOw+bukKh6M2256YQVoP4AaGfeyQAAAAEAAexzcpldXMhzI5f7CtNcASHg6qkNJvgopTTKtUORs6T1AAAAAAATU6sgAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYagAAAAAAAAAAAAAAAAoLhpkcYhizbB0Z1KLp6wzjYG60gAAgAAAAAAAAAAAAAAANRZfWNY8FMzNwIleRR5cvQyVTvwJxJrQCWymxb63pn4P0iG2jgRiMKn+HB1kPBCgrzX2E2AwwAAAAAAAAAAAAAAANRZfWNY8FMzNwIleRR5cvQyVTvwm/uolwAAAAAAAAAA";

  if (vaaBase64 === "YOUR_VAA_IN_BASE64_HERE" || !vaaBase64) {
    console.error("Please replace 'YOUR_VAA_IN_BASE64_HERE' with the actual VAA in base64 format in the script.");
    process.exit(1);
  }

  // Convert the base64 VAA to a hex string for the transaction
  const encodedVm = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

  console.log(`Calling emergencyRedeem on CustomStrategyWormholeV2 at ${strategyContractAddress}`);
  console.log(`Signer address: ${signer.address}`);
  console.log(`Encoded VAA (hex): ${encodedVm.substring(0, 100)}...`);

  try {
    const tx = await customStrategyWormhole.emergencyRedeem(encodedVm);
    console.log("Transaction sent. Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Transaction hash: ${receipt.transactionHash}`);
    
    console.log("emergencyRedeem executed successfully.");

  } catch (error) {
    console.error("Error executing emergencyRedeem:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
