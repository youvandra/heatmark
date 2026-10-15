// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Accreditation
/// @notice Who may verify. Stands in for a national accreditation body
/// (Accredia, RvA, Swedac, ...) that accredits CBAM verifiers under
/// Delegated Regulation (EU) 2025/2551. The accreditor can add and suspend
/// verifiers and nothing else: it cannot attest, issue or edit a record.
contract Accreditation {
    struct Verifier {
        bool active;
        bool known;
        string name;
    }

    address public immutable accreditor;
    mapping(address => Verifier) public verifiers;

    event VerifierAdded(address indexed verifier, string name);
    event VerifierSuspended(address indexed verifier);

    error NotAccreditor();
    error AlreadyKnown(address verifier);
    error UnknownVerifier(address verifier);
    error ZeroAddress();

    constructor(address accreditor_) {
        if (accreditor_ == address(0)) revert ZeroAddress();
        accreditor = accreditor_;
    }

    modifier onlyAccreditor() {
        if (msg.sender != accreditor) revert NotAccreditor();
        _;
    }

    /// @dev A suspended verifier is never re-added under the same address;
    /// a reinstated body gets a fresh key, so past suspensions stay legible.
    function addVerifier(address verifier, string calldata name) external onlyAccreditor {
        if (verifier == address(0)) revert ZeroAddress();
        if (verifiers[verifier].known) revert AlreadyKnown(verifier);
        verifiers[verifier] = Verifier({active: true, known: true, name: name});
        emit VerifierAdded(verifier, name);
    }

    function suspendVerifier(address verifier) external onlyAccreditor {
        if (!verifiers[verifier].active) revert UnknownVerifier(verifier);
        verifiers[verifier].active = false;
        emit VerifierSuspended(verifier);
    }

    function isActive(address verifier) external view returns (bool) {
        return verifiers[verifier].active;
    }
}
