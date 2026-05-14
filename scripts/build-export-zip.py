#!/usr/bin/env python3
"""
Build the Apex Trader standalone export ZIP.

  python3 scripts/build-export-zip.py [output_path]

Default output: artifacts/trading-dashboard/public/apex-trader-v2.zip

All files are placed under an "apex-trader/" prefix so the extracted folder
is a self-contained workspace named "apex-trader".

The bundled root config files (pnpm-workspace.yaml, package.json, tsconfig.json)
are Apex Trader-only — natura-ai, natura-web, mockup-sandbox, and all Expo/mobile
references are stripped out.
"""

import io
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else (
    ROOT / "artifacts/trading-dashboard/public/apex-trader-v2.zip"
)

ZIP_PREFIX = "apex-trader"   # All paths in the ZIP go under this folder

# ── Directories to walk (relative to ROOT) ────────────────────────────────────
# Only Apex Trader packages.
INCLUDE_DIRS = [
    "artifacts/api-server/src",
    "artifacts/trading-dashboard/src",
    "lib/api-spec",            # openapi.yaml + orval.config.ts + package.json
    "lib/api-client-react/src",
    "lib/api-zod/src",
    "lib/db/src",
    "scripts/src",
]

# ── Individual root-level files to include (relative to ROOT) ─────────────────
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
    # lib package configs
    "lib/api-client-react/package.json",
    "lib/api-client-react/tsconfig.json",
    "lib/api-zod/package.json",
    "lib/api-zod/tsconfig.json",
    "lib/db/drizzle.config.ts",
    "lib/db/package.json",
    "lib/db/tsconfig.json",
    # scripts
    "scripts/package.json",
    "scripts/tsconfig.json",
    # setup docs
    ".env.example",
    "SETUP.md",
    "tsconfig.base.json",
]

# ── Root configs that need Apex Trader-only rewriting ─────────────────────────
# These are generated/modified in memory so the ZIP recipient can run
# `pnpm install` without needing natura-ai, natura-web, or mockup-sandbox.

APEX_PACKAGE_JSON = """\
{
  "name": "apex-trader",
  "version": "2.0.0",
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "pnpm --filter @workspace/trading-dashboard run dev",
    "dev:api": "pnpm --filter @workspace/api-server run dev",
    "dev:all": "concurrently --kill-others-on-fail --names \\"api,web\\" --prefix-colors \\"cyan,magenta\\" \\"pnpm run dev:api\\" \\"pnpm run dev\\"",
    "typecheck:libs": "tsc --build",
    "typecheck": "pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/trading-dashboard run typecheck"
  },
  "private": true,
  "devDependencies": {
    "concurrently": "^9.1.2",
    "prettier": "^3.8.1",
    "typescript": "~5.9.2"
  },
  "dependencies": {
    "express-rate-limit": "^8.5.1",
    "stripe": "^22.1.1",
    "stripe-replit-sync": "^1.0.0"
  }
}
"""

