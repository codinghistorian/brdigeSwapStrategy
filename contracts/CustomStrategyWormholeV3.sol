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

// Wormhole interfaces
interface IWormhole {
    function messageFee() external view returns (uint256);
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
}

contract CustomStrategyWormholeV3 is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using Path for bytes;
    using BytesLib for bytes;

    // =====================================================
    // TYPE DECLARATIONS
    // =====================================================

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

    // Uniswap V3 integration
    IUniswapV3 public swapRouter;
    mapping(bytes32 => bool) public isPathAllowed;
    mapping(address => AssetRecord) public assetLedger;
    mapping(address => uint256) public totalWithdrawn;

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
        address swapRouter
    );

    // Bridge operation events
    event BridgedIn(address manager, uint256 amount);
    event BridgedOut(uint256 amount, uint64 sequence);

    // Admin operation events
    event SolanaAggregatorAddressUpdated(bytes32 oldAddress, bytes32 newAddress);
    event EmergencyWithdrawal(address token, uint256 amount, address to);
    event Withdrawn(address asset, uint256 amount, address to);

    // Uniswap operation events
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event PathAllowed(bytes32 indexed pathHash, bytes path);
    event PathDisallowed(bytes32 indexed pathHash, bytes path);

    // =====================================================
    // ERRORS
    // =====================================================

    error InsufficientBalance(uint256 requested, uint256 available);
    error Unauthorized();
    error EmptyPath();
    error PathNotAllowed(bytes32 pathHash);

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
        address _swapRouter
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
        underlyingToken = _underlyingToken;
        solanaAggregatorAddress = _solanaAggregatorAddress;
        swapRouter = IUniswapV3(_swapRouter);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        _grantRole(REPORTING_MANAGER, msg.sender);
        emit Initialized(_wormhole, _tokenBridge, _underlyingToken, _solanaAggregatorAddress, _swapRouter);
    }

    // =====================================================
    // EXTERNAL FUNCTIONS
    // =====================================================

    // Core Strategy Functions
    function deposit(uint256 amount) external whenNotPaused {
        // pull underlying tokens from the manager
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

    /**
     * @notice Gets the current message fee required by the Wormhole bridge.
     * @return The fee in wei.
     */
    function getWormholeFee() external view returns (uint256) {
        return wormhole.messageFee();
    }

    // Administrative Functions
    function setSolanaAggregatorAddress(bytes32 _solanaAggregatorAddress) external onlyAdmin {
        bytes32 oldAddress = solanaAggregatorAddress;
        solanaAggregatorAddress = _solanaAggregatorAddress;
        emit SolanaAggregatorAddressUpdated(oldAddress, _solanaAggregatorAddress);
    }

    function grantReportingManager(address account) external onlyAdmin {
        _grantRole(REPORTING_MANAGER, account);
    }

    function emergencyWithdraw(address token, uint256 amount, address to) external onlyAdmin whenPaused {
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdrawal(token, amount, to);
    }

    function withdraw(address asset, uint256 amount) external onlyAdmin whenNotPaused {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance(amount, balance);

        IERC20(asset).safeTransfer(msg.sender, amount);
        totalWithdrawn[asset] += amount;
        emit Withdrawn(asset, amount, msg.sender);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    // Uniswap V3 Configuration Functions
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
        if (path.length == 0) revert EmptyPath();
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
        if (path.length == 0) revert EmptyPath();
        bytes32 pathHash = keccak256(path);
        isPathAllowed[pathHash] = false;
        emit PathDisallowed(pathHash, path);
    }

    // Swap Execution Functions
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
        if (!isPathAllowed[pathHash]) revert PathNotAllowed(pathHash);

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
        if (!isPathAllowed[pathHash]) revert PathNotAllowed(pathHash);

        return _executeSwap(path, amountIn, amountOutMinimum);
    }

    // =====================================================
    // PUBLIC FUNCTIONS
    // =====================================================

    function version() public pure returns (string memory) {
        return "V3";
    }

    // =====================================================
    // INTERNAL FUNCTIONS
    // =====================================================

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
}
