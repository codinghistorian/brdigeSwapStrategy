# BridgeSwapStrategy – Wormhole Bridge + Uniswap V3 / PancakeSwap V3

This repository contains the upgradeable `BridgeSwapStrategy` contract that:
- Bridges ERC‑20 tokens via Wormhole TokenBridge
- Executes swaps on Uniswap V3 and PancakeSwap V3
- Enforces role‑based access control and pausability

No Uniswap V2/V4 integrations, token whitelists, portfolio tracking, or custom VAA parsing/replay protection are implemented.

## Deployed Contracts

- Ethereum Mainnet: `0xf90e6E8E1faFFCf4a204e45b3806390a877fcd7B`
- BSC Mainnet: `0x4F3862D359D8f76498f69732740E4d53b7676639`

### Ethereum Mainnet Initialization

- Wormhole Core: `0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B`
- Wormhole TokenBridge: `0x3ee18B2214AFF97000D974cf647E7C347E8fa585`
- Underlying Token (USDC): `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- Uniswap V3 Router (SwapRouter02): `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`
- PancakeSwap Router: `0x1b81D678ffb9C0263b24A97847620C99d213eB14`
- Solana WormholeAssetManager (base58): `2Bqh5uNnKHXQBNLfkK8Je8xvZ6SUis5RH4Ngif4hT3FL`
- Solana Aggregator Address (hex): `0x11a28cdc1df53b02a753adf7d6f498ce0677d7b7e1018f41d806a335fcb921f7`

### BSC Mainnet Initialization (to bridge to this contract, use id 2)

- Wormhole Core: `0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B`
- Wormhole TokenBridge: `0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7`
- Underlying Token (USDT): `0x55d398326f99059fF775485246999027B3197955`
- Uniswap V3 Router (SwapRouter02): `0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2`
- PancakeSwap Router (Smart Router): `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4`
- Solana WormholeAssetManager (base58): `2Bqh5uNnKHXQBNLfkK8Je8xvZ6SUis5RH4Ngif4hT3FL`
- Solana Aggregator Address (hex): `0x11a28cdc1df53b02a753adf7d6f498ce0677d7b7e1018f41d806a335fcb921f7`

## Contract Overview

`BridgeSwapStrategy` (Upgradeable)
- Inherits: `Initializable`, `AccessControlUpgradeable`, `PausableUpgradeable`
- Roles: `DEFAULT_ADMIN_ROLE`, `ADMIN`, `REPORTING_MANAGER`
- Constants: `SOLANA_CHAIN_ID = 1`

Key Storage
- `address underlyingToken`
- `IWormhole wormhole`, `ITokenBridge tokenBridge`
- `bytes32 solanaAggregatorAddress`
- `IUniswapV3 swapRouter`, `IV3SwapRouter pancakeSmartRouter`
- `mapping(bytes32 => bool) isPathAllowed`, `bool isPathValidationEnabled`

## External Interface

Initialization
```solidity
function initialize(
    address _wormhole,
    address _tokenBridge,
    address _underlyingToken,
    bytes32 _solanaAggregatorAddress,
    address _swapRouter,
    address _pancakeSmartRouter
) external initializer
```

Deposits
```solidity
function deposit(address token, uint256 amount) external onlyReportingManager whenNotPaused
```

Bridging
```solidity
// Bridges underlying token to Solana (chainId = 1). Requires msg.value >= wormhole.messageFee().
function bridgeOutToSolana(uint256 amount) external payable onlyReportingManager whenNotPaused

// Completes a Wormhole TokenBridge transfer (payload variant) using a VAA.
function bridgeInFromSolana(bytes memory encodedVAA) external onlyReportingManager

// Minimal, generic bridge out with empty payload; uses entire msg.value as fee.
function bridgeOut(address token, uint256 amount, uint16 destinationChainId, bytes32 recipient)
    external payable onlyReportingManager

// Minimal bridge in placeholder (emits with zeroed values; no VAA decoding yet).
function bridgeIn(bytes memory encodedVAA) external onlyReportingManager
```

Uniswap V3 Swaps
```solidity
// Single pool swap
function swapExactInputSingle(
    address tokenIn,
    address tokenOut,
    uint24 fee,
    uint256 amountIn,
    uint256 amountOutMinimum,
    uint160 sqrtPriceLimitX96
) external onlyReportingManager whenNotPaused returns (uint256 amountOut)

