#!/usr/bin/env python3
"""
Build a clean natura-ai.zip from artifacts/natura-ai/
Output: artifacts/natura-web/public/natura-ai.zip

Rules:
 - Flat root structure (no parent-dir prefix)
 - Exclude: yoga, chakra, breathe, flow, pose content
 - Exclude: node_modules, .expo, dist, .git
 - Rewrite package.json to remove @workspace/* and catalog: refs
 - Remove tsconfig references field from tsconfig.json
"""

import os
import json
import re
import zipfile
import shutil

SRC    = os.path.join(os.path.dirname(__file__), "../artifacts/natura-ai")
DEST   = os.path.join(os.path.dirname(__file__), "../artifacts/natura-web/public/natura-ai.zip")
LOCKFILE_DEST = os.path.join(os.path.dirname(__file__), "../artifacts/natura-web/public")

SRC = os.path.abspath(SRC)
DEST = os.path.abspath(DEST)

EXCLUDE_DIRS = {
    "node_modules", ".expo", "dist", ".git", "__pycache__",
}

EXCLUDE_FILES = {
    "yoga.tsx", "chakras.tsx", "breathe.tsx",
    "poses.ts", "chakras.ts",
    ".DS_Store",
}

EXCLUDE_PATTERNS = [
    r"yoga.*\.webp",
    r"chakra.*\.png",
    r"chakra.*\.webp",
    r"nature-breath.*\.webp",
]

EXCLUDE_PATHS = {
    os.path.join("app", "pose"),
    os.path.join("app", "flow"),
}

def should_exclude(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")

    # Exclude top-level bad dirs
    if parts[0] in EXCLUDE_DIRS:
        return True

    # Exclude any path segment that is a bad dir
    for p in parts[:-1]:
        if p in EXCLUDE_DIRS:
            return True

    filename = parts[-1]

    # Exclude specific files
    if filename in EXCLUDE_FILES:
        return True

    # Exclude by pattern
    for pat in EXCLUDE_PATTERNS:
        if re.match(pat, filename, re.IGNORECASE):
            return True

    # Exclude old screen paths
    rel_norm = os.path.join(*parts)
    for excl in EXCLUDE_PATHS:
        if rel_norm.startswith(excl + os.sep) or rel_norm == excl:
            return True

    return False


def rewrite_package_json(content: str) -> str:
    try:
        pkg = json.loads(content)
    except Exception:
        return content

    pkg.pop("name", None)
    pkg["name"] = "natura-ai"
    pkg.pop("private", None)
    pkg["version"] = pkg.get("version", "1.0.0")

    # Remove @workspace/* deps and resolve catalog: entries
    # catalog: pins from pnpm-workspace.yaml (approximate real versions)
    CATALOG_VERSIONS = {
        "react":                       "18.3.1",
        "react-native":                "0.76.9",
        "expo":                        "~54.0.33",
        "expo-router":                 "~6.0.23",
        "expo-font":                   "~13.3.1",
        "@expo-google-fonts/inter":    "~0.2.3",
        "expo-splash-screen":          "~0.29.24",
        "expo-status-bar":             "~2.2.3",
        "expo-linking":                "~8.0.11",
        "expo-constants":              "~17.0.8",
        "expo-image-picker":           "~17.0.10",
        "@react-native-async-storage/async-storage": "~2.1.2",
        "react-native-safe-area-context": "4.15.0",
        "react-native-screens":        "~4.5.0",
        "react-native-gesture-handler": "~2.23.1",
        "react-native-reanimated":     "~3.17.4",
        "@expo/vector-icons":          "^14.0.0",
        "expo-web-browser":            "~15.0.10",
        "expo-secure-store":           "~14.2.0",
        "typescript":                  "~5.7.3",
        "@types/react":                "~19.0.10",
        "@babel/core":                 "^7.25.2",
    }

    for dep_key in ("dependencies", "devDependencies", "peerDependencies"):
        deps = pkg.get(dep_key, {})
        cleaned = {}
        for k, v in deps.items():
            if k.startswith("@workspace/"):
                continue  # drop workspace-only deps
            if v == "catalog:":
                v = CATALOG_VERSIONS.get(k, "*")
            cleaned[k] = v
        if cleaned:
            pkg[dep_key] = cleaned
        elif dep_key in pkg:
            del pkg[dep_key]

    # Remove workspace-specific scripts
    scripts = pkg.get("scripts", {})
    scripts.pop("postinstall", None)

    return json.dumps(pkg, indent=2) + "\n"


def rewrite_tsconfig(content: str) -> str:
    try:
        # Use regex to strip comments first, then parse
        stripped = re.sub(r'//.*', '', content)
        stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)
        ts = json.loads(stripped)
    except Exception:
        return content
    ts.pop("references", None)
    # Keep extends but fix path if it points to workspace root
    extends = ts.get("extends", "")
    if extends.startswith("../../"):
        ts.pop("extends", None)
    return json.dumps(ts, indent=2) + "\n"


def build_zip():
    if os.path.exists(DEST):
        os.remove(DEST)

    total = 0
    skipped = 0
    with zipfile.ZipFile(DEST, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for dirpath, dirnames, filenames in os.walk(SRC):
            # Prune excluded dirs in-place
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]

            for fname in filenames:
                full_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(full_path, SRC)

                if should_exclude(rel_path):
                    skipped += 1
                    continue

                # Rewrite certain files in memory
                with open(full_path, "rb") as f:
                    raw = f.read()

                if fname == "package.json" and os.path.dirname(rel_path) == "":
                    try:
                        raw = rewrite_package_json(raw.decode("utf-8")).encode("utf-8")
                    except Exception as e:
                        print(f"  ⚠️  Could not rewrite package.json: {e}")

                if fname == "tsconfig.json":
                    try:
                        raw = rewrite_tsconfig(raw.decode("utf-8")).encode("utf-8")
                    except Exception as e:
                        print(f"  ⚠️  Could not rewrite tsconfig.json ({rel_path}): {e}")

                # Flat root — arcname is rel_path (no extra prefix)
                zf.writestr(rel_path, raw)
                total += 1

    size_mb = os.path.getsize(DEST) / (1024 * 1024)
    print(f"✅ natura-ai.zip → {DEST}")
    print(f"   Files: {total}  Skipped: {skipped}  Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    build_zip()
