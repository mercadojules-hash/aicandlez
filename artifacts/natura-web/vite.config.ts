import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: "serve-zip-download",
      configureServer(server) {
        const zips: Record<string, string> = {
          "/natura-ai.zip": path.resolve(import.meta.dirname, "public/natura-ai.zip"),
          "/natura-yoga-ai-v1.0.0.zip": path.resolve(import.meta.dirname, "public/natura-yoga-ai-v1.0.0.zip"),
          "/natura-yoga-ai-v1.0.0-v2.zip": path.resolve(import.meta.dirname, "public/natura-yoga-ai-v1.0.0-v2.zip"),
        };
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url?.split("?")[0] ?? "";
          const matched = Object.keys(zips).find((k) => urlPath.endsWith(k));
          if (matched) {
            const filePath = zips[matched];
            const filename = path.basename(filePath);
            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Length", String(fs.statSync(filePath).size));
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
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
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
    fs: {
      strict: true,
      allow: [
        path.resolve(import.meta.dirname),
        path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      ],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