// Multi-hop swap using encoded V3 path
function swapExactInput(
    bytes calldata path,
    uint256 amountIn,
    uint256 amountOutMinimum
) external onlyReportingManager whenNotPaused returns (uint256 amountOut)
```

PancakeSwap V3 Swap
```solidity
function swapExactInputSinglePancakeV3(
    address tokenIn,
    address tokenOut,
    uint24 fee,
    uint256 amountIn,
    uint256 amountOutMinimum,
    uint160 sqrtPriceLimitX96
) external onlyReportingManager returns (uint256 amountOut)
```

Admin Controls
```solidity
function pause() external onlyAdmin
function unpause() external onlyAdmin
function withdraw(address token, uint256 amount, address to) external onlyAdmin
function setPathValidationEnabled(bool enabled) external onlyAdmin
function allowPath(bytes calldata path) external onlyAdmin
function disallowPath(bytes calldata path) external onlyAdmin
function setUniswapRouter(address newRouter) external onlyAdmin
function setPancakeRouter(address newRouter) external onlyAdmin
function setSolanaAggregatorAddress(bytes32 newAddr) external onlyAdmin
function setUnderlyingToken(address newToken) external onlyAdmin
```

Views
```solidity
function getMessageFee() external view returns (uint256)
```

## Events

Core/Bridge
```solidity
event Initialized(address wormhole, address tokenBridge, address underlyingToken, bytes32 solanaAggregatorAddress, address swapRouter, address pancakeRouter, uint256 timestamp);
event Deposited(address manager, address token, uint256 amount, uint256 timestamp);
event BridgedOut(address token, uint256 amount, uint16 destinationChainId, bytes32 recipient, uint64 sequence, uint256 timestamp);
event BridgedIn(address token, uint256 amount, uint16 sourceChainId, address manager, uint256 timestamp);
event Withdrawn(address manager, address token, uint256 amount, address to, uint256 timestamp);
```

Swaps/Validation/Config
```solidity
event Swapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp);
event PancakeSwapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp);
event PathAllowed(bytes32 pathHash, bytes path, uint256 timestamp);
event PathDisallowed(bytes32 pathHash, bytes path, uint256 timestamp);
event PathValidationToggled(bool enabled, uint256 timestamp);
event UniswapRouterUpdated(address oldRouter, address newRouter, uint256 timestamp);
event PancakeRouterUpdated(address oldRouter, address newRouter, uint256 timestamp);
event SolanaAggregatorAddressUpdated(bytes32 oldAddress, bytes32 newAddress, uint256 timestamp);
event UnderlyingTokenUpdated(address oldToken, address newToken, uint256 timestamp);
```

## Errors

`Unauthorized`, `InvalidAmount`, `InsufficientBalance`, `InsufficientBalanceToken`, `ApprovalFailed`, `InsufficientOutput`, `EmptyPath`, `PathNotAllowed`, `InvalidRouterAddress`, `InvalidSolanaAggregatorAddress`, `InvalidUnderlyingTokenAddress`.

## Usage (Scripts)

- Deploy upgradeable proxy: `scripts/deploy_bss.js`
- Uniswap V3 single‑pool swap: `scripts/uniswapActions/swapExactInputSingle.js`
- PancakeSwap V3 single‑pool swap: `scripts/pancakeswapActions/swapExactInputSinglePancakeV3.js`
- Bridge out (generic): `scripts/evmRelayerActions/bridgeOut.js`

Grant the `REPORTING_MANAGER` role to the operator that will call swap/bridge functions.

## Setup

```bash
npm install
npx hardhat compile
```

Environment variables (examples)
```bash
ETHEREUM_RPC_URL=...
BSC_RPC_URL=...
PRIVATE_KEY=...
```

## Notes & Limitations

- Path validation is optional and based on V3 path hashes via `allowPath`/`disallowPath`.
- Bridge functions delegate security to Wormhole TokenBridge contracts; no custom VAA parsing/replay protection is implemented in this contract.
- No Uniswap V2/V4 support; no portfolio valuation or token allowlists.

## License

MIT License