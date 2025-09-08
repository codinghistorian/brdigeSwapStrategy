// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./utils/IUniswapV3.sol";
import "./utils/Path.sol";
import "./utils/BytesLib.sol";
import "./utils/IV3SwapRouter.sol";

// Wormhole interfaces
interface IWormhole {
    struct VM {
        uint8 version;
        uint32 timestamp;
        uint32 nonce;
        uint16 emitterChainId;
        bytes32 emitterAddress;
        uint64 sequence;
        uint8 consistencyLevel;
        bytes payload;
        uint32 guardianSetIndex;
        Signature[] signatures;
        bytes32 hash;
    }

    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint8 guardianIndex;
    }

    function messageFee() external view returns (uint256);
    function parseAndVerifyVM(bytes calldata encodedVM) external view returns (VM memory vm, bool valid, string memory reason);
}

interface ITokenBridge {
    function transferTokensWithPayload(
        address token,
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient,
        uint32 nonce,
        bytes memory payload
    ) external payable returns (uint64 sequence);

    function completeTransferWithPayload(bytes memory encodedVm) external;

    function wrappedAsset(uint16 tokenChainId, bytes32 tokenAddress) external view returns (address);
}

contract CustomStrategyWormholeV5 is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using Path for bytes;
    using BytesLib for bytes;

    // =====================================================
    // TYPE DECLARATIONS
    // =====================================================

    // DEX Router enumeration
    enum DexRouter {
        UNISWAP_V3,
        PANCAKESWAP_V3
    }

    // Asset tracking structure
    struct AssetRecord {
        uint256 totalBought;
        uint256 totalSold;
        uint256 underlyingSpentOnBuys;
        uint256 underlyingReceivedOnSells;
    }

    // =====================================================
    // STATE VARIABLES
    // =====================================================

    // Role constants
    bytes32 public constant REPORTING_MANAGER = keccak256("REPORTING_MANAGER");
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // Chain constants
    uint16 public constant SOLANA_CHAIN_ID = 1;

    // Core configuration
    address public underlyingToken;

    // Accounting state
    uint256 public totalDeposited;
    uint256 public totalBridgedIn;
    uint256 public totalBridgedOut;

    // Wormhole integration
    IWormhole public wormhole;
    ITokenBridge public tokenBridge;
    bytes32 public solanaAggregatorAddress;

    // DEX Router integration
    DexRouter public currentDexRouter;
    IUniswapV3 public uniswapRouter;
    IV3SwapRouter public pancakeRouter;

    mapping(bytes32 => bool) public isPathAllowed;
    mapping(address => AssetRecord) public assetLedger;
    mapping(address => uint256) public totalWithdrawn;

    // =====================================================
    // NEW V5 STATE VARIABLES - MULTI-DEX SUPPORT
    // =====================================================

    // Per-token, per-chain tracking for multi-chain bridge operations
    mapping(address => mapping(uint16 => uint256)) public tokenBridgedOut; // token => chainId => amount
    mapping(address => mapping(uint16 => uint256)) public tokenBridgedIn;  // token => chainId => amount

    // DEX-specific path validation
    mapping(DexRouter => mapping(bytes32 => bool)) public isPathAllowedByDex;

    // =====================================================
    // EVENTS
    // =====================================================

    // Core operation events
    event Deposited(address manager, uint256 amount);
    event Initialized(
        address wormhole,
        address tokenBridge,
        address underlyingToken,
        bytes32 solanaAggregatorAddress,
        address uniswapRouter,
        address pancakeRouter
    );

    // Bridge operation events
    event BridgedIn(address manager, uint256 amount);
    event BridgedOut(uint256 amount, uint64 sequence);

    // Admin operation events
    event Withdrawn(address manager, uint256 amount, address to);

    // DEX Router events
    event DexRouterSwitched(DexRouter indexed oldRouter, DexRouter indexed newRouter);
    event DexRouterConfigured(DexRouter indexed dexRouter, address indexed routerAddress);

    // Uniswap operation events
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, DexRouter indexed dexUsed);
    event PathAllowed(DexRouter indexed dexRouter, bytes32 indexed pathHash, bytes path);
    event PathDisallowed(DexRouter indexed dexRouter, bytes32 indexed pathHash, bytes path);

    // =====================================================
    // NEW V5 EVENTS
    // =====================================================

    // Multi-chain bridge events
    event MultiChainBridgedOut(
        address indexed token,
        uint256 amount,
        uint16 indexed destinationChainId,
        bytes32 recipient,
        uint64 sequence
    );

    event MultiChainBridgedIn(
        address indexed token,
        uint256 amount,
        uint16 indexed sourceChainId,
        address indexed manager
    );

    // =====================================================
    // ERRORS
    // =====================================================

    error InsufficientBalance(uint256 requested, uint256 available);
    error Unauthorized();
    error EmptyPath();
    error PathNotAllowed(bytes32 pathHash);
    error InvalidDexRouter();
    error DexRouterNotConfigured();

    // =====================================================
    // MODIFIERS
    // =====================================================

    modifier onlyReportingManager() {
        if (!hasRole(REPORTING_MANAGER, msg.sender)) revert Unauthorized();
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole(ADMIN, msg.sender)) revert Unauthorized();
        _;
    }

    // =====================================================
    // INITIALIZE FUNCTION - UPDATED FOR V5
    // =====================================================

    function initialize(
        address _wormhole,
        address _tokenBridge,
        address _underlyingToken,
        bytes32 _solanaAggregatorAddress,
        address _uniswapRouter,
        address _pancakeRouter
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        _grantRole(REPORTING_MANAGER, msg.sender);

        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
        underlyingToken = _underlyingToken;
        solanaAggregatorAddress = _solanaAggregatorAddress;

        // Configure DEX routers
        uniswapRouter = IUniswapV3(_uniswapRouter);
        pancakeRouter = IV3SwapRouter(_pancakeRouter);

        // Default to Uniswap V3 for backward compatibility
        currentDexRouter = DexRouter.UNISWAP_V3;

        emit Initialized(_wormhole, _tokenBridge, _underlyingToken, _solanaAggregatorAddress, _uniswapRouter, _pancakeRouter);
        emit DexRouterConfigured(DexRouter.UNISWAP_V3, _uniswapRouter);
        emit DexRouterConfigured(DexRouter.PANCAKESWAP_V3, _pancakeRouter);
    }

    // =====================================================
    // DEX ROUTER MANAGEMENT FUNCTIONS - NEW IN V5
    // =====================================================

    /**
     * @notice Switch the active DEX router
     * @param newDexRouter The new DEX router to use
     */
    function switchDexRouter(DexRouter newDexRouter) external onlyAdmin {
        if (uint8(newDexRouter) >= 2) revert InvalidDexRouter();

        DexRouter oldRouter = currentDexRouter;
        currentDexRouter = newDexRouter;

        emit DexRouterSwitched(oldRouter, newDexRouter);
    }

    /**
     * @notice Configure a new DEX router address
     * @param dexRouter The DEX router type
     * @param routerAddress The router contract address
     */
    function configureDexRouter(DexRouter dexRouter, address routerAddress) external onlyAdmin {
        if (routerAddress == address(0)) revert DexRouterNotConfigured();

        if (dexRouter == DexRouter.UNISWAP_V3) {
            uniswapRouter = IUniswapV3(routerAddress);
        } else if (dexRouter == DexRouter.PANCAKESWAP_V3) {
            pancakeRouter = IV3SwapRouter(routerAddress);
        }

        emit DexRouterConfigured(dexRouter, routerAddress);
    }

    /**
     * @notice Allow a swap path for a specific DEX router
     * @param dexRouter The DEX router type
     * @param path The encoded swap path
     */
    function allowPathForDex(DexRouter dexRouter, bytes calldata path) external onlyAdmin {
        if (path.length == 0) revert EmptyPath();
        bytes32 pathHash = keccak256(path);
        isPathAllowedByDex[dexRouter][pathHash] = true;
        emit PathAllowed(dexRouter, pathHash, path);
    }

    /**
     * @notice Disallow a swap path for a specific DEX router
     * @param dexRouter The DEX router type
     * @param path The encoded swap path
     */
    function disallowPathForDex(DexRouter dexRouter, bytes calldata path) external onlyAdmin {
        bytes32 pathHash = keccak256(path);
        isPathAllowedByDex[dexRouter][pathHash] = false;
        emit PathDisallowed(dexRouter, pathHash, path);
    }

    // =====================================================
    // CORE FUNCTIONS
    // =====================================================

    function deposit(uint256 amount) external onlyReportingManager whenNotPaused {
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        IERC20(underlyingToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 actual = balanceAfter - balanceBefore;
        totalDeposited += actual;
        emit Deposited(msg.sender, actual);
    }

    function bridgeOutToSolana(uint256 amount) external payable onlyReportingManager whenNotPaused {
        uint256 fee = wormhole.messageFee();
        if (msg.value < fee) revert InsufficientBalance(fee, msg.value);

        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        if (balanceBefore < amount) revert InsufficientBalance(amount, balanceBefore);

        IERC20(underlyingToken).approve(address(tokenBridge), amount);
        // Construct the empty payload
        bytes memory payload = new bytes(1);
        payload[0] = 0x00;
        uint64 sequence = tokenBridge.transferTokensWithPayload{value: msg.value}(
            underlyingToken,
            amount,
            SOLANA_CHAIN_ID,
            solanaAggregatorAddress,
            uint32(block.timestamp),
            payload
        );
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 bridged = balanceBefore - balanceAfter;
        totalBridgedOut += bridged;
        emit BridgedOut(bridged, sequence);
    }

    function bridgeInFromSolana(bytes memory encodedVAA) external onlyReportingManager {
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        tokenBridge.completeTransferWithPayload(encodedVAA);
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 amount = balanceAfter - balanceBefore;
        totalBridgedIn += amount;
        emit BridgedIn(msg.sender, amount);
    }

    // =====================================================
    // NEW V5 MULTI-CHAIN BRIDGE FUNCTIONS
    // =====================================================

    /**
     * @notice Bridge any ERC20 token to any Wormhole-supported chain
     * @param token The ERC20 token address to bridge
     * @param amount The amount of tokens to bridge
     * @param destinationChainId The Wormhole chain ID of the destination chain
     * @param recipient The recipient address on the destination chain
     */
    function bridgeOutToChain(
        address token,
        uint256 amount,
        uint16 destinationChainId,
        bytes32 recipient
    ) external payable onlyReportingManager whenNotPaused {
        uint256 fee = wormhole.messageFee();
        if (msg.value < fee) revert InsufficientBalance(fee, msg.value);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        if (balanceBefore < amount) revert InsufficientBalance(amount, balanceBefore);

        // Use low-level calls to approve the token bridge for non-compliant ERC20 tokens
        // 1. Approve 0 first
        (bool success1, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), 0)
        );
        require(success1, "Approve(0) failed");

        // 2. Approve the actual amount
        (bool success2, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), amount)
        );
        require(success2, "Approve(amount) failed");

        bytes memory payload = new bytes(0);

        uint64 sequence = tokenBridge.transferTokensWithPayload{value: msg.value}(
            token,
            amount,
            destinationChainId,
            recipient,
            uint32(block.timestamp),
            payload
        );

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 bridged = balanceBefore - balanceAfter;

        // Update per-token, per-chain accounting
        tokenBridgedOut[token][destinationChainId] += bridged;

        emit MultiChainBridgedOut(token, bridged, destinationChainId, recipient, sequence);
    }

    /**
     * @notice Complete a bridge transfer from any chain using VAA
     * @param encodedVAA The VAA (Verifiable Action Approval) from Wormhole
     */
    function bridgeInFromChain(bytes memory encodedVAA) external onlyReportingManager {
        // First, we need to determine which token will be received
        // by parsing the VAA without completing the transfer
        (address token, uint16 sourceChainId) = _extractTokenAndChain(encodedVAA);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        tokenBridge.completeTransferWithPayload(encodedVAA);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        uint256 amount = balanceAfter - balanceBefore;

        if (amount > 0) {
            // Update per-token, per-chain accounting
            tokenBridgedIn[token][sourceChainId] += amount;

            emit MultiChainBridgedIn(token, amount, sourceChainId, msg.sender);
        }
    }

    // =====================================================
    // HELPER FUNCTIONS FOR VAA PARSING
    // =====================================================

    /**
     * @dev Extract token address and source chain from VAA
     * Based on Wormhole Bridge's VAA structure for token transfers
     */
    function _extractTokenAndChain(bytes memory encodedVAA) internal view returns (address token, uint16 sourceChainId) {
        // Parse and verify the VAA using Wormhole core contract
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVAA);
        require(valid, reason);

        // Parse the transfer payload structure
        bytes memory payload = vm.payload;
        uint8 payloadID = uint8(payload[0]);

        // Both payload type 1 (Transfer) and type 3 (TransferWithPayload) have the same token info structure:
        // payloadID(1) + amount(32) + tokenAddress(32) + tokenChain(2) + ...

        require(payloadID == 1 || payloadID == 3, "Invalid payload type");

        // Extract tokenAddress (bytes32) at offset 33 (1 + 32)
        bytes32 tokenAddress;
        assembly {
            tokenAddress := mload(add(payload, 0x21)) // 0x21 = 33 bytes offset (1 + 32)
        }

        // Extract tokenChain (uint16) at offset 65 (1 + 32 + 32)
        uint16 tokenChain;
        assembly {
            tokenChain := mload(add(payload, 0x43)) // 0x43 = 67 bytes offset
            tokenChain := shr(240, tokenChain) // Shift right by 240 bits to get uint16
        }

        // The source chain is the emitter chain from the VAA
        sourceChainId = vm.emitterChainId;

        // Determine the actual token address
        if (tokenChain == uint16(block.chainid)) {
            // Native token - extract address from bytes32
            token = address(uint160(uint256(tokenAddress)));
        } else {
            // Wrapped token - look up the wrapper contract from token bridge
            token = tokenBridge.wrappedAsset(tokenChain, tokenAddress);
            require(token != address(0), "No wrapper for this token exists");
        }
    }

    // =====================================================
    // VIEW FUNCTIONS
    // =====================================================

    /**
     * @notice Gets the current message fee required by the Wormhole bridge.
     * @return The fee in wei.
     */
    function getMessageFee() external view returns (uint256) {
        return wormhole.messageFee();
    }

    /**
     * @notice Get the amount of a specific token bridged to/from a specific chain
     * @param token The token address
     * @param chainId The chain ID
     * @param isOut True for bridged out, false for bridged in
     * @return The total amount bridged
     */
    function getTokenBridgedAmount(address token, uint16 chainId, bool isOut) external view returns (uint256) {
        return isOut ? tokenBridgedOut[token][chainId] : tokenBridgedIn[token][chainId];
    }

    /**
     * @notice Check if a path is allowed for the current DEX router
     * @param path The encoded swap path
     * @return True if the path is allowed
     */
    function isPathAllowedForCurrentDex(bytes calldata path) external view returns (bool) {
        bytes32 pathHash = keccak256(path);
        return isPathAllowedByDex[currentDexRouter][pathHash];
    }

    /**
     * @notice Check if a path is allowed for a specific DEX router
     * @param dexRouter The DEX router type
     * @param path The encoded swap path
     * @return True if the path is allowed
     */
    function isPathAllowedForDex(DexRouter dexRouter, bytes calldata path) external view returns (bool) {
        bytes32 pathHash = keccak256(path);
        return isPathAllowedByDex[dexRouter][pathHash];
    }

    /**
     * @notice Get the current DEX router address
     * @return The address of the current DEX router
     */
    function getCurrentDexRouterAddress() external view returns (address) {
        if (currentDexRouter == DexRouter.UNISWAP_V3) {
            return address(uniswapRouter);
        } else if (currentDexRouter == DexRouter.PANCAKESWAP_V3) {
            return address(pancakeRouter);
        }
        revert InvalidDexRouter();
    }

    // =====================================================
    // DEX-AGNOSTIC SWAP FUNCTIONS - UPDATED FOR V5
    // =====================================================

    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        return _swapExactInputSingle(tokenIn, tokenOut, fee, amountIn, amountOutMinimum, sqrtPriceLimitX96);
    }

    function swapExactInput(
        bytes calldata path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        return _swapExactInput(path, amountIn, amountOutMinimum);
    }

    // =====================================================
    // INTERNAL DEX-AGNOSTIC SWAP FUNCTIONS
    // =====================================================

    /**
     * @dev Internal function to handle exact input single swaps across different DEX routers
     */
    function _swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) internal returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        if (balanceBefore < amountIn) revert InsufficientBalance(amountIn, balanceBefore);

        if (currentDexRouter == DexRouter.UNISWAP_V3) {
            // Use Uniswap V3 interface (without deadline)
            IERC20(tokenIn).approve(address(uniswapRouter), amountIn);

            IUniswapV3.ExactInputSingleParams memory params = IUniswapV3.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            });

            amountOut = uniswapRouter.exactInputSingle(params);

        } else if (currentDexRouter == DexRouter.PANCAKESWAP_V3) {
            // Use PancakeSwap V3 interface (with deadline)
            IERC20(tokenIn).approve(address(pancakeRouter), amountIn);

            IV3SwapRouter.ExactInputSingleParams memory params = IV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            });

            amountOut = pancakeRouter.exactInputSingle(params);

        } else {
            revert InvalidDexRouter();
        }

        // Update asset ledger
        _updateAssetLedger(tokenIn, tokenOut, amountIn, amountOut);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, currentDexRouter);
    }

    /**
     * @dev Internal function to handle exact input multi-hop swaps across different DEX routers
     */
    function _swapExactInput(
        bytes calldata path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        bytes32 pathHash = keccak256(path);
        if (!isPathAllowedByDex[currentDexRouter][pathHash]) revert PathNotAllowed(pathHash);

        (address tokenIn, , ) = path.decodeFirstPool();
        address tokenOut = path.toAddress(path.length - 20);

        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        if (balanceBefore < amountIn) revert InsufficientBalance(amountIn, balanceBefore);

        if (currentDexRouter == DexRouter.UNISWAP_V3) {
            // Use Uniswap V3 interface (without deadline)
            IERC20(tokenIn).approve(address(uniswapRouter), amountIn);

            IUniswapV3.ExactInputParams memory params = IUniswapV3.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            });

            amountOut = uniswapRouter.exactInput(params);

        } else if (currentDexRouter == DexRouter.PANCAKESWAP_V3) {
            // Use PancakeSwap V3 interface (with deadline)
            IERC20(tokenIn).approve(address(pancakeRouter), amountIn);

            IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            });

            amountOut = pancakeRouter.exactInput(params);

        } else {
            revert InvalidDexRouter();
        }

        // Update asset ledger
        _updateAssetLedger(tokenIn, tokenOut, amountIn, amountOut);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, currentDexRouter);
    }

    /**
     * @dev Internal function to update asset ledger after swaps
     */
    function _updateAssetLedger(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) internal {
        if (tokenIn == underlyingToken) {
            assetLedger[tokenOut].totalBought += amountOut;
            assetLedger[tokenOut].underlyingSpentOnBuys += amountIn;
        } else if (tokenOut == underlyingToken) {
            assetLedger[tokenIn].totalSold += amountIn;
            assetLedger[tokenIn].underlyingReceivedOnSells += amountOut;
        }
    }

    // =====================================================
    // LEGACY FUNCTIONS FOR BACKWARD COMPATIBILITY
    // =====================================================

    /**
     * @notice Legacy function for backward compatibility - allows path without DEX specification
     * @dev This uses the legacy global path allowance (deprecated in V5)
     */
    function allowPath(bytes calldata path) external onlyAdmin {
        if (path.length == 0) revert EmptyPath();
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = true;
        emit PathAllowed(currentDexRouter, pathHash, path);
    }

    /**
     * @notice Legacy function for backward compatibility - disallows path without DEX specification
     * @dev This uses the legacy global path allowance (deprecated in V5)
     */
    function disallowPath(bytes calldata path) external onlyAdmin {
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = false;
        emit PathDisallowed(currentDexRouter, pathHash, path);
    }

    // =====================================================
    // ADMIN FUNCTIONS
    // =====================================================

    function withdraw(uint256 amount, address to) external onlyAdmin {
        uint256 balance = IERC20(underlyingToken).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(amount, balance);

        IERC20(underlyingToken).safeTransfer(to, amount);
        totalWithdrawn[to] += amount;

        emit Withdrawn(msg.sender, amount, to);
    }

    function withdrawToken(address token, uint256 amount, address to) external onlyAdmin {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(amount, balance);

        IERC20(token).safeTransfer(to, amount);
        totalWithdrawn[to] += amount;

        emit Withdrawn(msg.sender, amount, to);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    // =====================================================
    // EMERGENCY FUNCTIONS
    // =====================================================

    function emergencyWithdraw(address token, address to) external onlyAdmin {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
            totalWithdrawn[to] += balance;
            emit Withdrawn(msg.sender, balance, to);
        }
    }

    /**
     * @notice Simple VAA redemption without parsing - bypasses the buggy _extractTokenAndChain function
     * @param encodedVAA The VAA (Verifiable Action Approval) from Wormhole
     * @dev This function simply passes the VAA to the token bridge without any parsing
     */
    function simpleRedeemVAA(bytes memory encodedVAA) external onlyReportingManager {
        // Simply call completeTransferWithPayload on the token bridge
        // This will handle all VAA validation and token transfers
        tokenBridge.completeTransferWithPayload(encodedVAA);
    }
}
