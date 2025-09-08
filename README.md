# Splyce Solidity Strategies - Wormhole Integration

This directory contains Solidity contracts for cross-chain strategy execution using Wormhole protocol, designed to work seamlessly with the Splyce Solana vault system.

## Overview

The `CustomStrategyWormhole` contract enables:
- Cross-chain token transfers from Solana to Ethereum/EVM chains via Wormhole
- Execution of DeFi strategies on Ethereum (Uniswap V2/V3/V4)
- Value reporting and portfolio management across chains
- Secure token bridging back to Solana vaults

## Architecture

### Cross-Chain Flow
1. **Solana → Ethereum**: Tokens are bridged from Solana vaults via Wormhole Token Bridge
2. **Strategy Execution**: Ethereum contract receives tokens and executes DeFi strategies
3. **Value Reporting**: Portfolio values are calculated and reported back to Solana
4. **Token Return**: Profits/assets can be bridged back to Solana vaults

### Supported Strategies
- **Uniswap V2**: Classic AMM swaps with multi-hop routing
- **Uniswap V3**: Concentrated liquidity swaps with fee tiers
- **Uniswap V4**: Next-generation swaps with hooks and custom logic
- **Custom Strategies**: Extensible framework for additional DeFi protocols

## Features

### Security
- **Access Control**: Role-based permissions (ADMIN, REPORTING_MANAGER)
- **Pausable**: Emergency stop functionality
- **Reentrancy Protection**: Prevents reentrancy attacks
- **Token Whitelisting**: Only approved tokens can be processed
- **VAA Verification**: All Wormhole messages are cryptographically verified

### Cross-Chain Messaging
- **Wormhole Integration**: Native Wormhole protocol support
- **Message Verification**: VAA (Verifiable Action Approval) validation
- **Replay Protection**: Prevents duplicate message processing
- **Emitter Registration**: Authorized Solana programs only

### Portfolio Management
- **Balance Tracking**: Real-time token balance monitoring
- **Active Token Management**: Efficient storage for non-zero balances
- **Value Reporting**: Portfolio valuation in multiple tokens
- **Slippage Protection**: Configurable slippage limits

## Setup

### Prerequisites
- Node.js 16+ and npm
- Hardhat development environment
- Access to Ethereum/Sepolia networks
- Wormhole guardian network access

### Installation

```bash
cd solidity-strategies
npm install
```

### Environment Configuration

Create a `.env` file:
```bash
# Network RPC URLs
ETHEREUM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.alchemyapi.io/v2/YOUR_KEY

# Deployment wallet
PRIVATE_KEY=your_private_key_here

# Wormhole Configuration
WORMHOLE_CORE_ADDRESS=0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B
WORMHOLE_TOKEN_BRIDGE=0x3ee18B2214AFF97000D974cf647E7C347E8fa585
```

### Compilation

```bash
npm run compile
```

### Deployment

```bash
# Deploy to Sepolia testnet
npm run deploy -- --network sepolia

# Deploy to Ethereum mainnet  
npm run deploy -- --network ethereum
```

## Contract Interface

### Core Functions

#### Token Management
```solidity
function receiveWormholeTokens(bytes memory encodedVm) external
function sendTokensToSolana(address token, uint256 amount, bytes memory data) external
function getTokenBalance(address token) external view returns (uint256)
function getAllActiveTokens() external view returns (address[] memory, uint256[] memory)
```

#### Strategy Execution
```solidity
function executeSwap(SwapInstruction memory instruction) external returns (uint256 amountOut)
function batchSwap(SwapInstruction[] memory instructions) external returns (uint256[] memory)
```

#### Value Reporting
```solidity
function getTotalValue(address baseToken) external view returns (uint256)
function reportValueToSolana(address baseToken) external
```

### Administrative Functions

#### Access Control
```solidity
function whitelistToken(address token, bool whitelisted) external onlyRole(ADMIN)
function registerEmitter(bytes32 emitter, bool registered) external onlyRole(ADMIN)
function setDefaultSlippage(uint256 slippageBP) external onlyRole(ADMIN)
```

#### Emergency Functions
```solidity
function pause() external onlyRole(ADMIN)
function unpause() external onlyRole(ADMIN)
function emergencyWithdraw(address token, uint256 amount, address to) external onlyRole(ADMIN)
```

