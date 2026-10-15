// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Accreditation} from "./Accreditation.sol";

/// @title Attestations
/// @notice A verifier's opinion on one installation for one reporting year:
/// its production route, its own specific emissions (excluding precursors)
/// and the production volume the verified report covers. That volume is the
/// cap the Passports contract enforces.
contract Attestations {
    struct Attestation {
        bytes32 installation; // keccak256(country code, registry id)
        uint16 year;
        bytes1 route; // CBAM benchmark route letter, e.g. "E" scrap/EAF
        uint32 ownIntensity; // micro-tCO2e per tonne, own process only
        uint64 cap; // verified production, kg
        bytes32 reportHash; // sha256 of the verified report bundle
        address verifier;
        address operator; // the installation's signing key
        bool revoked;
    }

    Accreditation public immutable accreditation;

    Attestation[] internal _attestations;
    /// installation => year => attestation id + 1 (0 = none live)
    mapping(bytes32 => mapping(uint16 => uint256)) internal _live;

    event Attested(
        uint256 indexed id,
        bytes32 indexed installation,
        uint16 year,
        bytes1 route,
        uint32 ownIntensity,
        uint64 cap,
        bytes32 reportHash,
        address verifier,
        address operator
    );
    event AttestationRevoked(uint256 indexed id, address indexed by, bytes32 reasonHash);

    error NotActiveVerifier();
    error AlreadyAttested(uint256 liveId);
    error InvalidAttestation();
    error NotAllowedToRevoke();
    error AlreadyRevoked();
    error UnknownAttestation(uint256 id);

    constructor(Accreditation accreditation_) {
        accreditation = accreditation_;
    }

    function attest(
        bytes32 installation,
        uint16 year,
        bytes1 route,
        uint32 ownIntensity,
        uint64 cap,
        bytes32 reportHash,
        address operator
    ) external returns (uint256 id) {
        if (!accreditation.isActive(msg.sender)) revert NotActiveVerifier();
        if (installation == bytes32(0) || cap == 0 || operator == address(0) || reportHash == bytes32(0)) {
            revert InvalidAttestation();
        }
        // The verifier attests someone else's report; signing your own
        // installation's figures would collapse two roles into one.
        if (operator == msg.sender) revert InvalidAttestation();
        uint256 live = _live[installation][year];
        if (live != 0) revert AlreadyAttested(live - 1);

        id = _attestations.length;
        _attestations.push(
            Attestation({
                installation: installation,
                year: year,
                route: route,
                ownIntensity: ownIntensity,
                cap: cap,
                reportHash: reportHash,
                verifier: msg.sender,
                operator: operator,
                revoked: false
            })
        );
        _live[installation][year] = id + 1;
        emit Attested(id, installation, year, route, ownIntensity, cap, reportHash, msg.sender, operator);
    }

    /// @notice The attesting verifier (even once suspended) or the accreditor
    /// can withdraw an attestation. A corrected report can then be attested
    /// afresh; passports issued under the old one surface as revoked.
    function revoke(uint256 id, bytes32 reasonHash) external {
        Attestation storage a = _get(id);
        if (msg.sender != a.verifier && msg.sender != accreditation.accreditor()) revert NotAllowedToRevoke();
        if (a.revoked) revert AlreadyRevoked();
        a.revoked = true;
        delete _live[a.installation][a.year];
        emit AttestationRevoked(id, msg.sender, reasonHash);
    }

    function get(uint256 id) external view returns (Attestation memory) {
        return _get(id);
    }

    function liveFor(bytes32 installation, uint16 year) external view returns (bool exists, uint256 id) {
        uint256 v = _live[installation][year];
        return (v != 0, v == 0 ? 0 : v - 1);
    }

    function count() external view returns (uint256) {
        return _attestations.length;
    }

    function _get(uint256 id) internal view returns (Attestation storage) {
        if (id >= _attestations.length) revert UnknownAttestation(id);
        return _attestations[id];
    }
}
