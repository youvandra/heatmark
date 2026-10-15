// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Accreditation} from "../src/Accreditation.sol";
import {Attestations} from "../src/Attestations.sol";
import {Passports} from "../src/Passports.sol";

abstract contract Base is Test {
    Accreditation internal acc;
    Attestations internal att;
    Passports internal pp;

    address internal accreditor = makeAddr("accreditor");
    address internal verifier = makeAddr("verifier");
    address internal meltShop = makeAddr("meltShop"); // installation A operator
    address internal rollingMill = makeAddr("rollingMill"); // installation B operator
    address internal importer = makeAddr("importer");

    bytes32 internal constant A = keccak256("TR/izmir-melt-shop");
    bytes32 internal constant B = keccak256("TR/izmir-rolling-mill");
    bytes8 internal constant BILLET = "72071114";
    bytes8 internal constant REBAR = "72149910";
    bytes32 internal constant SALT = keccak256("importer-salt");

    function setUp() public virtual {
        acc = new Accreditation(accreditor);
        att = new Attestations(acc);
        pp = new Passports(att);
        vm.prank(accreditor);
        acc.addVerifier(verifier, "Demo Verifier (ISO 14065)");
    }

    function _attest(bytes32 inst, uint16 year, bytes1 route, uint32 own, uint64 cap, address operator)
        internal
        returns (uint256)
    {
        vm.prank(verifier);
        return att.attest(inst, year, route, own, cap, keccak256(abi.encode(inst, year)), operator);
    }

    function _noUses() internal pure returns (Passports.PrecursorUse[] memory) {
        return new Passports.PrecursorUse[](0);
    }

    function _one(uint256 id, uint64 mass) internal pure returns (Passports.PrecursorUse[] memory u) {
        u = new Passports.PrecursorUse[](1);
        u[0] = Passports.PrecursorUse(id, mass);
    }

    function _issue(
        address operator,
        uint256 attId,
        bytes8 cn,
        uint64 mass,
        Passports.PrecursorUse[] memory uses,
        bytes32 holder
    ) internal returns (uint256) {
        vm.prank(operator);
        return pp.issue(attId, cn, mass, uses, holder, keccak256(abi.encode(attId, mass)));
    }

    function _importer() internal view returns (bytes32) {
        return keccak256(abi.encode(importer, SALT));
    }
}
