// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Add file-level interface definitions
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

contract CustomStrategyWormhole is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant REPORTING_MANAGER = keccak256("REPORTING_MANAGER");
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // Accounting state
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalBridgedIn;
    uint256 public totalBridgedOut;

    // Core state
    address public underlyingToken;
    uint16 public constant SOLANA_CHAIN_ID = 1;

    IWormhole public wormhole;
    ITokenBridge public tokenBridge;
    bytes32 public solanaAggregatorAddress;

    // Events
    event Deposited(address manager, uint256 amount);
    event Withdrawn(address manager, uint256 amount);
    event BridgedIn(address manager, uint256 amount);
    event BridgedOut(uint256 amount, uint64 sequence);
    event EmergencyWithdrawal(address token, uint256 amount, address to);

    // Admin events
    event SolanaAggregatorAddressUpdated(bytes32 oldAddress, bytes32 newAddress);

    // Lifecycle events
    event Initialized(
        address wormhole,
        address tokenBridge,
        address underlyingToken,
        bytes32 solanaAggregatorAddress
    );

    // Errors
    error InsufficientBalance(uint256 requested, uint256 available);
    error Unauthorized();

    function initialize(
        address _wormhole,
        address _tokenBridge,
        address _underlyingToken,
        bytes32 _solanaAggregatorAddress
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
        underlyingToken = _underlyingToken;
        solanaAggregatorAddress = _solanaAggregatorAddress;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        _grantRole(REPORTING_MANAGER, msg.sender);
        emit Initialized(_wormhole, _tokenBridge, _underlyingToken, _solanaAggregatorAddress);
    }

    modifier onlyReportingManager() {
        if (!hasRole(REPORTING_MANAGER, msg.sender)) revert Unauthorized();
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole(ADMIN, msg.sender)) revert Unauthorized();
        _;
    }

    function deposit(uint256 amount) external onlyReportingManager whenNotPaused {
        // pull underlying tokens from the manager
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        IERC20(underlyingToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 actual = balanceAfter - balanceBefore;
        totalDeposited += actual;
        emit Deposited(msg.sender, actual);
    }

    function withdraw(uint256 amount) external onlyReportingManager whenNotPaused {
        uint256 balanceBefore = IERC20(underlyingToken).balanceOf(address(this));
        if (balanceBefore < amount) revert InsufficientBalance(amount, balanceBefore);
        IERC20(underlyingToken).safeTransfer(msg.sender, amount);
        uint256 balanceAfter = IERC20(underlyingToken).balanceOf(address(this));
        uint256 actual = balanceBefore - balanceAfter;
        totalWithdrawn += actual;
        emit Withdrawn(msg.sender, actual);
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

    function setSolanaAggregatorAddress(bytes32 _solanaAggregatorAddress) external onlyAdmin {
        bytes32 oldAddress = solanaAggregatorAddress;
        solanaAggregatorAddress = _solanaAggregatorAddress;
        emit SolanaAggregatorAddressUpdated(oldAddress, _solanaAggregatorAddress);
    }

    function grantReportingManager(address account) external onlyAdmin {
        _grantRole(REPORTING_MANAGER, account);
    }

    function emergencyWithdraw(address token, uint256 amount, address to) external onlyAdmin {
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdrawal(token, amount, to);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }
} 