// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Attestations} from "../src/Attestations.sol";
import {Passports} from "../src/Passports.sol";
import {Test} from "forge-std/Test.sol";

/// Drives random issue / consume / revoke sequences across three installations.
contract Handler is Test {
    Attestations internal att;
    Passports internal pp;
    address internal verifier;
    bytes32[3] internal inst;
    address[3] internal ops;
    uint256[3] public attIds;
    bool[3] public revoked;
    uint256 public issuedOk;
    uint256 public consumedOk;
    uint256 public calls;

    constructor(
        Attestations att_,
        Passports pp_,
        address verifier_,
        bytes32[3] memory inst_,
        address[3] memory ops_,
        uint256[3] memory attIds_
    ) {
        att = att_;
        pp = pp_;
        verifier = verifier_;
        inst = inst_;
        ops = ops_;
        attIds = attIds_;
    }

    /// Installation i issues to installation i+1 (or an importer at the end),
    /// optionally consuming a random passport it holds.
    function issue(uint8 i, uint64 mass, uint256 precursorSeed, uint64 useMass) external {
        calls++;
        i = uint8(bound(i, 0, 2));
        mass = uint64(bound(mass, 1, 50_000_000));
        bytes32 holder = i < 2 ? inst[i + 1] : keccak256("importer");
        Passports.PrecursorUse[] memory uses;
        uint256 total = pp.count();
        uses = new Passports.PrecursorUse[](0);
        if (total > 0 && i > 0) {
            // Mostly pick a passport this installation actually holds, with a
            // draw sized to what is left; sometimes pick at random so the
            // refusal paths (wrong holder, overdraw) are exercised too.
            uint256 pid = precursorSeed % total;
            uint64 draw = uint64(bound(useMass, 1, 60_000_000));
            if (precursorSeed % 4 != 0) {
                for (uint256 k; k < total; ++k) {
                    uint256 cand = (pid + k) % total;
                    Passports.Passport memory c = pp.get(cand);
                    if (c.holder == inst[i] && c.consumed < c.mass) {
                        pid = cand;
                        draw = uint64(bound(useMass, 1, c.mass - c.consumed));
                        break;
                    }
                }
            }
            uses = new Passports.PrecursorUse[](1);
            uses[0] = Passports.PrecursorUse(pid, draw);
        }
        vm.prank(ops[i]);
        try pp.issue(attIds[i], "72149910", mass, uses, holder, 0) {
            issuedOk++;
            if (uses.length > 0) consumedOk++;
        } catch {}
    }

    /// Rare on purpose: once an attestation is revoked its installation can
    /// no longer issue, so frequent revocation would starve the issue path.
    function revoke(uint8 i, uint8 roll) external {
        if (roll > 4) return;
        i = uint8(bound(i, 0, 2));
        if (revoked[i]) return;
        vm.prank(verifier);
        att.revoke(attIds[i], 0);
        revoked[i] = true;
    }
}

contract InvariantTest is Base {
    Handler internal handler;
    uint256[3] internal ids;

    function setUp() public override {
        super.setUp();
        bytes32[3] memory inst = [keccak256("i0"), keccak256("i1"), keccak256("i2")];
        address[3] memory ops = [makeAddr("op0"), makeAddr("op1"), makeAddr("op2")];
        for (uint256 i; i < 3; ++i) {
            ids[i] = _attest(inst[i], 2026, "E", uint32(100_000 * (i + 1)), 200_000_000, ops[i]);
        }
        handler = new Handler(att, pp, verifier, inst, ops, ids);
        targetContract(address(handler));
    }

    function afterInvariant() external view {
        // A full-length run must actually have issued and consumed, or the
        // other invariants hold vacuously. Short (shrunk) sequences, and runs
        // where the upstream installations were revoked, legitimately can't.
        if (handler.calls() < 24 || handler.revoked(0) || handler.revoked(1)) return;
        assertGt(handler.issuedOk(), 0);
        assertGt(handler.consumedOk(), 0);
    }

    /// Passported mass never exceeds what the verifier attested.
    function invariant_issuedWithinCap() public view {
        for (uint256 i; i < 3; ++i) {
            assertLe(pp.issued(ids[i]), att.get(ids[i]).cap);
        }
    }

    /// No passport is drawn down by more than its own mass, and the cap
    /// ledger equals the sum of passports issued under each attestation.
    function invariant_consumedWithinMass() public view {
        uint256[3] memory sum;
        for (uint256 p; p < pp.count(); ++p) {
            Passports.Passport memory x = pp.get(p);
            assertLe(x.consumed, x.mass);
            for (uint256 i; i < 3; ++i) {
                if (x.attestationId == ids[i]) sum[i] += x.mass;
            }
        }
        for (uint256 i; i < 3; ++i) {
            assertEq(sum[i], pp.issued(ids[i]));
        }
    }

    /// A revoked attestation anywhere upstream is always visible downstream.
    function invariant_revocationVisible() public view {
        for (uint256 p; p < pp.count(); ++p) {
            Passports.Passport memory x = pp.get(p);
            if (att.get(x.attestationId).revoked) {
                assertEq(uint8(pp.status(p)), uint8(Passports.Status.Revoked));
            }
            Passports.PrecursorUse[] memory us = pp.precursorsOf(p);
            for (uint256 k; k < us.length; ++k) {
                if (pp.status(us[k].passportId) != Passports.Status.Valid) {
                    assertTrue(pp.status(p) != Passports.Status.Valid);
                }
            }
        }
    }
}
