// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CustomStrategyWormhole.sol";
import "./utils/IUniswapV3.sol";
import "./utils/Path.sol";
import "./utils/BytesLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CustomStrategyWormholeV2 is CustomStrategyWormhole {
    using Path for bytes;
    using BytesLib for bytes;
    using SafeERC20 for IERC20;

    // State variables
    IUniswapV3 public swapRouter;
    mapping(bytes32 => bool) public isPathAllowed;
    mapping(address => AssetRecord) public assetLedger;

    // Struct definition
    struct AssetRecord {
        uint256 totalBought;
        uint256 totalSold;
        uint256 underlyingSpentOnBuys;
        uint256 underlyingReceivedOnSells;
    }

    // Events
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event PathAllowed(bytes32 indexed pathHash, bytes path);
    event PathDisallowed(bytes32 indexed pathHash, bytes path);

    // Version function
    function version() public pure returns (string memory) {
        return "V2";
    }

    // Router Management
    /**
     * @notice Updates the Uniswap V3 router address.
     * @dev Can only be called by the ADMIN role.
     * @param _newRouter The new router contract address.
     */
    function setSwapRouter(address _newRouter) external onlyAdmin {
        swapRouter = IUniswapV3(_newRouter);
    }

    // Path Whitelisting Functions
    /**
     * @notice Whitelists a new swap path, allowing it to be used in swaps.
     * @dev Can only be called by the ADMIN. This function is the gatekeeper for
     *      the strategy's operational routes. It computes a hash of the path
     *      and stores it in the `isPathAllowed` mapping.
     * @param path The encoded Uniswap V3 path to allow (e.g., abi.encodePacked(tokenA, fee, tokenB)).
     */
    function allowSwapPath(bytes memory path) external onlyAdmin {
        require(path.length > 0, "Path cannot be empty");
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = true;
        emit PathAllowed(pathHash, path);
    }

    /**
     * @notice Removes a swap path from the whitelist, preventing it from being used.
     * @dev Can only be called by the ADMIN. This is a critical safety feature to
     *      disable a route if a pool is compromised or a better route is found.
     * @param path The encoded Uniswap V3 path to disallow.
     */
    function disallowSwapPath(bytes memory path) external onlyAdmin {
        require(path.length > 0, "Path cannot be empty");
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = false;
        emit PathDisallowed(pathHash, path);
    }
    /**
     * @notice The core internal function to execute exact input swaps and handle all accounting.
     * @dev This function is the single point of truth for swapping and accounting. It is called by
     *      the public-facing swap functions after they have validated the whitelisted path.
     * @param path The encoded Uniswap V3 swap path.
     * @param amountIn The exact amount of input tokens to swap.
     * @param amountOutMinimum The minimum amount of output tokens expected.
     * @return amountOut The actual amount of output tokens received.
     */
    function _executeSwap(
        bytes memory path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        // 1. **Decode Path & Identify Tokens:**
        // We use the battle-tested Uniswap libraries to reliably determine the
        // ultimate start and end tokens of the entire swap journey.
        (address tokenIn, , ) = path.decodeFirstPool();
        address tokenOut = path.toAddress(path.length - 20); // The last token is always the last 20 bytes.

        // 2. **Identify Operation Type:**
        // This logic determines if the swap is a BUY, a SELL, or a cross-asset trade,
        // which is crucial for the accounting step.
        bool isBuy = (tokenIn == underlyingToken) && (tokenOut != underlyingToken);
        bool isSell = (tokenIn != underlyingToken) && (tokenOut == underlyingToken);

        // 3. **Take Pre-Swap Balance Snapshots:**
        // This is the *only* reliable way to measure the true financial impact of the swap.
        // It accounts for any fees, slippage, or deflationary/tax tokens.
        uint256 tokenInBalanceBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 tokenOutBalanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // 4. **Execute the Swap:**
        // We are swapping a known amount of `tokenIn` for `tokenOut`.
        IERC20(tokenIn).approve(address(swapRouter), 0);
        IERC20(tokenIn).approve(address(swapRouter), amountIn);
        IUniswapV3.ExactInputParams memory params = IUniswapV3.ExactInputParams({
            path: path,
            recipient: address(this), // The swapped tokens are sent to this contract.
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        });
        amountOut = swapRouter.exactInput(params);
        IERC20(tokenIn).approve(address(swapRouter), 0); // Reset approval after swap

        // 5. **Calculate Actual Amounts Transferred:**
        // We check the balances again *after* the swap to get the ground truth of what was moved.
        uint256 amountInUsed = tokenInBalanceBefore - IERC20(tokenIn).balanceOf(address(this));
        uint256 amountOutReceived = IERC20(tokenOut).balanceOf(address(this)) - tokenOutBalanceBefore;

        // 6. **Update the AssetLedger:**
        // Based on the operation type we identified earlier, we update the correct record.
        if (isBuy) {
            // We spent `underlyingToken` to acquire `tokenOut`.
            assetLedger[tokenOut].totalBought += amountOutReceived;
            assetLedger[tokenOut].underlyingSpentOnBuys += amountInUsed;
        } else if (isSell) {
            // We sold `tokenIn` to receive `underlyingToken`.
            assetLedger[tokenIn].totalSold += amountInUsed;
            assetLedger[tokenIn].underlyingReceivedOnSells += amountOutReceived;
        }
        // Note: For cross-asset swaps (e.g., WBTC -> WETH), no ledger update occurs,
        // as it is neither a direct buy nor a direct sell against the underlying asset.

        // 7. **Emit the Event:**
        // This provides a transparent, on-chain log of the swap's true outcome for off-chain services.
        emit Swapped(tokenIn, tokenOut, amountInUsed, amountOutReceived);

        // Return the amount of output tokens received.
        return amountOut;
    }

    // Public-Facing Swap Functions

    /**
     * @notice Executes an exact input single-hop swap.
     * @dev Constructs the swap path and validates it before executing the swap.
     * @param tokenIn The input token address.
     * @param tokenOut The output token address.
     * @param fee The pool fee tier.
     * @param amountIn The exact amount of input tokens to swap.
     * @param amountOutMinimum The minimum amount of output tokens expected.
     * @return amountOut The actual amount of output tokens received.
     */
    function swapExactInputSingleHop(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
        bytes32 pathHash = keccak256(path);
        require(isPathAllowed[pathHash], "Path not allowed");

        return _executeSwap(path, amountIn, amountOutMinimum);
    }

    /**
     * @notice Executes an exact input multi-hop swap.
     * @dev Validates the provided path before executing the swap.
     * @param path The encoded multi-hop swap path.
     * @param amountIn The exact amount of input tokens to swap.
     * @param amountOutMinimum The minimum amount of output tokens expected.
     * @return amountOut The actual amount of output tokens received.
     */
    function swapExactInputMultiHop(
        bytes memory path,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyReportingManager whenNotPaused returns (uint256 amountOut) {
        bytes32 pathHash = keccak256(path);
        require(isPathAllowed[pathHash], "Path not allowed");

        return _executeSwap(path, amountIn, amountOutMinimum);
    }


}
