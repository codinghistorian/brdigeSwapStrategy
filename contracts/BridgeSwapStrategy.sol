// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IUniswapV3} from "./utils/IUniswapV3.sol";
import {IV3SwapRouter} from "./utils/IV3SwapRouter.sol";
import {Path} from "./utils/Path.sol";
import {BytesLib} from "./utils/BytesLib.sol";
import {IWormhole} from "./utils/IWormhole.sol";
import {ITokenBridge} from "./utils/ITokenBridge.sol";


contract BridgeSwapStrategy is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using Path for bytes;
    using BytesLib for bytes;

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

    // Wormhole integration
    IWormhole public wormhole;
    ITokenBridge public tokenBridge;
    bytes32 public solanaAggregatorAddress;

    // Uniswap V3 integration
    IUniswapV3 public swapRouter;
    // V6 state variables - PancakeSwap integration
    IV3SwapRouter public pancakeSmartRouter;
    mapping(bytes32 => bool) public isPathAllowed;

    // Path validation flag - defaults to false for flexible deployment
    bool public isPathValidationEnabled;




    // =====================================================
    // EVENTS
    // =====================================================

    // Core operation events
    event Deposited(address manager, address token, uint256 amount, uint256 timestamp);
    event Initialized(
        address wormhole,
        address tokenBridge,
        address underlyingToken,
        bytes32 solanaAggregatorAddress,
        address swapRouter,
        address pancakeRouter,
        uint256 timestamp
    );

    // Bridge operation events
    event BridgedOut(address token, uint256 amount, uint16 destinationChainId, bytes32 recipient, uint64 sequence, uint256 timestamp);
    event BridgedIn(address token, uint256 amount, uint16 sourceChainId, address manager, uint256 timestamp);

    // Admin operation events
    event Withdrawn(address manager, address token, uint256 amount, address to, uint256 timestamp);
    event UnderlyingTokenUpdated(address oldToken, address newToken, uint256 timestamp);

    // Uniswap operation events
    event Swapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp);
    event PathAllowed(bytes32 pathHash, bytes path, uint256 timestamp);
    event PathDisallowed(bytes32 pathHash, bytes path, uint256 timestamp);
    event PancakeSwapped(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp);

    // Path validation events
    event PathValidationToggled(bool enabled, uint256 timestamp);
    event UniswapRouterUpdated(address oldRouter, address newRouter, uint256 timestamp);
    event PancakeRouterUpdated(address oldRouter, address newRouter, uint256 timestamp);
    event SolanaAggregatorAddressUpdated(bytes32 oldAddress, bytes32 newAddress, uint256 timestamp);

    // =====================================================
    // ERRORS
    // =====================================================

    error InsufficientBalance(uint256 requested, uint256 available);
    error Unauthorized();
    error EmptyPath();
    error PathNotAllowed(bytes32 pathHash);

    error InvalidAmount(uint256 amount);
    error ApprovalFailed(address token, address spender, uint256 amount);
    error InsufficientBalanceToken(address token, uint256 required, uint256 available);
    error InsufficientOutput(uint256 expected, uint256 received);
    error InvalidRouterAddress();
    error InvalidSolanaAggregatorAddress();
    error InvalidUnderlyingTokenAddress();

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
    // INITIALIZE FUNCTION
    // =====================================================

    function initialize(
        address _wormhole,
        address _tokenBridge,
        address _underlyingToken,
        bytes32 _solanaAggregatorAddress,
        address _swapRouter,
        address _pancakeSmartRouter
    ) external initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        _grantRole(REPORTING_MANAGER, msg.sender);

        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
        underlyingToken = _underlyingToken;
        solanaAggregatorAddress = _solanaAggregatorAddress;
        swapRouter = IUniswapV3(_swapRouter);
        pancakeSmartRouter = IV3SwapRouter(_pancakeSmartRouter);

        emit Initialized(
            _wormhole,
            _tokenBridge,
            _underlyingToken,
            _solanaAggregatorAddress,
            _swapRouter,
            _pancakeSmartRouter,
            block.timestamp
        );
    }

    /// @notice Receives native tokens (e.g., ETH/BNB) sent directly to the contract.
    receive() external payable {}

    /// @notice Fallback to receive native tokens or data with no matching function.
    fallback() external payable {}

    // =====================================================
    // EXTERNAL FUNCTIONS
    // =====================================================

    // =====================================================
    // CORE FUNCTIONS
    // =====================================================

    /**
     * @notice Deposits tokens into the strategy
     * @param token The ERC20 token address to deposit
     * @param amount The amount of tokens to deposit
     */
    function deposit(address token, uint256 amount) external onlyReportingManager whenNotPaused {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actual = balanceAfter - balanceBefore;

        emit Deposited(msg.sender, token, actual, block.timestamp);
    }

    /**
     * @notice Bridges tokens out to Solana chain via Wormhole
     * @param amount The amount of underlying tokens to bridge
     */
    function bridgeOutToSolana(uint256 amount) external payable onlyReportingManager whenNotPaused {
        // Check message fee
        uint256 fee = wormhole.messageFee();
        if (msg.value < fee) revert InsufficientBalance(fee, msg.value);

        // Check token balance
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        if (balanceBefore < amount) revert InsufficientBalance(amount, balanceBefore);

        // Approve token for bridge transfer
        // Use low-level calls for approval to support non-compliant ERC20 tokens
        // 1. Approve 0 first
        (bool success1, ) = underlyingToken.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), 0)
        );
        if (!success1) revert ApprovalFailed(underlyingToken, address(tokenBridge), 0);

        // 2. Approve the exact amount
        (bool success2, ) = underlyingToken.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), amount)
        );
        if (!success2) revert ApprovalFailed(underlyingToken, address(tokenBridge), amount);
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
        emit BridgedOut(underlyingToken, bridged, SOLANA_CHAIN_ID, solanaAggregatorAddress, sequence, block.timestamp);
    }

    /**
     * @notice Bridges tokens in from Solana chain using Wormhole VAA
     * @param encodedVAA The Wormhole VAA containing bridge completion data
     */
    function bridgeInFromSolana(bytes memory encodedVAA) external onlyReportingManager {
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        tokenBridge.completeTransferWithPayload(encodedVAA);
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 amount = balanceAfter - balanceBefore;
        emit BridgedIn(underlyingToken, amount, SOLANA_CHAIN_ID, msg.sender, block.timestamp);
    }

    // =====================================================
    // MINIMAL BRIDGE FUNCTIONS
    // =====================================================

    /**
     * @notice Bridge tokens out to another chain (simplified - minimal version)
     * @param token The token to bridge
     * @param amount The amount to bridge
     * @param destinationChainId The destination chain ID (Wormhole format)
     * @param recipient The recipient address on destination chain (bytes32 format)
     */
    function bridgeOut(
        address token,
        uint256 amount,
        uint16 destinationChainId,
        bytes32 recipient
    ) external payable onlyReportingManager {
        // Validate input
        if (amount == 0) revert InvalidAmount(amount);
        //TODO balance check to see if the amount exceeds the balance of the contract
        // Approve token for bridge transfer
        // Use low-level calls to approve the token bridge for non-compliant ERC20 tokens
        // 1. Approve 0 first
        (bool success1, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), 0)
        );
        if (!success1) revert ApprovalFailed(token, address(tokenBridge), 0);

        // 2. Approve the exact amount
        (bool success2, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), amount)
        );
        if (!success2) revert ApprovalFailed(token, address(tokenBridge), amount);

        // Prepare bridge parameters
        // Use entire msg.value as fee (no messageFee call to avoid issues)
        uint256 messageFee = msg.value;

        // Create empty payload for standard transfer
        bytes memory payload = new bytes(0);

        // Execute the bridge transfer
        uint64 sequence = tokenBridge.transferTokensWithPayload{value: messageFee}(
            token,
            amount,
            destinationChainId,
            recipient,
            uint32(block.timestamp),
            payload
        );

        emit BridgedOut(token, amount, destinationChainId, recipient, sequence, block.timestamp);
    }

    /**
     * @notice Bridge tokens in using VAA (simplified - minimal version)
     * @param encodedVAA The VAA from Wormhole
     */
    function bridgeIn(bytes memory encodedVAA) external onlyReportingManager {
        tokenBridge.completeTransferWithPayload(encodedVAA);
        // TODO: Add VAA decoding to extract token, amount, and sourceChainId from encodedVAA
        // TODO: Implement VAA decoding for token, amount, and sourceChainId
        emit BridgedIn(address(0), 0, 0, msg.sender, block.timestamp);
    }







    // =====================================================
    // UNISWAP V3 INTEGRATION
    // =====================================================

    /**
     * @notice Allows a specific swap path for Uniswap V3 operations
     * @param path The encoded path data for the swap route
     */
    function allowPath(bytes calldata path) external onlyAdmin {
        if (path.length == 0) revert EmptyPath();
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = true;
        emit PathAllowed(pathHash, path, block.timestamp);
    }

    /**
     * @notice Disallows a specific swap path for Uniswap V3 operations
     * @param path The encoded path data for the swap route
     */
    function disallowPath(bytes calldata path) external onlyAdmin {
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = false;
        emit PathDisallowed(pathHash, path, block.timestamp);
    }

    /**
     * @notice Swaps exact input amount for output using Uniswap V3 single pool
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param fee The pool fee tier
     * @param amountIn The exact amount of input tokens
     * @param amountOutMinimum The minimum amount of output tokens to receive
     * @param sqrtPriceLimitX96 The price limit for the swap
     * @return amountOut The actual amount of output tokens received
     */
    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        // Conditional path validation
        if (isPathValidationEnabled) {
            bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
            bytes32 pathHash = keccak256(path);
            if (!isPathAllowed[pathHash]) revert PathNotAllowed(pathHash);
        }

        // Validate balance
        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        if (balanceBefore < amountIn) revert InsufficientBalance(amountIn, balanceBefore);

        // Approve tokens for swap
        // Use low-level calls for approval to support non-compliant ERC20 tokens
        // 1. Approve 0 first to reset any existing allowance
        (bool success1, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(swapRouter), 0)
        );
        if (!success1) revert ApprovalFailed(tokenIn, address(swapRouter), 0);

        // 2. Approve the actual amount
        (bool success2, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(swapRouter), amountIn)
        );
        if (!success2) revert ApprovalFailed(tokenIn, address(swapRouter), amountIn);

        // Prepare and execute swap
        IUniswapV3.ExactInputSingleParams memory params = IUniswapV3.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        amountOut = swapRouter.exactInputSingle(params);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, block.timestamp);
    }

    /**
     * @notice Swaps exact input amount for output using Uniswap V3 multi-hop path
     * @param path The encoded multi-hop path for the swap
     * @param amountIn The exact amount of input tokens
     * @param amountOutMinimum The minimum amount of output tokens to receive
     * @return amountOut The actual amount of output tokens received
     */
    function swapExactInput(
        bytes calldata path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        // Conditional path validation
        if (isPathValidationEnabled) {
            bytes32 pathHash = keccak256(path);
            if (!isPathAllowed[pathHash]) revert PathNotAllowed(pathHash);
        }

        (address tokenIn, , ) = path.decodeFirstPool();
        address tokenOut = path.toAddress(path.length - 20);

        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        if (balanceBefore < amountIn) revert InsufficientBalance(amountIn, balanceBefore);

        // Use low-level calls for approval to support non-compliant ERC20 tokens
        // 1. Approve 0 first to reset any existing allowance
        (bool success1, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(swapRouter), 0)
        );
        if (!success1) revert ApprovalFailed(tokenIn, address(swapRouter), 0);

        // 2. Approve the actual amount
        (bool success2, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(swapRouter), amountIn)
        );
        if (!success2) revert ApprovalFailed(tokenIn, address(swapRouter), amountIn);

        IUniswapV3.ExactInputParams memory params = IUniswapV3.ExactInputParams({
            path: path,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        });

        amountOut = swapRouter.exactInput(params);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, block.timestamp);
    }

    // =====================================================
    // PANCAKESWAP V3 BSC INTEGRATION
    // =====================================================

    /**
     * @notice Swap exact input single on PancakeSwap V3 (renamed from MinimalWormholeRelayerV2)
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param fee The pool fee (500, 3000, or 10000)
     * @param amountIn The amount of input tokens
     * @param amountOutMinimum Minimum amount of output tokens
     * @param sqrtPriceLimitX96 Price limit for the swap
     */
    function swapExactInputSinglePancakeV3(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external onlyReportingManager returns (uint256 amountOut) {
        // Conditional path validation
        if (isPathValidationEnabled) {
            bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
            bytes32 pathHash = keccak256(path);
            if (!isPathAllowed[pathHash]) revert PathNotAllowed(pathHash);
        }

        if (amountIn == 0) revert InvalidAmount(amountIn);

        // Check contract has sufficient balance
        uint256 balance = IERC20(tokenIn).balanceOf(address(this));
        if (balance < amountIn) revert InsufficientBalanceToken(tokenIn, amountIn, balance);

        // Use low-level calls for approval to support non-compliant ERC20 tokens
        // 1. Approve 0 first to reset any existing allowance
        (bool success1, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeSmartRouter), 0)
        );
        if (!success1) revert ApprovalFailed(tokenIn, address(pancakeSmartRouter), 0);

        // 2. Approve the actual amount
        (bool success2, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeSmartRouter), amountIn)
        );
        if (!success2) revert ApprovalFailed(tokenIn, address(pancakeSmartRouter), amountIn);

        // Execute swap
        IV3SwapRouter.ExactInputSingleParams memory params = IV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        amountOut = pancakeSmartRouter.exactInputSingle(params);
        if (amountOut < amountOutMinimum) revert InsufficientOutput(amountOutMinimum, amountOut);

        emit PancakeSwapped(tokenIn, tokenOut, amountIn, amountOut, block.timestamp);
    }

    // =====================================================
    // ADMIN FUNCTIONS
    // =====================================================

    /**
     * @notice Withdraws tokens from the contract to a specified address
     * @param token The token address to withdraw
     * @param amount The amount to withdraw
     * @param to The address to send tokens to
     */
    function withdraw(address token, uint256 amount, address to) external onlyAdmin {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(amount, balance);

        IERC20(token).safeTransfer(to, amount);

        emit Withdrawn(msg.sender, token, amount, to, block.timestamp);
    }

    /**
     * @notice Pauses the contract, disabling non-admin functions
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @notice Unpauses the contract, re-enabling all functions
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @notice Enables or disables path validation for swap functions
     * @param _enabled Whether to enable path validation
     */
    function setPathValidationEnabled(bool _enabled) external onlyAdmin {
        isPathValidationEnabled = _enabled;
        emit PathValidationToggled(_enabled, block.timestamp);
    }

    /**
     * @notice Updates the Uniswap V3 router address
     * @param _newRouter The new router address
     */
    function setUniswapRouter(address _newRouter) external onlyAdmin {
        if (_newRouter == address(0)) revert InvalidRouterAddress();
        address oldRouter = address(swapRouter);
        swapRouter = IUniswapV3(_newRouter);
        emit UniswapRouterUpdated(oldRouter, _newRouter, block.timestamp);
    }

    /**
     * @notice Updates the PancakeSwap V3 router address
     * @param _newRouter The new router address
     */
    function setPancakeRouter(address _newRouter) external onlyAdmin {
        if (_newRouter == address(0)) revert InvalidRouterAddress();
        address oldRouter = address(pancakeSmartRouter);
        pancakeSmartRouter = IV3SwapRouter(_newRouter);
        emit PancakeRouterUpdated(oldRouter, _newRouter, block.timestamp);
    }

    /**
     * @notice Updates the Solana aggregator address
     * @param _newAggregatorAddress The new Solana aggregator address
     */
    function setSolanaAggregatorAddress(bytes32 _newAggregatorAddress) external onlyAdmin {
        if (_newAggregatorAddress == bytes32(0)) revert InvalidSolanaAggregatorAddress();
        bytes32 oldAddress = solanaAggregatorAddress;
        solanaAggregatorAddress = _newAggregatorAddress;
        emit SolanaAggregatorAddressUpdated(oldAddress, _newAggregatorAddress, block.timestamp);
    }

    /**
     * @notice Updates the underlying token address
     * @dev This is a critical function that changes the core token used by the strategy.
     *      Use with extreme caution as it affects all bridge operations.
     * @param _newUnderlyingToken The new underlying token address
     */
    function setUnderlyingToken(address _newUnderlyingToken) external onlyAdmin {
        if (_newUnderlyingToken == address(0)) revert InvalidUnderlyingTokenAddress();
        
        address oldToken = underlyingToken;
        underlyingToken = _newUnderlyingToken;
        emit UnderlyingTokenUpdated(oldToken, _newUnderlyingToken, block.timestamp);
    }

    // =====================================================
    // EMERGENCY FUNCTIONS
    // =====================================================

    /**
     * @notice Emergency withdrawal of all tokens when contract is paused
     * @param token The token address to withdraw
     * @param to The address to send tokens to
     */
    function emergencyWithdraw(address token, address to) external onlyAdmin whenPaused {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
            emit Withdrawn(msg.sender, token, balance, to, block.timestamp);
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


}