## Integration with Solana

### Message Flow

#### From Solana to Ethereum
1. Solana external_aggregator_wormhole program initiates transfer
2. Wormhole Token Bridge locks tokens on Solana
3. Guardian network validates and signs VAA
4. Ethereum contract receives and verifies VAA
5. Tokens are minted/unlocked on Ethereum
6. Strategy execution begins automatically

#### From Ethereum to Solana
1. Ethereum contract calls `sendTokensToSolana()`
2. Wormhole Core publishes message with token data
3. Guardian network creates VAA for Solana
4. Solana program receives and processes VAA
5. Tokens are unlocked/minted in Solana vault

### Supported Networks

#### Wormhole Chain IDs
- **Solana**: 1
- **Ethereum**: 2
- **Sepolia**: 2 (testnet)

#### Token Standards
- **Solana**: SPL tokens
- **Ethereum**: ERC-20 tokens
- **Cross-chain**: Wormhole wrapped tokens

## Configuration

### Router Addresses

#### Mainnet
```javascript
const ROUTERS = {
  uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  uniswapV3: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  uniswapV4: "0x...", // TBD when V4 launches
  wormholeCore: "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B",
  wormholeTokenBridge: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585"
};
```

#### Sepolia Testnet
```javascript
const ROUTERS = {
  uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  uniswapV3: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
  wormholeCore: "0x706abc4E45D419950511e474C7B9Ed348A4a716c",
  wormholeTokenBridge: "0xF890982f9310df57d00f659cf4fd87e65adEd8d7"
};
```

### Swap Configuration

```solidity
SwapInstruction memory instruction = SwapInstruction({
    fromToken: USDC_ADDRESS,
    toToken: WETH_ADDRESS,
    amountIn: 1000e6, // 1000 USDC
    minAmountOut: 0, // Calculate dynamically
    route: [SwapRoute({
        router: RouterType.V3,
        path: new address[](0),
        encodedPath: abi.encodePacked(USDC_ADDRESS, uint24(500), WETH_ADDRESS),
        fee: 500, // 0.05%
        hookData: ""
    })],
    deadline: block.timestamp + 300,
    maxSlippageBP: 300 // 3%
});
```

## Events

### Cross-Chain Events
```solidity
event TokensReceived(address indexed token, uint256 amount, bytes32 indexed vaaHash);
event TokensSentBack(address indexed token, uint256 amount, uint64 sequence);
event WormholeMessageReceived(bytes32 indexed vaaHash, uint64 sequence);
```

### Strategy Events
```solidity
event SwapExecuted(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut, RouterType router);
event ValueReported(address indexed baseToken, uint256 totalValue, uint64 sequence);
```

### Administrative Events
```solidity
event TokenWhitelisted(address indexed token, bool whitelisted);
event EmitterRegistered(bytes32 indexed emitter, bool registered);
event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
```

## Security Considerations

### Access Control
- **Multi-signature**: Use multi-sig wallets for admin functions
- **Role Separation**: Separate roles for different operations
- **Time Delays**: Consider timelock for critical changes

### Cross-Chain Security
- **VAA Verification**: Always verify Wormhole VAAs
- **Replay Protection**: Prevent duplicate message processing
- **Emitter Validation**: Only accept messages from authorized Solana programs

### DeFi Security
- **Slippage Protection**: Always set reasonable slippage limits
- **Token Validation**: Only interact with whitelisted tokens
- **MEV Protection**: Consider using private mempools for large trades

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npx hardhat test test/CustomStrategyWormhole.test.js

# Test with coverage
npx hardhat coverage
```

## Monitoring

### Key Metrics
- Cross-chain transfer success rate
- Strategy execution performance
- Gas optimization metrics
- Value reporting accuracy

### Alerts
- Failed Wormhole message processing
- Slippage exceeded events
- Emergency pause activations
- Unauthorized access attempts

## Support

### Documentation
- [Wormhole Documentation](https://docs.wormhole.com/)
- [Uniswap V3 Documentation](https://docs.uniswap.org/protocol/V3/introduction)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)

### Troubleshooting
- Check Wormhole VAA validity on [Wormholescan](https://wormholescan.io/)
- Verify token whitelist status
- Confirm network configurations
- Review gas settings for transactions

## License

MIT License 