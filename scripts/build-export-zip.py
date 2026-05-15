#!/usr/bin/env python3
"""
Apex Trader — Full Project Export Builder
Produces a clean, complete, deployable ZIP of the entire Apex Trader workspace.

Usage:
  python3 scripts/build-export-zip.py

Output: artifacts/trading-dashboard/public/apex-trader-full-export.zip
"""

import os
import sys
import zipfile
from pathlib import Path

ROOT    = Path(__file__).parent.parent.resolve()
ZIP_PREFIX = "apex-trader"
OUTPUT  = ROOT / "artifacts" / "trading-dashboard" / "public" / "apex-trader-operator-console-FINAL-v1.zip"

# ── Directories/names to prune everywhere ─────────────────────────────────────
PRUNE_DIRS: set[str] = {
    "node_modules", "dist", ".git", ".cache", "__pycache__",
    ".expo", ".turbo", ".pnpm-store", "coverage",
    ".replit-artifact",        # Replit platform metadata
    ".agents",                 # Replit agent metadata
    ".local",                  # Agent skills / session data
    "attached_assets",         # Uploaded assets — not source
}

PRUNE_FILES: set[str] = {
    ".env", ".env.local", ".env.development.local", ".env.production.local",
    ".DS_Store", "Thumbs.db",
}

PRUNE_SUFFIXES: set[str] = {
    ".tsbuildinfo",            # TypeScript build cache — regenerated
    ".log", ".pid",
}

# Public ZIPs from previous exports (in trading-dashboard/public/)
PRUNE_FILENAME_STARTSWITH = ("apex-trader", "ai-trader-platform")


# ── Packages to include (relative to ROOT) ────────────────────────────────────
INCLUDE_PACKAGES = [
    # Shared libraries
    "lib/db",
    "lib/api-spec",
    "lib/api-client-react",
    "lib/api-zod",
    # Apex Trader artifacts
    "artifacts/api-server",
    "artifacts/trading-dashboard",
    # Utility scripts
    "scripts",
]

# ── Root-level standalone files ───────────────────────────────────────────────
ROOT_FILES = [
    ".env.example",
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
    "SETUP.md",
    "DEPLOYMENT.md",
    "README.md",
    ".gitignore",
    "render.yaml",
    "railway.json",
    "nixpacks.toml",
]

# ── Files to force-exclude inside packages ────────────────────────────────────
# (old ZIP artefacts sitting in public/ of trading-dashboard)
def should_include(abs_path: Path) -> bool:
    """Return True if this file should be included in the export."""

    # Prune by filename
    if abs_path.name in PRUNE_FILES:
        return False

    # Prune by suffix
    if abs_path.suffix in PRUNE_SUFFIXES:
        return False

    # Drop old ZIP files from public/
    name_lower = abs_path.name.lower()
    if abs_path.suffix == ".zip":
        for pat in PRUNE_FILENAME_STARTSWITH:
            if name_lower.startswith(pat):
                return False

    # Skip declaration map files from lib/dist — keep .d.ts only
    if abs_path.suffix == ".d.ts.map":
        return False

    return True


def add_package(zf: zipfile.ZipFile, pkg_rel: str, stats: dict) -> None:
    pkg_dir = ROOT / pkg_rel
    if not pkg_dir.exists():
        print(f"  SKIP (missing): {pkg_rel}")
        return

    before = stats["files"]
    for dirpath, dirnames, filenames in os.walk(pkg_dir):
        # Prune dirs in-place so os.walk doesn't descend into them
        dirnames[:] = [d for d in dirnames if d not in PRUNE_DIRS]

        for fname in filenames:
            abs_file = Path(dirpath) / fname
            if not should_include(abs_file):
                continue
            rel_to_root = abs_file.relative_to(ROOT)
            arcname = f"{ZIP_PREFIX}/{rel_to_root}"
            zf.write(abs_file, arcname)
            stats["files"] += 1
            stats["bytes"] += abs_file.stat().st_size

    added = stats["files"] - before
    print(f"  {added:>4} files  ← {pkg_rel}")


