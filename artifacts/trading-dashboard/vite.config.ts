import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// ── Environment defaults (safe for local dev outside Replit) ───────────────────
const IS_REPLIT = process.env.REPL_ID !== undefined;

const rawPort = process.env.PORT;
const port = (() => {
  if (!rawPort) return 5173;
  const n = Number(rawPort);
  return Number.isNaN(n) || n <= 0 ? 5173 : n;
})();

if (!rawPort) {
  console.warn("[vite] PORT not set — defaulting to 5173");
}

const basePath = process.env.BASE_PATH ?? "/";

if (!process.env.BASE_PATH) {
  console.warn('[vite] BASE_PATH not set — defaulting to "/"');
}

// ── Replit-specific plugins (skipped outside Replit automatically) ─────────────
const replitPlugins: import("vite").Plugin[] = [];
if (IS_REPLIT && process.env.NODE_ENV !== "production") {
  try {
    const [overlay, cartographer, banner] = await Promise.all([
      import("@replit/vite-plugin-runtime-error-modal"),
      import("@replit/vite-plugin-cartographer"),
      import("@replit/vite-plugin-dev-banner"),
    ]);
    replitPlugins.push(
      overlay.default(),
      cartographer.cartographer({
        root: path.resolve(import.meta.dirname, ".."),
      }),
      banner.devBanner(),
    );
  } catch {
    // Replit plugins unavailable — continuing without them
  }
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    // optimize: false prevents @clerk/themes CSS layer imports from being
    // reordered in prod builds (Tailwind v4 + lightningcss interaction)
    tailwindcss({ optimize: false }),
    ...replitPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: IS_REPLIT,   // strict only on Replit; locally fall back to next free port
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: IS_REPLIT,     // only restrict fs on Replit; locally allow any path
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
