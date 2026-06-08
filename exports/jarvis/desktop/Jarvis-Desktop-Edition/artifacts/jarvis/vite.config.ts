import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis Desktop Edition Vite config.
// - No Replit plugins (cartographer / dev-banner / runtime-error-modal).
// - PORT/BASE_PATH default so `pnpm dev` works with zero env wiring.
// - @clerk/* aliased to local desktop stubs (single-user, offline).
// - `/api` proxied to the local Jarvis backend so same-origin authFetch reaches it.
// - envDir = workspace root so the shared root .env feeds VITE_* vars.
// ─────────────────────────────────────────────────────────────────────────────

const port = Number(process.env.JARVIS_WEB_PORT) || 5173;
const basePath = process.env.BASE_PATH || "/";
const apiTarget =
  process.env.VITE_API_PROXY ||
  `http://localhost:${process.env.JARVIS_SERVER_PORT || 5050}`;
const workspaceRoot = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  base: basePath,
  envDir: workspaceRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@clerk/react",
        replacement: path.resolve(
          import.meta.dirname,
          "src/lib/desktop/clerkStub.tsx",
        ),
      },
      {
        find: "@clerk/themes",
        replacement: path.resolve(
          import.meta.dirname,
          "src/lib/desktop/clerkThemesStub.ts",
        ),
      },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
