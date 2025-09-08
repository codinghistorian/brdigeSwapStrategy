// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../utils/IUniswapV3.sol";

contract MockUniswapV3 is IUniswapV3 {
    // Type declarations: struct, enum
    struct SwapRecord {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address recipient;
    }

    // State variables
    uint256 public constant MOCK_EXCHANGE_RATE = 110; // 110% (10% gain)
    uint256 public constant RATE_DENOMINATOR = 100;
    SwapRecord[] public swapHistory;

    // Events
    event MockSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    // Errors
    error InsufficientOutput(uint256 amountOut, uint256 amountOutMinimum);
    error TooMuchInputRequired(uint256 amountIn, uint256 amountInMaximum);

    // =====================================================
    // EXTERNAL FUNCTIONS
    // =====================================================

    // IUniswapV3 Interface Implementation
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        // Calculate mock output amount (10% gain)
        amountOut = (params.amountIn * MOCK_EXCHANGE_RATE) / RATE_DENOMINATOR;

        // Ensure minimum output is met
        if (amountOut < params.amountOutMinimum) revert InsufficientOutput(amountOut, params.amountOutMinimum);

        // Transfer tokens from sender to this contract
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Transfer output tokens to recipient
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);

        // Record the swap
        swapHistory.push(SwapRecord({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            amountOut: amountOut,
            recipient: params.recipient
        }));

        emit MockSwapExecuted(params.tokenIn, params.tokenOut, params.amountIn, amountOut, params.recipient);

        return amountOut;
    }

    function exactInput(ExactInputParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        // Decode the first and last tokens from the path
        address tokenIn = address(bytes20(params.path[0:20]));
        address tokenOut = address(bytes20(params.path[params.path.length-20:]));

        // Calculate mock output amount (10% gain)
        amountOut = (params.amountIn * MOCK_EXCHANGE_RATE) / RATE_DENOMINATOR;

        // Ensure minimum output is met
        if (amountOut < params.amountOutMinimum) revert InsufficientOutput(amountOut, params.amountOutMinimum);

        // Transfer tokens from sender to this contract
        IERC20(tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Transfer output tokens to recipient
        IERC20(tokenOut).transfer(params.recipient, amountOut);

        // Record the swap
        swapHistory.push(SwapRecord({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: params.amountIn,
            amountOut: amountOut,
            recipient: params.recipient
        }));

        emit MockSwapExecuted(tokenIn, tokenOut, params.amountIn, amountOut, params.recipient);

        return amountOut;
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        // Calculate mock input amount needed (reverse of 10% gain)
        amountIn = (params.amountOut * RATE_DENOMINATOR) / MOCK_EXCHANGE_RATE;

        // Ensure maximum input is not exceeded
        if (amountIn > params.amountInMaximum) revert TooMuchInputRequired(amountIn, params.amountInMaximum);

        // Transfer tokens from sender to this contract
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Transfer output tokens to recipient
        IERC20(params.tokenOut).transfer(params.recipient, params.amountOut);

        // Record the swap
        swapHistory.push(SwapRecord({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: amountIn,
            amountOut: params.amountOut,
            recipient: params.recipient
        }));

        emit MockSwapExecuted(params.tokenIn, params.tokenOut, amountIn, params.amountOut, params.recipient);

        return amountIn;
    }

    function exactOutput(ExactOutputParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {
        // Decode the first and last tokens from the path
        address tokenIn = address(bytes20(params.path[0:20]));
        address tokenOut = address(bytes20(params.path[params.path.length-20:]));

        // Calculate mock input amount needed (reverse of 10% gain)
        amountIn = (params.amountOut * RATE_DENOMINATOR) / MOCK_EXCHANGE_RATE;

        // Ensure maximum input is not exceeded
        if (amountIn > params.amountInMaximum) revert TooMuchInputRequired(amountIn, params.amountInMaximum);

        // Transfer tokens from sender to this contract
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Transfer output tokens to recipient
        IERC20(tokenOut).transfer(params.recipient, params.amountOut);

        // Record the swap
        swapHistory.push(SwapRecord({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: params.amountOut,
            recipient: params.recipient
        }));

        emit MockSwapExecuted(tokenIn, tokenOut, amountIn, params.amountOut, params.recipient);

        return amountIn;
    }

    // Testing and Utility Functions
    function getSwapHistoryLength() external view returns (uint256) {
        return swapHistory.length;
    }

    function getSwapRecord(uint256 index) external view returns (SwapRecord memory) {
        return swapHistory[index];
    }

    function clearSwapHistory() external {
        delete swapHistory;
    }

    // Function to fund the mock router with tokens for testing
    function fundRouter(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}
