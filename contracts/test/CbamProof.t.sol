// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Accreditation} from "../src/Accreditation.sol";
import {Attestations} from "../src/Attestations.sol";
import {Passports} from "../src/Passports.sol";

contract AccreditationTest is Base {
    function test_onlyAccreditorAddsVerifiers() public {
        vm.expectRevert(Accreditation.NotAccreditor.selector);
        acc.addVerifier(makeAddr("x"), "x");
    }

    function test_cannotReAddSuspended() public {
        vm.startPrank(accreditor);
        acc.suspendVerifier(verifier);
        vm.expectRevert(abi.encodeWithSelector(Accreditation.AlreadyKnown.selector, verifier));
        acc.addVerifier(verifier, "again");
        vm.stopPrank();
    }

    function test_suspendUnknownReverts() public {
        vm.prank(accreditor);
        vm.expectRevert(abi.encodeWithSelector(Accreditation.UnknownVerifier.selector, address(1)));
        acc.suspendVerifier(address(1));
    }

    function test_zeroAccreditorReverts() public {
        vm.expectRevert(Accreditation.ZeroAddress.selector);
        new Accreditation(address(0));
    }
}

contract AttestationsTest is Base {
    function test_attestRecordsEverything() public {
        uint256 id = _attest(A, 2026, "E", 330_000, 400_000_000, meltShop);
        Attestations.Attestation memory a = att.get(id);
        assertEq(a.installation, A);
        assertEq(a.year, 2026);
        assertEq(a.route, bytes1("E"));
        assertEq(a.ownIntensity, 330_000);
        assertEq(a.cap, 400_000_000);
        assertEq(a.verifier, verifier);
        assertEq(a.operator, meltShop);
        (bool live, uint256 liveId) = att.liveFor(A, 2026);
        assertTrue(live);
        assertEq(liveId, id);
    }

    function test_onlyActiveVerifier() public {
        vm.prank(meltShop);
        vm.expectRevert(Attestations.NotActiveVerifier.selector);
        att.attest(A, 2026, "E", 1, 1, bytes32(uint256(1)), meltShop);

        vm.prank(accreditor);
        acc.suspendVerifier(verifier);
        vm.prank(verifier);
        vm.expectRevert(Attestations.NotActiveVerifier.selector);
        att.attest(A, 2026, "E", 1, 1, bytes32(uint256(1)), meltShop);
    }

    function test_verifierCannotAttestItself() public {
        vm.prank(verifier);
        vm.expectRevert(Attestations.InvalidAttestation.selector);
        att.attest(A, 2026, "E", 1, 1, bytes32(uint256(1)), verifier);
    }

    function test_invalidFieldsRevert() public {
        vm.startPrank(verifier);
        vm.expectRevert(Attestations.InvalidAttestation.selector);
        att.attest(bytes32(0), 2026, "E", 1, 1, bytes32(uint256(1)), meltShop);
        vm.expectRevert(Attestations.InvalidAttestation.selector);
        att.attest(A, 2026, "E", 1, 0, bytes32(uint256(1)), meltShop);
        vm.expectRevert(Attestations.InvalidAttestation.selector);
        att.attest(A, 2026, "E", 1, 1, bytes32(0), meltShop);
        vm.expectRevert(Attestations.InvalidAttestation.selector);
        att.attest(A, 2026, "E", 1, 1, bytes32(uint256(1)), address(0));
        vm.stopPrank();
    }

    function test_oneLiveAttestationPerYear() public {
        uint256 id = _attest(A, 2026, "E", 330_000, 1000, meltShop);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(Attestations.AlreadyAttested.selector, id));
        att.attest(A, 2026, "E", 300_000, 1000, bytes32(uint256(2)), meltShop);
        // a different year is a different report
        _attest(A, 2027, "E", 330_000, 1000, meltShop);
    }

    function test_revokeThenReattest() public {
        uint256 id = _attest(A, 2026, "E", 330_000, 1000, meltShop);
        vm.prank(verifier);
        att.revoke(id, keccak256("wrong electrode figure"));
        assertTrue(att.get(id).revoked);
        (bool live,) = att.liveFor(A, 2026);
        assertFalse(live);
        uint256 id2 = _attest(A, 2026, "E", 350_000, 1000, meltShop);
        assertEq(id2, id + 1);
    }

    function test_accreditorCanRevoke_othersCannot() public {
        uint256 id = _attest(A, 2026, "E", 330_000, 1000, meltShop);
        vm.prank(meltShop);
        vm.expectRevert(Attestations.NotAllowedToRevoke.selector);
        att.revoke(id, 0);
        vm.prank(accreditor);
        att.revoke(id, 0);
        vm.prank(accreditor);
        vm.expectRevert(Attestations.AlreadyRevoked.selector);
        att.revoke(id, 0);
    }

    function test_suspendedVerifierCanStillRevokeOwn() public {
        uint256 id = _attest(A, 2026, "E", 330_000, 1000, meltShop);
        vm.prank(accreditor);
        acc.suspendVerifier(verifier);
        vm.prank(verifier);
        att.revoke(id, 0);
        assertTrue(att.get(id).revoked);
    }

    function test_unknownAttestationReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Attestations.UnknownAttestation.selector, 7));
        att.get(7);
    }
}