APEX_PNPM_WORKSPACE_YAML = """\
# ============================================================================
# Apex Trader — pnpm workspace configuration
# ============================================================================
#
# Security: minimum release age guards against supply-chain attacks.
# Any npm package version must have been published at least 1 day before
# pnpm will allow installing it.
# ============================================================================
minimumReleaseAge: 1440

minimumReleaseAgeExclude:
  - '@replit/*'
  - stripe-replit-sync

packages:
  - artifacts/api-server
  - artifacts/trading-dashboard
  - lib/*
  - scripts

catalog:
  '@replit/vite-plugin-cartographer': ^0.5.1
  '@replit/vite-plugin-dev-banner': ^0.1.1
  '@replit/vite-plugin-runtime-error-modal': ^0.0.6
  '@tailwindcss/vite': ^4.1.14
  '@tanstack/react-query': ^5.90.21
  '@types/node': ^25.3.3
  '@types/react': ^19.2.0
  '@types/react-dom': ^19.2.0
  '@vitejs/plugin-react': ^5.0.4
  class-variance-authority: ^0.7.1
  clsx: ^2.1.1
  drizzle-orm: ^0.45.2
  framer-motion: ^12.23.24
  lucide-react: ^0.545.0
  react: 19.1.0
  react-dom: 19.1.0
  tailwind-merge: ^3.3.1
  tailwindcss: ^4.1.14
  tsx: ^4.21.0
  vite: ^7.3.2
  zod: ^3.25.76

autoInstallPeers: false

onlyBuiltDependencies:
  - '@swc/core'
  - esbuild
  - msw
  - unrs-resolver

overrides:
  # Remove platform-specific native binaries to keep install lean.
  # Delete this entire overrides section if you hit install errors on
  # macOS or Windows.
  "esbuild>@esbuild/darwin-arm64": "-"
  "esbuild>@esbuild/darwin-x64": "-"
  "esbuild>@esbuild/freebsd-arm64": "-"
  "esbuild>@esbuild/freebsd-x64": "-"
  "esbuild>@esbuild/linux-arm": "-"
  "esbuild>@esbuild/linux-arm64": "-"
  "esbuild>@esbuild/linux-ia32": "-"
  "esbuild>@esbuild/linux-loong64": "-"
  "esbuild>@esbuild/linux-mips64el": "-"
  "esbuild>@esbuild/linux-ppc64": "-"
  "esbuild>@esbuild/linux-riscv64": "-"
  "esbuild>@esbuild/linux-s390x": "-"
  "esbuild>@esbuild/netbsd-arm64": "-"
  "esbuild>@esbuild/netbsd-x64": "-"
  "esbuild>@esbuild/openbsd-arm64": "-"
  "esbuild>@esbuild/openbsd-x64": "-"
  "esbuild>@esbuild/sunos-x64": "-"
  "esbuild>@esbuild/win32-arm64": "-"
  "esbuild>@esbuild/win32-ia32": "-"
  "esbuild>@esbuild/win32-x64": "-"
  "esbuild>@esbuild/aix-ppc64": '-'
  "esbuild>@esbuild/android-arm": '-'
  "esbuild>@esbuild/android-arm64": '-'
  "esbuild>@esbuild/android-x64": '-'
  "esbuild>@esbuild/openharmony-arm64": '-'
  "lightningcss>lightningcss-android-arm64": "-"
  "lightningcss>lightningcss-darwin-arm64": "-"
  "lightningcss>lightningcss-darwin-x64": "-"
  "lightningcss>lightningcss-freebsd-x64": "-"
  "lightningcss>lightningcss-linux-arm-gnueabihf": "-"
  "lightningcss>lightningcss-linux-arm64-gnu": "-"
  "lightningcss>lightningcss-linux-arm64-musl": "-"
  "lightningcss>lightningcss-linux-x64-musl": "-"
  "lightningcss>lightningcss-win32-arm64-msvc": "-"
  "lightningcss>lightningcss-win32-x64-msvc": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-android-arm64": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-darwin-arm64": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-darwin-x64": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-freebsd-x64": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-linux-arm-gnueabihf": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-linux-arm64-gnu": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-linux-arm64-musl": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-win32-arm64-msvc": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-win32-x64-msvc": "-"
  "@tailwindcss/oxide>@tailwindcss/oxide-linux-x64-musl": "-"
  "rollup>@rollup/rollup-android-arm-eabi": "-"
  "rollup>@rollup/rollup-android-arm64": "-"
  "rollup>@rollup/rollup-darwin-arm64": "-"
  "rollup>@rollup/rollup-darwin-x64": "-"
  "rollup>@rollup/rollup-freebsd-arm64": "-"
  "rollup>@rollup/rollup-freebsd-x64": "-"
  "rollup>@rollup/rollup-linux-arm-gnueabihf": "-"
  "rollup>@rollup/rollup-linux-arm-musleabihf": "-"
  "rollup>@rollup/rollup-linux-arm64-gnu": "-"
  "rollup>@rollup/rollup-linux-arm64-musl": "-"
  "rollup>@rollup/rollup-linux-loong64-gnu": "-"
  "rollup>@rollup/rollup-linux-loong64-musl": "-"
  "rollup>@rollup/rollup-linux-ppc64-gnu": "-"
  "rollup>@rollup/rollup-linux-ppc64-musl": "-"
  "rollup>@rollup/rollup-linux-riscv64-gnu": "-"
  "rollup>@rollup/rollup-linux-riscv64-musl": "-"
  "rollup>@rollup/rollup-linux-s390x-gnu": "-"
  "rollup>@rollup/rollup-linux-x64-musl": "-"
  "rollup>@rollup/rollup-openbsd-x64": "-"
  "rollup>@rollup/rollup-openharmony-arm64": "-"
  "rollup>@rollup/rollup-win32-arm64-msvc": "-"
  "rollup>@rollup/rollup-win32-ia32-msvc": "-"
  "rollup>@rollup/rollup-win32-x64-gnu": "-"
  "rollup>@rollup/rollup-win32-x64-msvc": "-"
  "@esbuild-kit/esm-loader": "npm:tsx@^4.21.0"
  esbuild: "0.27.3"
"""

APEX_TSCONFIG_JSON = """\
{
  "extends": "./tsconfig.base.json",
  "compileOnSave": false,
  "files": [],
  "references": [
    { "path": "./lib/db" },
    { "path": "./lib/api-client-react" },
    { "path": "./lib/api-zod" }
  ]
}
"""

