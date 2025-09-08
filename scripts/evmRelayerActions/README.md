# Token Attestation for Cross-Chain Bridging

This directory contains scripts for cross-chain token bridging using Wormhole, including token attestation functionality.

## Overview

When bridging tokens across chains using Wormhole, tokens must first be "attested" on the destination chain before they can be bridged. Attestation creates a wrapped version of the token on the destination chain.

## Files

- `bridgeOutToChain.js` - Initiates token bridging from source chain
- `bridgeInFromChain.js` - Completes token bridging on destination chain
- `attestToken.js` - Attests tokens on destination chain (NEW)

## Prerequisites

### 1. Install Dependencies

```bash
npm install @wormhole-foundation/sdk
```

### 2. Environment Variables

Create a `.env` file in the project root with:

```env
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://rpc.sepolia.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
```

**Important**: Make sure your wallet has:
- ETH on Sepolia (for gas fees and attestation)
- BNB on BSC Testnet (for gas fees when completing attestation)

## Usage

### Step 1: Check if Token Needs Attestation

First, check if your token is already attested on the destination chain:

```bash
npm run check-attestation
```

Or directly:
```bash
node scripts/evmRelayerActions/attestToken.js --check
```

### Step 2: Attest Token (if needed)

If the token is not registered, run the attestation:

```bash
npm run attest-token
```

Or directly:
```bash
node scripts/evmRelayerActions/attestToken.js
```

**This process involves:**
1. Creating attestation on Sepolia
2. Waiting for Wormhole VAA (2-5 minutes)
3. Submitting attestation to BSC Testnet
4. Verifying successful registration

### Step 3: Bridge Tokens

After successful attestation, you can use the existing bridging scripts:

1. **Bridge Out** (Sepolia → BSC):
   ```bash
   node scripts/evmRelayerActions/bridgeOutToChain.js
   ```

2. **Bridge In** (Complete on BSC):
   ```bash
   node scripts/evmRelayerActions/bridgeInFromChain.js
   ```

## Configuration

### Token Address
The scripts are currently configured for:
- **Token**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- **Source**: Sepolia Testnet
- **Destination**: BSC Testnet

To change the token or chains, edit the values in `attestToken.js`:

```javascript
// Change token address
const tokenAddress = "YOUR_TOKEN_ADDRESS";

// Change chains
const sourceChain = wh.getChain('Sepolia');
const destinationChain = wh.getChain('Bsc');
```

### Supported Chains (Testnet)
- `Sepolia` (Ethereum Testnet)
- `Bsc` (BSC Testnet)
- `Fuji` (Avalanche Testnet)
- `Mumbai` (Polygon Testnet)
- `Alfajores` (Celo Testnet)

## Troubleshooting

### Common Errors

1. **"No wrapper for this token exists"**
   - **Solution**: Run attestation first using `attestToken.js`

2. **"Insufficient funds"**
   - **Solution**: Ensure you have enough ETH on Sepolia and BNB on BSC Testnet

3. **"Network connection issue"**
   - **Solution**: Check your RPC URLs in `.env` file

4. **"Timeout waiting for VAA"**
   - **Solution**: VAA generation can take 2-15 minutes. Wait longer or check Wormhole Scan

### Verification

You can verify attestation status anytime:
```bash
node scripts/evmRelayerActions/attestToken.js --check
```

### Wormhole Explorer

Track your transactions on [Wormhole Scan](https://wormholescan.io/) using transaction hashes.

## Process Flow

```
1. Token on Sepolia (Source)
   ↓
2. Attest Token (attestToken.js)
   ↓ Creates VAA
3. Submit Attestation to BSC (attestToken.js)
   ↓ Creates wrapped token
4. Bridge Out from Sepolia (bridgeOutToChain.js)
   ↓ Creates transfer VAA
5. Bridge In to BSC (bridgeInFromChain.js)
   ✅ Tokens received on BSC
```

## Notes

- Attestation is a **one-time process** per token per destination chain
- Once attested, the token can be bridged multiple times
- Keep your VAAs safe - they're needed for bridging in
- Test with small amounts first

## Support

For issues with:
- **Wormhole SDK**: Check [Wormhole Documentation](https://docs.wormhole.com/)
- **This script**: Check console logs for detailed error messages