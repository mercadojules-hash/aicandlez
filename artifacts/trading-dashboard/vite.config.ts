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

// ── API guard plugin ───────────────────────────────────────────────────────────
// The Replit shared proxy routes /api/* to the API server (port 8080) and
// /  to this Vite dev server (port 24210).  When the API server is starting
// up or restarting, the shared proxy may fall through to Vite, which would
// normally serve index.html (200, text/html) as its SPA fallback — a silent
// data corruption that poisons the React Query cache for JSON endpoints.
//
// This plugin intercepts any /api/* request that reaches Vite and returns a
// proper 503 JSON error, so React Query enters the error state instead of
// caching an HTML string as if it were valid API data.
const apiGuardPlugin: import("vite").Plugin = {
  name: "api-fallback-guard",
  configureServer(server) {
    // Only intercept /api/* on Replit where the shared reverse proxy routes
    // /api to the API server.  Locally, server.proxy (below) forwards /api
    // to port 8080, so we must NOT intercept here.
    if (!IS_REPLIT) return;
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? "";
      // Strip query string for path matching
      const pathname = url.split("?")[0];
      if (pathname.startsWith("/api/") || pathname === "/api") {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("X-Api-Guard", "vite-fallback");
        res.end(
          JSON.stringify({
            error: "API server temporarily unavailable — please retry in a moment",
          }),
        );
        return;
      }
      next();
    });
  },
};

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
    apiGuardPlugin,
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
    // Local development only: proxy /api/* to the API server on port 8080.
    // On Replit the shared platform proxy handles this at the infra level.
    ...(!IS_REPLIT && {
      proxy: {
        "/api": {
          target: `http://localhost:${process.env["API_PORT"] ?? "8080"}`,
          changeOrigin: true,
        },
      },
    }),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
