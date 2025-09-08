const { ethers } = require("hardhat");
const bs58 = require("bs58");
const { Buffer } = require("buffer");
require("dotenv").config();
const { solidityPacked } = require("ethers");

// Helper to convert Solana address to bytes32
function solanaAddressToBytes32(solanaAddress) {
  const decoded = bs58.decode(solanaAddress);
  if (decoded.length > 32) throw new Error("Invalid Solana address length");
  const pad = Buffer.alloc(32);
  decoded.copy(pad, 32 - decoded.length);
  return "0x" + pad.toString("hex");
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);

  // Using Sepolia testnet addresses from user's example
  const TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC on Mainnet
  const TOKEN_BRIDGE_ADDRESS = "0x3ee18B2214AFF97000D974cf647E7C347E8fa585"; // Mainnet
  const WORMHOLE_CORE_ADDRESS = "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B"; // Mainnet
  const RECIPIENT_CHAIN = 1; // Solana

  // Solana addresses
  const sharesRecipient = "22vTkBX5BiQQuCFPmg7oQUt9HeEEoSYeiHUV2BiQdyV9"; //Mainnet habibi
  // const vaultAddress = "9FpM6t4uLp578wotZDmEDsvpvPvkSNuoGUHcJXkHo2aJ"; //Demo WLF vault
  const vaultAddress = "9BjNXmgoRo5KqazvWiQi3qhZG54gJY8LxWvuL1R3Wn6V"; //Demo SOLMATE vault

  const targetContract = process.env.WORMHOLE_RELAYER || "3ogQSniT4eUY6Btp7Y5y44u5J4bfShs1RW9AMVVRjY3z"; //Wormhole relayer program Id
  const batchId = 0;

  // Amount in USDC base units (6 decimals)
  const amount = ethers.parseUnits("7", 6); // 0.1 USDC

  // 1. Get the Wormhole message fee
  const wormholeCore = new ethers.Contract(
    WORMHOLE_CORE_ADDRESS,
    ["function messageFee() view returns (uint256)"],
    signer.provider // Use provider for read-only calls
  );
  const fee = await wormholeCore.messageFee();
  console.log("Message fee (wei):", fee.toString());

  // 2. Approve the token bridge to spend USDC
  const token = new ethers.Contract(
    TOKEN_ADDRESS,
    ["function approve(address,uint256) public returns (bool)"],
    signer
  );
  const approveTx = await token.approve(TOKEN_BRIDGE_ADDRESS, amount);
  console.log("Approving token bridge... tx:", approveTx.hash);
  await approveTx.wait();
  console.log("Approval confirmed.");

  // 3. Prepare recipient
  const recipient = solanaAddressToBytes32(targetContract);
  console.log("Recipient bytes32 (hex):", recipient);

  // 4. Build payload: payloadID + sharesRecipient + vaultAddress
  const payload = solidityPacked(
      ["uint8", "bytes32", "bytes32"],
      [1, solanaAddressToBytes32(sharesRecipient), solanaAddressToBytes32(vaultAddress)]
  );
  console.log("Payload:", payload);

  // 5. Send tokens with payload
  const tokenBridge = new ethers.Contract(
    TOKEN_BRIDGE_ADDRESS,
    [
      "function transferTokensWithPayload(address token, uint256 amount, uint16 recipientChain, bytes32 recipient, uint32 batchId, bytes memory payload) external payable returns (uint64 sequence)",
    ],
    signer
  );
  console.log("Sending transferTokensWithPayload...");
  const tx = await tokenBridge.transferTokensWithPayload(
    TOKEN_ADDRESS,
    amount,
    RECIPIENT_CHAIN,
    recipient,
    batchId,
    payload,
    { value: fee }
  );
  console.log("Transaction submitted. tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Transaction confirmed. receipt:", receipt.transactionHash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
