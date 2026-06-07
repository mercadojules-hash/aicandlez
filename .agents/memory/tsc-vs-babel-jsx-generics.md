---
name: tsc vs Vite-Babel generic-JSX divergence
description: A passing tsc typecheck does NOT prove a .tsx page renders; Vite's react-babel parser rejects generic type args on JSX elements.
---

# Generic type args on JSX components: tsc accepts, Vite/Babel rejects

Writing `<RegistryView<SomeType> ... />` (an explicit generic type argument on a
JSX element) passes `tsc --noEmit` cleanly but throws a hard
`[plugin:vite:react-babel] Unexpected token` parse error at runtime — the page
white-screens with a 500/502 in the preview.

**Why:** `@babel/parser`'s JSX grammar (used by `@vitejs/plugin-react`) does not
support the `<Component<T>>` generic-call-on-JSX syntax that the TypeScript
compiler does. The two parsers disagree, so a green typecheck is not sufficient
proof a frontend page actually mounts.

**How to apply:**
- Never put explicit generic type args on a JSX element. Let the generic be
  inferred from props (e.g. `<RegistryView items={data} .../>`), or extract a
  typed wrapper/const if you truly need to pin the type.
- After a jarvis (or any Vite) frontend change, a passing `tsc` is necessary but
  NOT sufficient — take a preview screenshot (even an unauth one that redirects
  to sign-in confirms the bundle compiled) to catch Babel-only parse errors.
