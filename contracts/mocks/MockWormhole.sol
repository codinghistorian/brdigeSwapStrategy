// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockWormhole {
    // State variables
    uint256 public constant MESSAGE_FEE = 0.01 ether;

    // =====================================================
    // EXTERNAL FUNCTIONS
    // =====================================================

    function messageFee() external pure returns (uint256) {
        return MESSAGE_FEE;
    }
}

contract MockTokenBridge {
    // State variables
    uint64 private _sequenceCounter = 1;

    // Events
    event TransferTokensWithPayload(
        address token,
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient,
        uint32 nonce,
        bytes payload,
        uint64 sequence
    );

    event CompleteTransferWithPayload(bytes encodedVm);

    // =====================================================
    // EXTERNAL FUNCTIONS
    // =====================================================

    function transferTokensWithPayload(
        address token,
        uint256 amount,
        uint16 recipientChain,
        bytes32 recipient,
        uint32 nonce,
        bytes memory payload
    ) external payable returns (uint64 sequence) {
        sequence = _sequenceCounter++;

        // For testing, we just emit an event and return a sequence number
        // In real implementation, this would lock tokens and emit VAA
        emit TransferTokensWithPayload(
            token,
            amount,
            recipientChain,
            recipient,
            nonce,
            payload,
            sequence
        );

        return sequence;
    }

    function completeTransferWithPayload(bytes memory encodedVm) external {
        // For testing, we just emit an event
        // In real implementation, this would verify VAA and release tokens
        emit CompleteTransferWithPayload(encodedVm);
    }
}