contract PassportsTest is Base {
    uint256 internal attA;
    uint256 internal attB;

    function setUp() public override {
        super.setUp();
        // Melt shop: scrap/EAF billet, own 0.33 t/t, 400 kt verified
        attA = _attest(A, 2026, "E", 330_000, 400_000_000, meltShop);
        // Rolling mill: own 0.05 t/t, 300 kt verified
        attB = _attest(B, 2026, "E", 50_000, 300_000_000, rollingMill);
    }

    /// The demo shipment: 530 t billet from A becomes 500 t rebar at B.
    function test_demoChain() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), B);
        uint256 rebar = _issue(rollingMill, attB, REBAR, 500_000, _one(billet, 530_000), _importer());

        Passports.Passport memory p = pp.get(rebar);
        assertEq(p.see, 50_000 + (530_000 * 330_000) / 500_000); // 0.3998 t/t
        assertEq(p.depth, 2);
        assertEq(pp.get(billet).consumed, 530_000);
        assertEq(pp.issued(attB), 500_000);
        assertEq(uint8(pp.status(rebar)), uint8(Passports.Status.Valid));
        assertEq(pp.precursorsOf(rebar).length, 1);
    }

    function test_overCapRefused() public {
        _issue(meltShop, attA, BILLET, 399_000_000, _noUses(), B);
        vm.prank(meltShop);
        vm.expectRevert(abi.encodeWithSelector(Passports.OverCap.selector, uint64(2_000_000), uint64(1_000_000)));
        pp.issue(attA, BILLET, 2_000_000, _noUses(), B, 0);
    }

    function test_sameBilletCannotBackTwoBatches() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), B);
        _issue(rollingMill, attB, REBAR, 500_000, _one(billet, 530_000), _importer());
        vm.prank(rollingMill);
        vm.expectRevert(
            abi.encodeWithSelector(Passports.PrecursorOverdrawn.selector, billet, uint64(530_000), uint64(0))
        );
        pp.issue(attB, REBAR, 500_000, _one(billet, 530_000), _importer(), 0);
    }

    function test_duplicateUseInOneCallIsCumulative() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), B);
        Passports.PrecursorUse[] memory u = new Passports.PrecursorUse[](2);
        u[0] = Passports.PrecursorUse(billet, 300_000);
        u[1] = Passports.PrecursorUse(billet, 300_000);
        vm.prank(rollingMill);
        vm.expectRevert(
            abi.encodeWithSelector(Passports.PrecursorOverdrawn.selector, billet, uint64(300_000), uint64(230_000))
        );
        pp.issue(attB, REBAR, 500_000, u, _importer(), 0);
    }

    function test_onlyOperatorIssues() public {
        vm.prank(rollingMill);
        vm.expectRevert(Passports.NotOperator.selector);
        pp.issue(attA, BILLET, 1, _noUses(), B, 0);
    }

    function test_revokedAttestationCannotIssue() public {
        vm.prank(verifier);
        att.revoke(attA, 0);
        vm.prank(meltShop);
        vm.expectRevert(abi.encodeWithSelector(Passports.AttestationRevoked.selector, attA));
        pp.issue(attA, BILLET, 1, _noUses(), B, 0);
    }

    function test_precursorMustBeHeldByThisInstallation() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), _importer());
        vm.prank(rollingMill);
        vm.expectRevert(abi.encodeWithSelector(Passports.NotHeldByInstallation.selector, billet));
        pp.issue(attB, REBAR, 500_000, _one(billet, 530_000), _importer(), 0);
    }

    function test_revocationPropagatesDownstream() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), B);
        uint256 rebar = _issue(rollingMill, attB, REBAR, 500_000, _one(billet, 530_000), _importer());
        vm.prank(verifier);
        att.revoke(attA, keccak256("melt shop report withdrawn"));
        assertEq(uint8(pp.status(billet)), uint8(Passports.Status.Revoked));
        assertEq(uint8(pp.status(rebar)), uint8(Passports.Status.AncestorRevoked));
    }

    function test_revokedPrecursorCannotBeConsumed() public {
        uint256 billet = _issue(meltShop, attA, BILLET, 530_000, _noUses(), B);
        vm.prank(verifier);
        att.revoke(attA, 0);
        vm.prank(rollingMill);
        vm.expectRevert(abi.encodeWithSelector(Passports.PrecursorRevoked.selector, billet));
        pp.issue(attB, REBAR, 500_000, _one(billet, 530_000), _importer(), 0);
    }

    function test_declaredOnceByCommittedImporter() public {
        uint256 rebar = _issue(rollingMill, attB, REBAR, 500_000, _noUses(), _importer());
        vm.prank(makeAddr("someoneElse"));
        vm.expectRevert(Passports.NotHolder.selector);
        pp.markDeclared(rebar, SALT, "DE-2027-0001");

        vm.prank(importer);
        vm.expectRevert(Passports.NotHolder.selector);
        pp.markDeclared(rebar, keccak256("wrong salt"), "DE-2027-0001");

        vm.prank(importer);
        pp.markDeclared(rebar, SALT, "DE-2027-0001");
        assertTrue(pp.get(rebar).declared);

        vm.prank(importer);
        vm.expectRevert(Passports.AlreadyDeclared.selector);
        pp.markDeclared(rebar, SALT, "DE-2027-0002");
    }

    function test_importerHolderHelperMatches() public view {
        assertEq(pp.importerHolder(importer, SALT), _importer());
    }

    function test_depthCapped() public {
        bytes32[5] memory inst;
        uint256[5] memory atts;
        address[5] memory ops;
        for (uint256 i; i < 5; ++i) {
            inst[i] = keccak256(abi.encode("chain", i));
            ops[i] = makeAddr(string(abi.encode("op", i)));
            atts[i] = _attest(inst[i], 2026, "E", 10_000, 1_000_000, ops[i]);
        }
        uint256 prev = _issue(ops[0], atts[0], BILLET, 1000, _noUses(), inst[1]);
        for (uint256 i = 1; i < 4; ++i) {
            prev = _issue(ops[i], atts[i], REBAR, 1000, _one(prev, 1000), inst[i + 1]);
        }
        assertEq(pp.get(prev).depth, 4);
        vm.prank(ops[4]);
        vm.expectRevert(Passports.TooDeep.selector);
        pp.issue(atts[4], REBAR, 1000, _one(prev, 1000), _importer(), 0);
    }

    function test_tooManyPrecursors() public {
        Passports.PrecursorUse[] memory u = new Passports.PrecursorUse[](9);
        vm.prank(rollingMill);
        vm.expectRevert(Passports.TooManyPrecursors.selector);
        pp.issue(attB, REBAR, 1, u, _importer(), 0);
    }

    function test_zeroMassRefused() public {
        vm.prank(meltShop);
        vm.expectRevert(Passports.ZeroMass.selector);
        pp.issue(attA, BILLET, 0, _noUses(), B, 0);

        uint256 billet = _issue(meltShop, attA, BILLET, 10, _noUses(), B);
        vm.prank(rollingMill);
        vm.expectRevert(Passports.ZeroMass.selector);
        pp.issue(attB, REBAR, 10, _one(billet, 0), _importer(), 0);
    }

    function test_unknownPassport() public {
        vm.expectRevert(abi.encodeWithSelector(Passports.UnknownPassport.selector, 3));
        pp.get(3);
        vm.prank(rollingMill);
        vm.expectRevert(abi.encodeWithSelector(Passports.UnknownPassport.selector, 3));
        pp.issue(attB, REBAR, 10, _one(3, 1), _importer(), 0);
    }

    function testFuzz_seeIsOwnPlusWeightedPrecursor(uint32 ownA, uint32 ownB, uint64 billetKg, uint64 rebarKg) public {
        ownA = uint32(bound(ownA, 0, 5_000_000));
        ownB = uint32(bound(ownB, 0, 5_000_000));
        billetKg = uint64(bound(billetKg, 1, 100_000_000));
        rebarKg = uint64(bound(rebarKg, 1, 100_000_000));
        uint256 a2 = _attest(keccak256("fa"), 2030, "E", ownA, type(uint64).max, meltShop);
        uint256 b2 = _attest(keccak256("fb"), 2030, "E", ownB, type(uint64).max, rollingMill);
        uint256 billet = _issue(meltShop, a2, BILLET, billetKg, _noUses(), keccak256("fb"));
        uint256 expected = uint256(ownB) + (uint256(billetKg) * ownA) / rebarKg;
        if (expected > type(uint32).max) {
            vm.prank(rollingMill);
            vm.expectRevert(Passports.SeeOverflow.selector);
            pp.issue(b2, REBAR, rebarKg, _one(billet, billetKg), _importer(), 0);
        } else {
            uint256 rebar = _issue(rollingMill, b2, REBAR, rebarKg, _one(billet, billetKg), _importer());
            assertEq(pp.get(rebar).see, expected);
        }
    }
}
