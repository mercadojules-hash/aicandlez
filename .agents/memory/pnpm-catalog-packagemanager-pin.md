---
name: pnpm catalog vs packageManager pin trap
description: Why exported/standalone copies of this monorepo can fail `pnpm install` off-platform even though it works here.
---

The repo's root `package.json` `packageManager` field pins an OLDER pnpm than the
binary actually running in the Replit env (env binary is pnpm 10.x). `catalog:`
resolution only exists in **pnpm ≥ 9.5**, so in-repo installs succeed (newer
binary) while the pin is a lie.

**Why it matters:** any standalone/exported copy that relies on corepack will
honor the pin, fetch the OLD pnpm, and fail with
`<dep>@catalog: isn't supported by any available resolver`. The failure is
invisible until you test in a truly clean dir with corepack.

**How to apply:** when carving out a standalone package that keeps `catalog:`
refs, bump `packageManager` to a catalog-capable pnpm (≥9.5; we used 10.26.1) and
verify with a real `pnpm install` in a fresh directory — never trust the in-repo
install as proof of portability.
