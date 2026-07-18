// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockVaultAsset {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IMockVaultShare {
    function mint(address to, uint256 amount) external;
}

/// @notice Mock wstDIEM ERC-4626 vault covering the surface the executor and fingerprint read.
/// @dev Faithful to `IERC4626Minimal.deposit`/`asset` (executor open path) and to the ERC-4626
///      fingerprint reads (`asset`/`decimals`/`totalSupply`/`totalAssets`/`convertToAssets`).
///      On deposit it pulls the loan asset from the caller and mints the wstDIEM collateral
///      share token 1:1 to the receiver. The NAV surface (`totalSupply`/`totalAssets`) is a
///      configurable static snapshot used only to pin the vault fingerprint / NAV baseline.
contract MockWstDiemVault {
    address public immutable asset;
    address public immutable share;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    uint256 public totalAssets;

    constructor(address asset_, address share_, uint8 decimals_) {
        asset = asset_;
        share = share_;
        decimals = decimals_;
        // Static NAV snapshot (~1.0005 assets/share) pinned by the vault fingerprint.
        totalSupply = 1_000_000 * 10 ** decimals_;
        totalAssets = 1_000_500 * 10 ** decimals_;
    }

    function setNavSnapshot(uint256 nextSupply, uint256 nextAssets) external {
        totalSupply = nextSupply;
        totalAssets = nextAssets;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        if (totalSupply == 0) return shares;
        return shares * totalAssets / totalSupply;
    }

    /// @notice Canonical ERC-4626 floor conversion of assets → shares.
    /// @dev Mirrors convertToAssets: empty vault (no supply) mints 1:1; a
    ///      supply-without-assets vault is degenerate and reverts.
    function convertToShares(uint256 assets) external view returns (uint256) {
        if (totalSupply == 0) return assets;
        require(totalAssets != 0, "vault: no assets");
        return assets * totalSupply / totalAssets;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(IMockVaultAsset(asset).transferFrom(msg.sender, address(this), assets), "vault: pull");
        shares = assets; // 1:1 mint keeps executor collateral accounting exact against mocks.
        IMockVaultShare(share).mint(receiver, shares);
    }
}
