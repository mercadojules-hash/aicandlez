import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import archiver from "archiver";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  const workspaceRoot = path.resolve(artifactDir, "../..");

  // ── natura-ai.zip ──────────────────────────────────────────────────────────
  const naturaAiDir = path.resolve(workspaceRoot, "artifacts/natura-ai");
  const naturaZipDest = path.resolve(distDir, "natura-ai.zip");
  await rm(naturaZipDest, { force: true });
  await new Promise((resolve, reject) => {
    const output = createWriteStream(naturaZipDest);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => {
      console.log(`✅ natura-ai.zip generated (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on("error", (err) => {
      console.error("❌ Failed to generate natura-ai.zip:", err.message);
      reject(err);
    });
    archive.pipe(output);
    archive.glob("**/*", {
      cwd: naturaAiDir,
      dot: true,
      ignore: ["node_modules/**", ".expo/**", "dist/**", ".git/**"],
    });
    archive.finalize();
  });

  // ── apex-trader-production.zip — full platform deployment bundle ───────────
  // Includes: all source, libs, configs, deployment docs, migrations, .env.example
  const prodZipDest = path.resolve(distDir, "apex-trader-production.zip");
  await rm(prodZipDest, { force: true });
  await new Promise((resolve, reject) => {
    const output = createWriteStream(prodZipDest);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => {
      console.log(`✅ apex-trader-production.zip generated (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on("error", (err) => {
      console.error("❌ Failed to generate apex-trader-production.zip:", err.message);
      reject(err);
    });
    archive.pipe(output);

    const ignore = [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      ".git/**",
      ".local/**",
      "**/.DS_Store",
      "**/*.log",
      "**/*.map",
      ".env",
      "attached_assets/**",
    ];

    // Monorepo root config files
    archive.glob("*.json",       { cwd: workspaceRoot, dot: true, ignore });
    archive.glob("*.toml",       { cwd: workspaceRoot, dot: true, ignore });
    archive.glob("*.yaml",       { cwd: workspaceRoot, dot: true, ignore });
    archive.glob("*.yml",        { cwd: workspaceRoot, dot: true, ignore });
    archive.glob("*.md",         { cwd: workspaceRoot, dot: true, ignore });
    archive.glob("tsconfig*",    { cwd: workspaceRoot, dot: true, ignore });
    archive.glob(".env.example", { cwd: workspaceRoot, dot: true });

    // API server (source + build config)
    archive.glob("artifacts/api-server/**/*", {
      cwd: workspaceRoot, dot: true,
      ignore: [...ignore, "artifacts/api-server/dist/**"],
    });

    // Dashboard (source + build config, not dist)
    archive.glob("artifacts/trading-dashboard/**/*", {
      cwd: workspaceRoot, dot: true,
      ignore: [...ignore, "artifacts/trading-dashboard/dist/**", "artifacts/trading-dashboard/public/*.zip"],
    });

    // Shared libraries
    archive.glob("lib/**/*", { cwd: workspaceRoot, dot: true, ignore });

    // Scripts (seeder, helpers)
    archive.glob("scripts/**/*", { cwd: workspaceRoot, dot: true, ignore });

    archive.finalize();
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