# ── Injected custom files in the ZIP (arcname -> text content) ─────────────────
CUSTOM_TEXT_FILES = {
    "package.json": APEX_PACKAGE_JSON,
    "pnpm-workspace.yaml": APEX_PNPM_WORKSPACE_YAML,
    "tsconfig.json": APEX_TSCONFIG_JSON,
}

# ── Excluded directory names (skip anywhere in the tree) ──────────────────────
SKIP_DIRS = {
    "node_modules", "dist", ".git", ".local", ".replit-artifact",
    "__pycache__", ".cache", "coverage",
}

# ── Excluded file suffixes and names ──────────────────────────────────────────
SKIP_SUFFIXES = {".zip", ".tsbuildinfo", ".log", ".env"}
SKIP_NAMES = {".env", ".DS_Store"}


def should_skip_file(path: Path) -> bool:
    return path.suffix in SKIP_SUFFIXES or path.name in SKIP_NAMES


def arc(rel_path: str) -> str:
    """Prefix a relative path with the ZIP top-level folder."""
    return f"{ZIP_PREFIX}/{rel_path}"


def add_dir(zf: zipfile.ZipFile, dir_rel: str) -> int:
    count = 0
    base = ROOT / dir_rel
    if not base.exists():
        print(f"  WARNING: directory not found — {dir_rel}")
        return 0
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            fpath = Path(dirpath) / fname
            if should_skip_file(fpath):
                continue
            arcname = arc(str(fpath.relative_to(ROOT)))
            zf.write(fpath, arcname)
            count += 1
    return count


def add_file(zf: zipfile.ZipFile, file_rel: str) -> bool:
    fpath = ROOT / file_rel
    if not fpath.exists():
        print(f"  WARNING: file not found — {file_rel}")
        return False
    if should_skip_file(fpath):
        return False
    zf.write(fpath, arc(file_rel))
    return True


def add_text(zf: zipfile.ZipFile, arcname: str, content: str) -> None:
    zf.writestr(arc(arcname), content.encode("utf-8"))


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Building Apex Trader ZIP: {OUTPUT.relative_to(ROOT)}")
    print(f"ZIP prefix: {ZIP_PREFIX}/")
    print()

    total = 0
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:

        # 1. Source directories
        for d in INCLUDE_DIRS:
            n = add_dir(zf, d)
            print(f"  [dir]   {d}  ({n} files)")
            total += n

        # 2. Individual files
        file_count = sum(1 for f in INCLUDE_FILES if add_file(zf, f))
        print(f"  [files] {file_count} individual config / asset files")
        total += file_count

        # 3. Apex Trader-only root configs (overwrite the monorepo versions)
        for arcname, content in CUSTOM_TEXT_FILES.items():
            add_text(zf, arcname, content)
            print(f"  [gen]   {arcname}  (Apex Trader-only)")
        total += len(CUSTOM_TEXT_FILES)

    size_kb = OUTPUT.stat().st_size / 1024
    print()
    print(f"Done — {total} entries, {size_kb:.1f} KB")
    print(f"Saved: {OUTPUT}")
    print()

    # ── Spot-check key files are present ──────────────────────────────────────
    print("Spot-check:")
    checks = [
        f"{ZIP_PREFIX}/artifacts/api-server/src/app.ts",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/pages/CommandCenter.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/src/components/command/LiveTradingConsole.tsx",
        f"{ZIP_PREFIX}/artifacts/trading-dashboard/vite.config.ts",
        f"{ZIP_PREFIX}/lib/db/src/schema/userExchangeConnections.ts",
        f"{ZIP_PREFIX}/lib/api-client-react/src/index.ts",
        f"{ZIP_PREFIX}/lib/api-zod/src/index.ts",
        f"{ZIP_PREFIX}/.env.example",
        f"{ZIP_PREFIX}/SETUP.md",
        f"{ZIP_PREFIX}/package.json",
        f"{ZIP_PREFIX}/pnpm-workspace.yaml",
        f"{ZIP_PREFIX}/tsconfig.json",
        f"{ZIP_PREFIX}/tsconfig.base.json",
    ]
    with zipfile.ZipFile(OUTPUT) as zf:
        names = set(zf.namelist())
        all_ok = True
        for c in checks:
            ok = c in names
            if not ok:
                all_ok = False
            print(f"  {'OK  ' if ok else 'MISS'} {c}")
        # Verify no Expo / Natura files crept in
        bad = [n for n in names if any(x in n for x in
               ["natura", "natura-ai", "natura-web", "mockup-sandbox", "expo"])]
        if bad:
            print(f"\n  ERROR: {len(bad)} unwanted files found:")
            for b in bad[:5]:
                print(f"    {b}")
            all_ok = False
        else:
            print(f"\n  No natura / expo files — clean Apex Trader only")
        if all_ok:
            print("\n  All checks passed.")
        else:
            print("\n  Some checks FAILED — review output above.")


if __name__ == "__main__":
    main()
