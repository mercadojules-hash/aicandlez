#!/usr/bin/env python3
"""
Build the Apex Trader export ZIP.

Usage:
    python3 scripts/build-export-zip.py [output_path]

Default output: artifacts/trading-dashboard/public/apex-trader-v2.zip
Run from the workspace root.
"""

import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else (
    ROOT / "artifacts/trading-dashboard/public/apex-trader-v2.zip"
)

# ── Directories to walk (relative to ROOT) ────────────────────────────────────
INCLUDE_DIRS = [
    "artifacts/api-server/src",
    "artifacts/trading-dashboard/src",
    "lib/api-spec",
    "lib/api-client-react/src",
    "lib/api-zod/src",
    "lib/db/src",
    "scripts/src",
]

# ── Individual files to include (relative to ROOT) ────────────────────────────
INCLUDE_FILES = [
    # api-server root configs
    "artifacts/api-server/package.json",
    "artifacts/api-server/tsconfig.json",
    # trading-dashboard root configs
    "artifacts/trading-dashboard/index.html",
    "artifacts/trading-dashboard/vite.config.ts",
    "artifacts/trading-dashboard/components.json",
    "artifacts/trading-dashboard/package.json",
    "artifacts/trading-dashboard/tsconfig.json",
    # trading-dashboard static assets
    "artifacts/trading-dashboard/public/logo.svg",
    "artifacts/trading-dashboard/public/favicon.svg",
    "artifacts/trading-dashboard/public/opengraph.jpg",
    # lib root configs (api-spec root files are picked up by the dir walk above)
    "lib/api-client-react/package.json",
    "lib/api-client-react/tsconfig.json",
    "lib/api-zod/package.json",
    "lib/api-zod/tsconfig.json",
    "lib/db/drizzle.config.ts",
    "lib/db/package.json",
    "lib/db/tsconfig.json",
    # scripts root
    "scripts/package.json",
    "scripts/tsconfig.json",
    # workspace root
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "tsconfig.json",
    ".env.example",
    "SETUP.md",
]

# ── Excluded directory names (skip anywhere in the tree) ──────────────────────
SKIP_DIRS = {
    "node_modules", "dist", ".git", ".local", ".replit-artifact",
    "__pycache__", ".cache", "coverage",
}

# ── Excluded file suffixes ────────────────────────────────────────────────────
SKIP_SUFFIXES = {".zip", ".tsbuildinfo", ".log", ".env"}

# ── Excluded file names ───────────────────────────────────────────────────────
SKIP_NAMES = {".env", ".DS_Store"}


def should_skip_file(path: Path) -> bool:
    if path.suffix in SKIP_SUFFIXES:
        return True
    if path.name in SKIP_NAMES:
        return True
    return False


def add_dir(zf: zipfile.ZipFile, dir_rel: str) -> int:
    """Walk a directory and add all non-excluded files. Returns count."""
    count = 0
    base = ROOT / dir_rel
    if not base.exists():
        print(f"  WARNING: directory not found — {dir_rel}")
        return 0
    for dirpath, dirnames, filenames in os.walk(base):
        # Prune excluded subdirectories in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            fpath = Path(dirpath) / fname
            if should_skip_file(fpath):
                continue
            arcname = fpath.relative_to(ROOT)
            zf.write(fpath, arcname)
            count += 1
    return count


def add_file(zf: zipfile.ZipFile, file_rel: str) -> bool:
    """Add a single file. Returns True on success."""
    fpath = ROOT / file_rel
    if not fpath.exists():
        print(f"  WARNING: file not found — {file_rel}")
        return False
    if should_skip_file(fpath):
        return False
    zf.write(fpath, file_rel)
    return True


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Building ZIP: {OUTPUT.relative_to(ROOT)}")
    print()

    total = 0
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for d in INCLUDE_DIRS:
            n = add_dir(zf, d)
            print(f"  [dir]  {d}  ({n} files)")
            total += n

        file_count = 0
        for f in INCLUDE_FILES:
            if add_file(zf, f):
                file_count += 1
        print(f"  [files] {file_count} individual files")
        total += file_count

    size_mb = OUTPUT.stat().st_size / (1024 * 1024)
    print()
    print(f"Done — {total} files, {size_mb:.2f} MB")
    print(f"Saved to: {OUTPUT}")


if __name__ == "__main__":
    main()
