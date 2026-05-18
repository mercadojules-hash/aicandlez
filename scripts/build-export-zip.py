#!/usr/bin/env python3
"""
AICandlez — Full Production Export Builder
Produces a clean, complete, deployable ZIP of the entire AICandlez workspace.

Includes: api-server, trading-dashboard, aicandlez-app PWA, landing,
all shared libs, scripts, root configs.

Excludes: natura-ai, natura-web, mockup-sandbox (separate products),
node_modules, dist, .git, attached_assets, .local, .replit-artifact.

Usage:
  python3 scripts/build-export-zip.py

Output: artifacts/trading-dashboard/public/aicandlez-production.zip
Also mirrored to: artifacts/aicandlez-app/public/aicandlez-production.zip
"""

import os
import shutil
import sys
import zipfile
from pathlib import Path

ROOT       = Path(__file__).parent.parent.resolve()
ZIP_PREFIX = "aicandlez"
OUTPUT     = ROOT / "artifacts" / "trading-dashboard" / "public" / "aicandlez-production.zip"
MIRROR     = ROOT / "artifacts" / "aicandlez-app"     / "public" / "aicandlez-production.zip"

# ── Directories/names to prune everywhere ─────────────────────────────────────
PRUNE_DIRS: set[str] = {
    "node_modules", "dist", ".git", ".cache", "__pycache__",
    ".expo", ".turbo", ".pnpm-store", "coverage",
    ".replit-artifact", ".agents", ".local",
    "attached_assets",
}

PRUNE_FILES: set[str] = {
    ".env", ".env.local", ".env.development.local", ".env.production.local",
    ".DS_Store", "Thumbs.db",
}

PRUNE_SUFFIXES: set[str] = {
    ".tsbuildinfo", ".log", ".pid",
}

# Older export ZIPs sitting inside public/ directories
PRUNE_FILENAME_STARTSWITH = (
    "apex-trader", "ai-trader-platform", "aicandlez-production",
    "aicandlez-operator-console", "aicandlez-v",
)

# ── Packages to include ───────────────────────────────────────────────────────
INCLUDE_PACKAGES = [
    # Shared libraries
    "lib/db",
    "lib/api-spec",
    "lib/api-client-react",
    "lib/api-zod",
    # AICandlez production artifacts
    "artifacts/api-server",
    "artifacts/trading-dashboard",
    "artifacts/aicandlez-app",
    "artifacts/landing",
    # Utility scripts
    "scripts",
]

# ── Root-level standalone files ───────────────────────────────────────────────
ROOT_FILES = [
    ".env.example",
    ".env.production.example",
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
    "SETUP.md",
    "DEPLOYMENT.md",
    "README.md",
    "replit.md",
    ".gitignore",
    "render.yaml",
    "railway.json",
    "nixpacks.toml",
]


def should_include(abs_path: Path) -> bool:
    if abs_path.name in PRUNE_FILES:
        return False
    if abs_path.suffix in PRUNE_SUFFIXES:
        return False

    # Drop legacy / prior ZIP exports from public dirs
    name_lower = abs_path.name.lower()
    if abs_path.suffix == ".zip":
        for pat in PRUNE_FILENAME_STARTSWITH:
            if name_lower.startswith(pat):
                return False

    # Skip declaration map files — keep .d.ts
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
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/vault/CredentialVault.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/services/notifications/NotificationDispatcher.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/src/lib/wsServer.ts",
        f"{ZIP_PREFIX}/artifacts/api-server/build.mjs",
        f"{ZIP_PREFIX}/artifacts/api-server/package.json",
        # Dashboard
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/App.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/pages/CommandCenter.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/pages/DesktopTerminal.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/package.json",
        # AICandlez PWA
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/src/pages/Home.tsx",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/src/pages/Billing.tsx",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/src/pages/Profile.tsx",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/src/lib/feedback.ts",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/src/hooks/usePushNotifications.ts",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/public/sw.js",
        f"{ZIP_PREFIX}/artifacts/aicandlez-app/package.json",
        # Landing
        f"{ZIP_PREFIX}/artifacts/landing/package.json",
        # Shared libs
        f"{ZIP_PREFIX}/lib/db/src/schema/userExchangeConnections.ts",
        f"{ZIP_PREFIX}/lib/db/src/schema/users.ts",
        f"{ZIP_PREFIX}/lib/api-spec/openapi.yaml",
        # Root configs
        f"{ZIP_PREFIX}/.env.example",
        f"{ZIP_PREFIX}/package.json",
        f"{ZIP_PREFIX}/pnpm-workspace.yaml",
        f"{ZIP_PREFIX}/pnpm-lock.yaml",
        f"{ZIP_PREFIX}/tsconfig.json",
        f"{ZIP_PREFIX}/SETUP.md",
        f"{ZIP_PREFIX}/DEPLOYMENT.md",
        f"{ZIP_PREFIX}/render.yaml",
    ]

    all_ok = True
    print("\n  Spot-check critical files:")
    for c in checks:
        ok = c in names
        status = "OK  " if ok else "MISS"
        if not ok:
            all_ok = False
        print(f"    [{status}] {c.replace(ZIP_PREFIX + '/', '')}")

    excluded_patterns = ["natura-ai", "natura-web", "mockup-sandbox"]
    leaked = [n for n in names if any(p in n for p in excluded_patterns)]
    if leaked:
        print(f"\n  ERROR: {len(leaked)} excluded-package files found in ZIP:")
        for l in leaked[:5]:
            print(f"    {l}")
        all_ok = False
    else:
        print(f"\n  Exclusion check: PASS (no natura-ai / natura-web / mockup-sandbox)")

    return all_ok


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    MIRROR.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists(): OUTPUT.unlink()
    if MIRROR.exists(): MIRROR.unlink()

    stats: dict = {"files": 0, "bytes": 0}
    print(f"\nBuilding AICandlez production export ZIP...")
    print(f"  Root:   {ROOT}")
    print(f"  Output: {OUTPUT.relative_to(ROOT)}\n")

    print("  Packages:")
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for pkg in INCLUDE_PACKAGES:
            add_package(zf, pkg, stats)
        print()
        add_root_files(zf, stats)
        ok = spot_check(zf)

    # Mirror to aicandlez-app/public so the PWA can serve it too
    shutil.copy2(OUTPUT, MIRROR)

    size_bytes = OUTPUT.stat().st_size
    size_kb    = size_bytes / 1024
    size_mb    = size_kb / 1024

    print(f"\n{'OK Export complete!' if ok else 'WARN Export complete with warnings!'}")
    print(f"  Files:   {stats['files']:,}")
    print(f"  Size:    {size_mb:.2f} MB  ({size_kb:,.0f} KB)")
    print(f"  Path:    {OUTPUT}")
    print(f"  Mirror:  {MIRROR.relative_to(ROOT)}")
    print(f"  URL(s):  /aicandlez-production.zip\n")

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