def add_root_files(zf: zipfile.ZipFile, stats: dict) -> None:
    print("  Root files:")
    for fname in ROOT_FILES:
        fpath = ROOT / fname
        if not fpath.exists():
            print(f"          SKIP (missing): {fname}")
            continue
        if not should_include(fpath):
            continue
        zf.write(fpath, f"{ZIP_PREFIX}/{fname}")
        stats["files"] += 1
        stats["bytes"] += fpath.stat().st_size
        print(f"         + {fname}")


def spot_check(zf: zipfile.ZipFile) -> bool:
    names = set(zf.namelist())
    checks = [
        # API server core
        f"{ZIP_PREFIX}/artifacts/api-server/src/app.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/index.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/routes/userExchanges.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/exchanges/adapters/KrakenAdapter.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/exchanges/adapters/AlpacaAdapter.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/exchanges/adapters/CoinbaseAdapter.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/exchanges/adapters/BinanceAdapter.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/vault/CredentialVault.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/lib/wsServer.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/lib/tradingLoop.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/build.mjs",
        f"{ZIP_PREFIX}/artifacts/api-server/package.json",
        f"{ZIP_PREFIX}/artifacts/api-server/tsconfig.json",
        # Dashboard
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/App.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/pages/CommandCenter.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/components/command/ActiveTradesPanel.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/components/command/MiddleStatsGrid.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/components/command/AIThreatMonitor.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/components/command/TelemetryRow.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/vite.config.ts",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/package.json",
        # Shared libs
        f"{ZIP_PREFIX}/lib/db/src/schema/userExchangeConnections.ts",
        f"{ZIP_PREFIX}/lib/db/src/schema/users.ts",
        f"{ZIP_PREFIX}/lib/db/drizzle.config.ts",
        f"{ZIP_PREFIX}/lib/api-spec/openapi.yaml",
        f"{ZIP_PREFIX}/lib/api-client-react/src/index.ts",
        f"{ZIP_PREFIX}/lib/api-zod/src/index.ts",
        # Root configs
        f"{ZIP_PREFIX}/.env.example",
        f"{ZIP_PREFIX}/package.json",
        f"{ZIP_PREFIX}/pnpm-workspace.yaml",
        f"{ZIP_PREFIX}/pnpm-lock.yaml",
        f"{ZIP_PREFIX}/tsconfig.json",
        f"{ZIP_PREFIX}/tsconfig.base.json",
        f"{ZIP_PREFIX}/SETUP.md",
        f"{ZIP_PREFIX}/DEPLOYMENT.md",
    ]

    all_ok = True
    print("\n  Spot-check critical files:")
    for c in checks:
        ok = c in names
        status = "OK  " if ok else "MISS"
        if not ok:
            all_ok = False
        print(f"    [{status}] {c.replace(ZIP_PREFIX + '/', '')}")

    # Verify excluded packages are absent
    excluded_patterns = ["natura-ai", "natura-web", "mockup-sandbox"]
    leaked = [n for n in names if any(p in n for p in excluded_patterns)]
    if leaked:
        print(f"\n  ERROR: {len(leaked)} excluded-package files found in ZIP:")
        for l in leaked[:5]:
            print(f"    {l}")
        all_ok = False
    else:
        print(f"\n  Exclusion check: PASS (no natura-ai / natura-web / mockup-sandbox files)")

    return all_ok


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        OUTPUT.unlink()

    stats: dict = {"files": 0, "bytes": 0}
    print(f"\nBuilding Apex Trader full export ZIP...")
    print(f"  Root:   {ROOT}")
    print(f"  Output: {OUTPUT.relative_to(ROOT)}\n")

    print("  Packages:")
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for pkg in INCLUDE_PACKAGES:
            add_package(zf, pkg, stats)

        print()
        add_root_files(zf, stats)

        # Spot-check while zip is still open
        ok = spot_check(zf)

    size_bytes = OUTPUT.stat().st_size
    size_kb    = size_bytes / 1024
    size_mb    = size_kb / 1024

    print(f"\n{'✓ Export complete!' if ok else '✗ Export complete with warnings!'}")
    print(f"  Files:  {stats['files']:,}")
    print(f"  Size:   {size_mb:.2f} MB  ({size_kb:,.0f} KB)")
    print(f"  Path:   {OUTPUT}")
    print(f"  URL:    /apex-trader-operator-console-v5.zip\n")

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
