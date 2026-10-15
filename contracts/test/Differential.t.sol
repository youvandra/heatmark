// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Passports} from "../src/Passports.sol";

/// Replays the cases calc/scripts/fixtures.ts generated with composeSee and
/// requires the chain to land on the same integer SEE for every one.
contract DifferentialTest is Base {
    function test_contractMatchesCalc() public {
        string memory json = vm.readFile("test/fixtures/compose.json");
        uint256[] memory own = vm.parseJsonUintArray(json, ".own");
        uint256[] memory mass = vm.parseJsonUintArray(json, ".mass");
        uint256[] memory n = vm.parseJsonUintArray(json, ".n");
        uint256[] memory expected = vm.parseJsonUintArray(json, ".expected");
        uint256[][3] memory m;
        uint256[][3] memory s;
        m[0] = vm.parseJsonUintArray(json, ".m0");
        m[1] = vm.parseJsonUintArray(json, ".m1");
        m[2] = vm.parseJsonUintArray(json, ".m2");
        s[0] = vm.parseJsonUintArray(json, ".s0");
        s[1] = vm.parseJsonUintArray(json, ".s1");
        s[2] = vm.parseJsonUintArray(json, ".s2");
        assertGt(own.length, 100);

        address op = makeAddr("diffOperator");
        for (uint256 c; c < own.length; ++c) {
            bytes32 product = keccak256(abi.encode("product", c));
            Passports.PrecursorUse[] memory uses = new Passports.PrecursorUse[](n[c]);
            for (uint256 i; i < n[c]; ++i) {
                // Each precursor comes from its own installation whose own
                // intensity is the fixture's SEE, so its passport carries it.
                bytes32 inst = keccak256(abi.encode("precursor", c, i));
                uint256 pa = _attest(inst, 2026, "E", uint32(s[i][c]), uint64(m[i][c]), op);
                uint256 pid = _issue(op, pa, BILLET, uint64(m[i][c]), _noUses(), product);
                uses[i] = Passports.PrecursorUse(pid, uint64(m[i][c]));
            }
            uint256 fa = _attest(product, 2026, "E", uint32(own[c]), uint64(mass[c]), op);
            uint256 id = _issue(op, fa, REBAR, uint64(mass[c]), uses, _importer());
            assertEq(pp.get(id).see, expected[c], string(abi.encodePacked("case ", vm.toString(c))));
        }
    }
}
