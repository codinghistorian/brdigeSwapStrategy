const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  // Address of your deployed MinimalWormholeRelayer contract
  const relayerContractAddress = "0x4F3862D359D8f76498f69732740E4d53b7676639";

  // Validate contract address
  if (relayerContractAddress === "0xYOUR_MINIMAL_WORMHOLE_RELAYER_ADDRESS") {
    console.error("\n❌ ERROR: Please replace the placeholder contract address with your actual deployed MinimalWormholeRelayer address.");
    console.log("\n📋 To fix this:");
    console.log("1. Deploy your MinimalWormholeRelayer contract first");
    console.log("2. Copy the deployment address");
    console.log("3. Replace '0xYOUR_MINIMAL_WORMHOLE_RELAYER_ADDRESS' with your actual contract address");
    process.exit(1);
  }

  const relayerAbi = [
    "function bridgeIn(bytes memory encodedVAA)",
  ];

  const relayerContract = new ethers.Contract(
    relayerContractAddress,
    relayerAbi,
    signer
  );

  // The VAA, in base64 format.
  // You can get this from the Wormhole explorer page (advanced tab) for your source transaction.
  // IMPORTANT: Replace this with your actual VAA from the cross-chain transfer
  const vaaBase64 =
    "AQAAAAQNAPVePxz72K2cxaRnUjzRltOSqR2iX4GTzcZGzW7vtEy+SuYqC84raywadSyUGF1MOyAUtFUOJWaCz9//c/upVy4BAV6Z+bfmkUzsfSy5olwTT7KjkJQ04KU9dUK+aryumJ68L1JOHsrTRo9tiiON2U7jEBsiDIglNM6aSu3lqlSXdGQAApYaz7pqCJe4+VZboxaGUfueXwuhGjkdgC9o7ZLL3/4PD0FMw/JAygdFuxGxzwCEokX0QpFVaMFUpRiTun7h9dMAAzW0Bi5Jz8gIpGfocjr80h5UiRdZGomuIDEFT3RTMv6lb0DnuvS8AxhWpo4UkIZvlciMBNvc1623+gvMUHfxmjYABthxagpknO28M2OCXc4c6BnnZ1umAcAgu9scrrksGpAXTNDNAL5JMmcHemQl4N2zQeQCoKc9u+S0Nk+xvQcIqosBB//nMY9QahppcYEcm8vA/nCBlaabnzF27R52tSluz78MYs21B6rJ6QWrxb1VKATpOSk3nou/8pkp7hDCrIKxJiYBCJIDxo7gs48/JUZ8+hnWd7ilbGdV71wxf2psCWkJobYyIblKl9ypVGFtUBUjarW4pLN+FzQLonyVYT1bIAc/ZnYAC733chzsFVkuWsyM6tgGdqmJ65FpenKcTE7odYnCy0qaFQhzrcPxrKlK0UajzHsY0xwOhxExcBwEf2zAunSWBOgBDPQLW8EXFqwTNVMYQVb1KxpE0tdzPoFoiujjAOC6+kZqRdN398Sc1MYui4gcci8skbxnEWCCDiUwoSQjGGDw9QwBDUl9AS22sC6RX0qV9iUjrnMzfmVDgz8leOCAEcfXNvRweqTzsC4Olm67yO4XR7ZIhjop5coow5OSd1WOOVDe8hEBDgWarNwfQaVOLdab2tA83Jp0UStcT+w29B91AnxZ04qUXC38wrmW5t1hVBRK3pQCPMIccHDIWaDrP84eR8dGZ2MADxEAd0ROkbvUvUgKkqkrjso3e9y/0fwlPqiZ9tBf1w3MCuUINzuvZ5lwsdz95rbJjfvA8twrHvAroIauesFZEbUBEWbBBc5douBsHLu3Oz+uEeQIkvE2R5sj/r2ivkm8mSBEQ/2Wbt5e0TdXhnvg8tIYALKpGgDicJrChKrw0MikCmQAaLrNv2i6zb8AAgAAAAAAAAAAAAAAAD7hiyIUr/lwANl0z2R+fDR+j6WFAAAAAAAIjQEBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPmAAAAAAAAAAAAAAAA2sF/lY0u5SOiIGIGmUWXwT2DHscAAgAAAAAAAAAAAAAAAE84YtNZ2PdkmPaXMnQOTVO3Z2Y5AAQAAAAAAAAAAAAAAAD5Dm6OH6/89KIE5Fs4BjkKh3/New==";

  console.log(`Using signer: ${signer.address}`);
  console.log(`MinimalWormholeRelayer contract: ${relayerContractAddress}`);

  if (vaaBase64 === "YOUR_VAA_IN_BASE64_HERE" || !vaaBase64) {
    console.error(
      "\n❌ ERROR: Please replace 'YOUR_VAA_IN_BASE64_HERE' with the actual VAA in base64 format."
    );
    console.log("\n📋 How to get the VAA:");
    console.log("1. Go to Wormhole Scan (https://wormholescan.io/)");
    console.log("2. Search for your bridge-out transaction hash");
    console.log("3. Click on the transaction details");
    console.log("4. Go to the 'Advanced' tab");
    console.log("5. Copy the VAA in base64 format");
    console.log(
      "6. Paste it in this script replacing 'YOUR_VAA_IN_BASE64_HERE'"
    );
    process.exit(1);
  }

  try {
    // Convert the base64 VAA to a hex string for the transaction
    const encodedVm = "0x" + Buffer.from(vaaBase64, "base64").toString("hex");

    console.log("\n--- VAA Information ---");
    console.log(
      `VAA Base64 (first 100 chars): ${vaaBase64.substring(0, 100)}...`
    );
    console.log(`VAA Hex (first 100 chars): ${encodedVm.substring(0, 100)}...`);
    console.log(`VAA size: ${encodedVm.length - 2} bytes`);

    console.log("\n--- Executing Bridge In Transaction ---");
    console.log("Calling bridgeIn...");

    const tx = await relayerContract.bridgeIn(encodedVm, {
      gasLimit: 500000,
    });

    console.log(`Transaction sent! Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed.");
    console.log(`Block number: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    console.log("\n✅ Bridge-in transaction completed successfully!");
    console.log("Tokens have been successfully bridged into the MinimalWormholeRelayer contract.");
  } catch (error) {
    console.error("\n❌ Error executing bridgeIn:", error.message);

    // Parse common Wormhole error messages
    if (error.message.includes("transfer already completed")) {
      console.error("This VAA has already been redeemed.");
    } else if (error.message.includes("invalid emitter")) {
      console.error(
        "Invalid VAA emitter - this VAA is not from a recognized bridge."
      );
    } else if (error.message.includes("invalid signature")) {
      console.error("Invalid VAA signature - the VAA may be corrupted.");
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
