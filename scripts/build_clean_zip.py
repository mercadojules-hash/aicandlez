#!/usr/bin/env python3
"""
Build natura-ai-CLEAN-6TAB-v1.zip from artifacts/natura-ai/
Output: artifacts/natura-web/public/natura-ai-CLEAN-6TAB-v1.zip

Strict exclusion rules:
  - All yoga-*.webp images
  - All chakra-*.png images
  - All breathwork images (natura-breath-*.webp)
  - data/chakras.ts, data/poses.ts, data/breathwork.ts, data/flows.ts, data/meditation.ts, data/journey.ts
  - app/pose/ directory
  - app/flow/ directory
  - app/breathwork/ directory
  - app/meditation/ directory
  - node_modules, .expo, dist, .git
"""

import os
import json
import re
import zipfile

SRC  = os.path.abspath(os.path.join(os.path.dirname(__file__), "../artifacts/natura-ai"))
DEST = os.path.abspath(os.path.join(os.path.dirname(__file__), "../artifacts/natura-web/public/natura-ai-CLEAN-6TAB-v1.zip"))

# ── Exact directory names to skip (at ANY depth)
SKIP_DIRS = {"node_modules", ".expo", "dist", ".git", "__pycache__", "pose", "flow", "breathwork", "meditation"}

# ── Exact filenames to skip (at ANY path)
SKIP_FILENAMES = {
    "yoga.tsx", "chakras.tsx", "breathe.tsx", "ai.tsx",
    "poses.ts", "chakras.ts", "breathwork.ts", "flows.ts", "meditation.ts", "journey.ts",
    ".DS_Store",
}

# ── Filename PREFIX patterns to skip (checked against the bare filename)
SKIP_PREFIXES = [
    "yoga-",        # yoga-*.webp
    "chakra-",      # chakra-*.png / chakra-*.webp
    "natura-breath-",  # natura-breath-478.webp, natura-breath-box.webp, natura-breath-calm.webp
]

# ── Relative path prefixes to skip (any file inside these dirs)
SKIP_PATH_PREFIXES = [
    "app/pose/",
    "app/flow/",
    "app/breathwork/",
    "app/meditation/",
]

def should_skip(rel_path_unix: str) -> tuple[bool, str]:
    """Returns (skip, reason)."""
    parts = rel_path_unix.split("/")

    # Skip entire directories
    for part in parts[:-1]:
        if part in SKIP_DIRS:
            return True, f"dir '{part}' in SKIP_DIRS"

    filename = parts[-1]

    # Skip by exact filename
    if filename in SKIP_FILENAMES:
        return True, f"filename '{filename}' in SKIP_FILENAMES"

    # Skip by filename prefix
    for pfx in SKIP_PREFIXES:
        if filename.lower().startswith(pfx):
            return True, f"filename starts with '{pfx}'"

    # Skip by relative path prefix
    for pfx in SKIP_PATH_PREFIXES:
        if rel_path_unix.startswith(pfx):
            return True, f"path starts with '{pfx}'"

    return False, ""


# ── Catalog version map (pnpm → real npm versions)
CATALOG = {
    "react":                                    "18.3.1",
    "react-dom":                                "18.3.1",
    "react-native":                             "0.76.9",
    "expo":                                     "~54.0.33",
    "expo-router":                              "~6.0.23",
    "expo-font":                                "~13.3.1",
    "@expo-google-fonts/inter":                 "~0.2.3",
    "expo-splash-screen":                       "~0.29.24",
    "expo-status-bar":                          "~2.2.3",
    "expo-linking":                             "~8.0.11",
    "expo-constants":                           "~17.0.8",
    "expo-image-picker":                        "~17.0.10",
    "expo-web-browser":                         "~15.0.10",
    "expo-secure-store":                        "~14.2.0",
    "expo-av":                                  "~15.1.4",
    "@react-native-async-storage/async-storage":"~2.1.2",
    "react-native-safe-area-context":           "4.15.0",
    "react-native-screens":                     "~4.5.0",
    "react-native-gesture-handler":             "~2.23.1",
    "react-native-reanimated":                  "~3.17.4",
    "react-native-svg":                         "~15.11.2",
    "@expo/vector-icons":                       "^14.0.0",
    "typescript":                               "~5.7.3",
    "@types/react":                             "~19.0.10",
    "@types/react-native":                      "~0.76.9",
    "@babel/core":                              "^7.25.2",
    "babel-preset-expo":                        "^12.0.0",
}

