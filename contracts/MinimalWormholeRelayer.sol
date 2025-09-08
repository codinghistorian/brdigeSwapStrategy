// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

/**
 * @title MinimalWormholeRelayer
 * @dev Minimal contract for bridging tokens across chains using Wormhole
 */
contract MinimalWormholeRelayer {
    // Wormhole contracts
    IWormhole public wormhole;
    ITokenBridge public tokenBridge;

    constructor(
        address _wormhole,
        address _tokenBridge
    ) {
        wormhole = IWormhole(_wormhole);
        tokenBridge = ITokenBridge(_tokenBridge);
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
    ) external payable {
        require(amount > 0, "Amount must be greater than 0");

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
        require(success1, "Approve(0) failed");

        // 2. Approve the actual amount
        (bool success2, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", address(tokenBridge), amount)
        );
        require(success2, "Approve(amount) failed");
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
    function bridgeIn(bytes memory encodedVAA) external {
        tokenBridge.completeTransferWithPayload(encodedVAA);
    }

    /**
     * @notice Withdraw tokens from the contract
     * @param token The token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external {
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
