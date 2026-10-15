// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Attestations} from "./Attestations.sol";

/// @title Passports
/// @notice One passport per shipment. It carries the specific embedded
/// emissions (SEE) of the good, computed here from the installation's
/// attested own intensity and the passports of the precursors it consumed.
/// No party types the final number.
///
/// Two quantities are conserved:
///   - an attestation's cap: passported mass never exceeds verified production;
///   - a passport's mass: downstream consumption never exceeds it, so the
///     same billet cannot back two batches of rebar.
contract Passports {
    struct Passport {
        uint256 attestationId;
        bytes8 cnCode; // ASCII digits, e.g. "72149910"
        uint64 mass; // kg
        uint64 consumed; // kg drawn by downstream passports
        uint32 see; // micro-tCO2e per tonne, precursors included
        uint8 depth; // 1 = no precursors
        bool declared;
        bytes32 holder; // installation id, or keccak256(abi.encode(importer, salt))
        bytes32 docHash; // shipment documents
    }

    struct PrecursorUse {
        uint256 passportId;
        uint64 mass; // kg of that passport consumed
    }

    enum Status {
        Valid,
        Revoked,
        AncestorRevoked
    }

    uint8 public constant MAX_DEPTH = 4;
    uint256 public constant MAX_USES = 8;

    Attestations public immutable attestations;

    Passport[] internal _passports;
    mapping(uint256 => PrecursorUse[]) internal _uses;
    /// attestation id => kg already passported
    mapping(uint256 => uint64) public issued;

    event PassportIssued(
        uint256 indexed id,
        uint256 indexed attestationId,
        bytes32 indexed installation,
        bytes8 cnCode,
        uint64 mass,
        uint32 see,
        bytes32 holder,
        bytes32 docHash
    );
    event PrecursorConsumed(uint256 indexed passportId, uint256 indexed precursorId, uint64 mass);
    event Declared(uint256 indexed id, bytes32 declarationRef);

    error NotOperator();
    error AttestationRevoked(uint256 attestationId);
    error OverCap(uint64 requested, uint64 available);
    error ZeroMass();
    error TooManyPrecursors();
    error TooDeep();
    error UnknownPassport(uint256 id);
    error NotHeldByInstallation(uint256 precursorId);
    error PrecursorRevoked(uint256 precursorId);
    error PrecursorOverdrawn(uint256 precursorId, uint64 requested, uint64 available);
    error SeeOverflow();
    error NotHolder();
    error AlreadyDeclared();

    constructor(Attestations attestations_) {
        attestations = attestations_;
    }

    function issue(
        uint256 attestationId,
        bytes8 cnCode,
        uint64 mass,
        PrecursorUse[] calldata uses,
        bytes32 holder,
        bytes32 docHash
    ) external returns (uint256 id) {
        Attestations.Attestation memory a = attestations.get(attestationId);
        if (msg.sender != a.operator) revert NotOperator();
        if (a.revoked) revert AttestationRevoked(attestationId);
        if (mass == 0) revert ZeroMass();
        if (uses.length > MAX_USES) revert TooManyPrecursors();

        uint64 available = a.cap - issued[attestationId];
        if (mass > available) revert OverCap(mass, available);
        issued[attestationId] += mass;

        id = _passports.length;
        uint256 acc;
        uint8 depth = 1;
        for (uint256 i; i < uses.length; ++i) {
            PrecursorUse calldata u = uses[i];
            Passport storage p = _get(u.passportId);
            if (p.holder != a.installation) revert NotHeldByInstallation(u.passportId);
            if (status(u.passportId) != Status.Valid) revert PrecursorRevoked(u.passportId);
            if (u.mass == 0) revert ZeroMass();
            uint64 left = p.mass - p.consumed;
            if (u.mass > left) revert PrecursorOverdrawn(u.passportId, u.mass, left);
            p.consumed += u.mass;
            if (p.depth + 1 > depth) depth = p.depth + 1;
            acc += uint256(u.mass) * p.see;
            _uses[id].push(u);
            emit PrecursorConsumed(id, u.passportId, u.mass);
        }
        if (depth > MAX_DEPTH) revert TooDeep();

        uint256 see = uint256(a.ownIntensity) + acc / mass;
        if (see > type(uint32).max) revert SeeOverflow();

        _passports.push(
            Passport({
                attestationId: attestationId,
                cnCode: cnCode,
                mass: mass,
                consumed: 0,
                see: uint32(see),
                depth: depth,
                declared: false,
                holder: holder,
                docHash: docHash
            })
        );
        emit PassportIssued(id, attestationId, a.installation, cnCode, mass, uint32(see), holder, docHash);
    }

    /// @notice The importer marks the passport as used in a CBAM declaration,
    /// once, by proving it is the holder the issuer committed to.
    function markDeclared(uint256 id, bytes32 salt, bytes32 declarationRef) external {
        Passport storage p = _get(id);
        if (keccak256(abi.encode(msg.sender, salt)) != p.holder) revert NotHolder();
        if (p.declared) revert AlreadyDeclared();
        p.declared = true;
        emit Declared(id, declarationRef);
    }

    /// @notice Revocation anywhere upstream surfaces here. Depth is capped at
    /// issuance, so this walk is bounded.
    function status(uint256 id) public view returns (Status) {
        Passport storage p = _get(id);
        if (attestations.get(p.attestationId).revoked) return Status.Revoked;
        PrecursorUse[] storage us = _uses[id];
        for (uint256 i; i < us.length; ++i) {
            if (status(us[i].passportId) != Status.Valid) return Status.AncestorRevoked;
        }
        return Status.Valid;
    }

    function get(uint256 id) external view returns (Passport memory) {
        return _get(id);
    }

    function precursorsOf(uint256 id) external view returns (PrecursorUse[] memory) {
        _get(id);
        return _uses[id];
    }

    function count() external view returns (uint256) {
        return _passports.length;
    }

    /// @notice The holder commitment an issuer uses for an importer.
    function importerHolder(address importer, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(importer, salt));
    }

    function _get(uint256 id) internal view returns (Passport storage) {
        if (id >= _passports.length) revert UnknownPassport(id);
        return _passports[id];
    }
}
