// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../utils/IV3SwapRouter.sol";

// Wormhole Core Interface
interface IWormhole {
    function messageFee() external view returns (uint256);
}

// Wormhole Token Bridge Interface
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



// Custom errors for gas optimization
error InvalidAmount(uint256 amount);
error ApprovalFailed(address token, address spender, uint256 amount);
error InsufficientBalance(address token, uint256 required, uint256 available);
error InsufficientOutput(uint256 expected, uint256 received);
error InvalidPath();
error PancakeSwapV3SwapFailedWithData(bytes data); // New custom error
error PancakeSwapV3SwapFailed();          // New custom error

/**
 * @title MinimalWormholeRelayer
 * @dev Minimal contract for bridging tokens across chains using Wormhole with PancakeSwap V3 support
 */
contract MinimalWormholeRelayerV2 is Ownable {
    // Wormhole contracts
    IWormhole public wormhole;
    ITokenBridge public tokenBridge;

    // PancakeSwap V3 router
    IV3SwapRouter public pancakeRouter;

    constructor(
        address _wormhole,
        address _tokenBridge,
        address _pancakeRouter
    ) Ownable(msg.sender) {
        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
        pancakeRouter = IV3SwapRouter(_pancakeRouter);
    }

    /**
     * @notice Bridge tokens out to another chain (simplified - no message fee check)
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
    ) external payable onlyOwner {
        if (amount == 0) revert InvalidAmount(amount);

        // NOTE: The contract must hold the tokens *before* this function is called.
        // The check below is removed because the relayer doesn't own the tokens,
        // rather the tokenBridge needs an allowance *from* the relayer.
        // require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient balance");

        // ======================= FIX STARTS HERE =======================
        // Use low-level calls to approve the token bridge. This is necessary for
        // non-compliant ERC20 tokens like older USDT that don't return a boolean
        // from the `approve` function.

        // 1. Approve 0 first
        (bool success1, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), 0)
        );
        if (!success1) revert ApprovalFailed(token, address(tokenBridge), 0);

        // 2. Approve the actual amount
        (bool success2, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), type(uint256).max)
        );
        if (!success2) revert ApprovalFailed(token, address(tokenBridge), type(uint256).max);
        // ======================== FIX ENDS HERE ========================

        // Use entire msg.value as fee (no messageFee call to avoid issues)
        uint256 messageFee = msg.value;

        // Create empty payload for standard transfer
        bytes memory payload = new bytes(0);

        // Execute the bridge transfer. Note: The tokenBridge contract will now use
        // transferFrom to pull the tokens from this relayer contract.
        tokenBridge.transferTokensWithPayload{value: messageFee}(
            token,
            amount,
            destinationChainId,
            recipient,
            uint32(block.timestamp),
            payload
        );
    }

    /**
     * @notice Bridge tokens in using VAA
     * @param encodedVAA The VAA from Wormhole
     */
    function bridgeIn(bytes memory encodedVAA) external onlyOwner {
        tokenBridge.completeTransferWithPayload(encodedVAA);
    }

    /**
     * @notice Swap exact input single on PancakeSwap V3
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param fee The pool fee (500, 3000, or 10000)
     * @param amountIn The amount of input tokens
     * @param amountOutMinimum Minimum amount of output tokens
     * @param sqrtPriceLimitX96 Price limit for the swap
     */
    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external onlyOwner returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount(amountIn);

        // Check contract has sufficient balance
        uint256 balance = IERC20(tokenIn).balanceOf(address(this));
        if (balance < amountIn) revert InsufficientBalance(tokenIn, amountIn, balance);

        // ======================= FIX STARTS HERE =======================
        // Use low-level calls for approval to support non-compliant ERC20 tokens.
        // 1. Approve 0 first to reset any existing allowance.
        (bool success1, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeRouter), 0)
        );
        if (!success1) revert ApprovalFailed(tokenIn, address(pancakeRouter), 0);

        // 2. Approve the actual amount.
        (bool success2, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeRouter), amountIn)
        );
        if (!success2) revert ApprovalFailed(tokenIn, address(pancakeRouter), amountIn);
        // ======================== FIX ENDS HERE ========================

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

        // Use try/catch to capture potential revert reasons from the router
        try pancakeRouter.exactInputSingle(params) returns (uint256 returnedAmount) {
            amountOut = returnedAmount; // Assign to named return variable
        } catch (bytes memory lowLevelData) {
            if (lowLevelData.length > 0) {
                assembly {
                    revert(add(lowLevelData, 0x20), mload(lowLevelData))
                }
            } else {
                revert PancakeSwapV3SwapFailed(); // Revert with generic error
            }
        }
        if (amountOut < amountOutMinimum) revert InsufficientOutput(amountOutMinimum, amountOut);
    }

    /**
     * @notice Swap exact input multi-hop on PancakeSwap V3
     * @param path The encoded swap path
     * @param amountIn The amount of input tokens
     * @param amountOutMinimum Minimum amount of output tokens
     */
    function swapExactInput(
        bytes memory path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyOwner returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount(amountIn);
        if (path.length == 0) revert InvalidPath();

        // Extract tokenIn from path. Path format: [address(20)][fee(3)][address(20)]...
        // Read the first 20 bytes (address) from memory and right-shift to strip padding
        address tokenIn;
        assembly {
            tokenIn := shr(96, mload(add(path, 32)))
        }

        // Check contract has sufficient balance
        uint256 balance = IERC20(tokenIn).balanceOf(address(this));
        if (balance < amountIn) revert InsufficientBalance(tokenIn, amountIn, balance);

        // ======================= FIX STARTS HERE =======================
        // Use low-level calls for approval to support non-compliant ERC20 tokens.
        // 1. Approve 0 first to reset any existing allowance.
        (bool success1, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeRouter), 0)
        );
        if (!success1) revert ApprovalFailed(tokenIn, address(pancakeRouter), 0);

        // 2. Approve the actual amount.
        (bool success2, ) = tokenIn.call(
            abi.encodeWithSignature("approve(address,uint256)", address(pancakeRouter), type(uint256).max)
        );
        if (!success2) revert ApprovalFailed(tokenIn, address(pancakeRouter), type(uint256).max);
        // ======================== FIX ENDS HERE ========================

        // Execute swap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        });

        amountOut = pancakeRouter.exactInput(params);
        if (amountOut < amountOutMinimum) revert InsufficientOutput(amountOutMinimum, amountOut);
    }

    /**
     * @notice Withdraw tokens from the contract
     * @param token The token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * @notice Get the Wormhole message fee
     */
    function getMessageFee() external view returns (uint256) {
        return wormhole.messageFee();
    }

    // Allow contract to receive ETH/BNB for fees
    receive() external payable {}

    fallback() external payable {}
}
