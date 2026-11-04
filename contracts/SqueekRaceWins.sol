// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Sepolia-only receipts for server-attested AI race wins. No tokens or rewards.
/// @dev The attestor is trusted to judge the race; the EVM does not replay gameplay.
contract SqueekRaceWins is EIP712 {
    struct Win { bytes32 matchId; address player; bytes32 resultDigest; uint256 expiresAt; }
    struct RecordedWin { address player; bytes32 resultDigest; }
    bytes32 public constant WIN_TYPEHASH = keccak256("Win(bytes32 matchId,address player,bytes32 resultDigest,uint256 expiresAt)");
    address public immutable attestor;
    mapping(bytes32 => RecordedWin) public wins;
    event WinRecorded(bytes32 indexed matchId, address indexed player, bytes32 resultDigest);
    error WrongNetwork();
    error InvalidWin();
    error AlreadyRecorded();
    error InvalidAttestation();

    constructor(address signer) EIP712("SqueekRace Arena", "1") {
        if (block.chainid != 11155111) revert WrongNetwork();
        if (signer == address(0)) revert InvalidAttestation();
        attestor = signer;
    }

    function recordWin(Win calldata win, bytes calldata signature) external {
        if (msg.sender != win.player || win.matchId == bytes32(0) || win.resultDigest == bytes32(0) || block.timestamp > win.expiresAt) revert InvalidWin();
        if (wins[win.matchId].player != address(0)) revert AlreadyRecorded();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(WIN_TYPEHASH, win.matchId, win.player, win.resultDigest, win.expiresAt)));
        if (ECDSA.recover(digest, signature) != attestor) revert InvalidAttestation();
        wins[win.matchId] = RecordedWin(win.player, win.resultDigest);
        emit WinRecorded(win.matchId, win.player, win.resultDigest);
    }
}
