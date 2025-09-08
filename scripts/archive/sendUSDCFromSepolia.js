const { ethers } = require("hardhat");
const bs58 = require("bs58");
require("dotenv").config();

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);

  const TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // USDC on Sepolia
  const TOKEN_BRIDGE_ADDRESS = "0xDB5492265f6038831E89f495670FF909aDe94bd9";
  const WORMHOLE_CORE_ADDRESS = "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78";
  const RECIPIENT_CHAIN = 1; // Solana

  const TARGET_CONTRACT = "FvALbfmsdBqENQWJmbaE8cdAhihMv8WudVZBqz6pB6Ji";

  // Amount in USDC base units (6 decimals)
  const amount = "100000"; // 0.1 USDC

  // 1. Get the Wormhole message fee
  const wormholeCore = new ethers.Contract(
    WORMHOLE_CORE_ADDRESS,
    ["function messageFee() view returns (uint256)"],
    signer
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

  // 3. Prepare recipient: convert Base58 to 32-byte hex
  const decoded = bs58.decode(TARGET_CONTRACT);
  if (decoded.length > 32) throw new Error("Invalid Solana address length");
  const pad = Buffer.alloc(32);
  decoded.copy(pad, 32 - decoded.length);
  const recipient = "0x" + pad.toString("hex");
  console.log("Recipient bytes32 (hex):", recipient);

  // 4. Send tokens with empty payload (0x00)
  const tokenBridge = new ethers.Contract(
    TOKEN_BRIDGE_ADDRESS,
    [
      "function transferTokensWithPayload(address,uint256,uint16,bytes32,uint32,bytes) payable returns (uint64)"
    ],
    signer
  );
  const payload = "0x00";
  console.log("Sending transferTokensWithPayload...");
  const tx = await tokenBridge.transferTokensWithPayload(
    TOKEN_ADDRESS,
    amount,
    RECIPIENT_CHAIN,
    recipient,
    0,        // batchId/nonce
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