def clean_package_json(raw: str) -> str:
    try:
        pkg = json.loads(raw)
    except Exception:
        return raw

    # Set clean identity
    pkg["name"]    = "natura-ai"
    pkg["version"] = pkg.get("version", "1.0.0")
    pkg.pop("private", None)

    for section in ("dependencies", "devDependencies", "peerDependencies"):
        deps = pkg.get(section, {})
        cleaned = {}
        for k, v in deps.items():
            if k.startswith("@workspace/"):
                continue
            # Resolve catalog: or workspace: references
            if isinstance(v, str) and (v.startswith("catalog:") or v.startswith("workspace:")):
                v = CATALOG.get(k, "*")
            cleaned[k] = v
        if cleaned:
            pkg[section] = cleaned
        elif section in pkg:
            del pkg[section]

    # Remove workspace-only script hooks
    scripts = pkg.get("scripts", {})
    scripts.pop("postinstall", None)
    if scripts:
        pkg["scripts"] = scripts

    return json.dumps(pkg, indent=2) + "\n"


def clean_tsconfig(raw: str) -> str:
    try:
        # Strip JS-style comments before parsing
        stripped = re.sub(r"//[^\n]*", "", raw)
        stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)
        obj = json.loads(stripped)
    except Exception:
        return raw

    obj.pop("references", None)

    # If extends points to workspace root (../../tsconfig.base.json), drop it
    if obj.get("extends", "").startswith("../../"):
        obj.pop("extends", None)

    return json.dumps(obj, indent=2) + "\n"


def build():
    print(f"Source : {SRC}")
    print(f"Output : {DEST}")
    print()

    if os.path.exists(DEST):
        os.remove(DEST)
        print("Removed existing output file.")

    included = []
    skipped  = []

    with zipfile.ZipFile(DEST, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for dirpath, dirnames, filenames in os.walk(SRC):
            # Prune traversal in-place (avoids descending into excluded dirs)
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

            for fname in sorted(filenames):
                full   = os.path.join(dirpath, fname)
                rel    = os.path.relpath(full, SRC)
                rel_u  = rel.replace(os.sep, "/")  # always forward-slash

                skip, reason = should_skip(rel_u)
                if skip:
                    skipped.append((rel_u, reason))
                    continue

                with open(full, "rb") as f:
                    data = f.read()

                # Rewrite root package.json
                if rel_u == "package.json":
                    data = clean_package_json(data.decode("utf-8")).encode("utf-8")

                # Rewrite all tsconfig.json files
                if fname == "tsconfig.json":
                    try:
                        data = clean_tsconfig(data.decode("utf-8")).encode("utf-8")
                    except Exception:
                        pass

                zf.writestr(rel_u, data)
                included.append(rel_u)

    size_mb  = os.path.getsize(DEST) / (1024 * 1024)
    images   = [p for p in included if p.startswith("assets/images/")]
    tabs     = [p for p in included if "(tabs)" in p]

    print(f"✅ ZIP built successfully")
    print(f"   Total files : {len(included)}")
    print(f"   Skipped     : {len(skipped)}")
    print(f"   Size        : {size_mb:.1f} MB")
    print()

    # ── VALIDATION REPORT ──────────────────────────────────────────────────
    print("=" * 60)
    print("VALIDATION REPORT")
    print("=" * 60)

    # 1. Image count + sample
    print(f"\n[1] Images in ZIP: {len(images)}")
    for img in images[:8]:
        print(f"    {img}")

    # 2. Check for forbidden content
    forbidden = [p for p in included if re.search(r"yoga|chakra|breathe", p, re.IGNORECASE)]
    print(f"\n[2] Files with yoga/chakra/breathe in name: {len(forbidden)}")
    if forbidden:
        for f in forbidden:
            print(f"    ❌ {f}")
    else:
        print("    ✓ ZERO forbidden files")

    # 3. Tabs
    print(f"\n[3] Tab files ({len(tabs)}):")
    for t in sorted(tabs):
        print(f"    {t}")

    # 4. Validate package.json
    print("\n[4] package.json checks:")
    pkg_entry = next((p for p in included if p == "package.json"), None)
    if pkg_entry:
        with zipfile.ZipFile(DEST) as zf:
            pkg_raw = zf.read("package.json").decode("utf-8")
        has_catalog   = "catalog:" in pkg_raw
        has_workspace = "workspace:" in pkg_raw
        has_atwork    = "@workspace/" in pkg_raw
        print(f"    catalog:   {'❌ FOUND' if has_catalog   else '✓ absent'}")
        print(f"    workspace: {'❌ FOUND' if has_workspace else '✓ absent'}")
        print(f"    @workspace/: {'❌ FOUND' if has_atwork  else '✓ absent'}")
    else:
        print("    ❌ package.json not found in ZIP!")

    # 5. List skipped items (summary)
    print(f"\n[5] Skipped files sample (first 20):")
    for p, r in skipped[:20]:
        print(f"    ✕ {p}  [{r}]")

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    build()
