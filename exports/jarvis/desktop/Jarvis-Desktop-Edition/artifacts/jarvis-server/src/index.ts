// ─────────────────────────────────────────────────────────────────────────────
// Jarvis Desktop Edition — lean Express bootstrap.
// Mounts ONLY the Jarvis route surface + a local desktop identity endpoint.
// No Clerk, no AICandlez trading/Stripe/exchange code. Single local super-admin.
// ─────────────────────────────────────────────────────────────────────────────
import { resolve } from "node:path";
import dotenv from "dotenv";

// Load .env from the package dir AND the workspace root (root wins is irrelevant —
// dotenv never overrides already-set vars). Missing files are silently ignored.
dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(import.meta.dirname, "..", "..", "..", ".env") });

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import jarvisRouter from "./routes/jarvis.js";
import { authMeRouter } from "./routes/authMe.js";

const PORT =
  Number(process.env.JARVIS_SERVER_PORT) ||
  Number(process.env.PORT) ||
  5050;

// Desktop edition authorizes every request as the single local super-admin
// (see middlewares/requireAuth.ts). That is only safe on loopback, so we bind to
// 127.0.0.1 and restrict CORS to local origins by default. Exposing this to a
// LAN must be an explicit, deliberate opt-in via JARVIS_BIND_HOST=0.0.0.0.
const BIND_HOST = process.env.JARVIS_BIND_HOST?.trim() || "127.0.0.1";

// Allow the configured web dev port (default 5173) on both localhost hostnames.
const WEB_PORT = Number(process.env.JARVIS_WEB_PORT) || 5173;
const DEFAULT_LOCAL_ORIGINS = [
  `http://localhost:${WEB_PORT}`,
  `http://127.0.0.1:${WEB_PORT}`,
];
// Optional extra origins (comma-separated) for users who front the app
// differently; only honored when explicitly set.
const EXTRA_ORIGINS = (process.env.JARVIS_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([...DEFAULT_LOCAL_ORIGINS, ...EXTRA_ORIGINS]);

function main(): void {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }),
  );
  app.use(
    cors({
      // Same-origin / curl requests have no Origin header — always allow those.
      // Browser cross-origin requests are restricted to the local allow-list so
      // a stray LAN page can't drive the super-admin API.
      origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
        cb(new Error("origin_not_allowed"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  app.get("/api/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "jarvis-desktop", ts: Date.now() });
  });

  app.use("/api", authMeRouter);
  app.use("/api", jarvisRouter);

  // JSON 404 for unknown /api routes so the frontend's ApiContractError guard
  // never trips on an HTML fallback.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use(
    (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
      req.log?.error({ err }, "unhandled error");
      if (res.headersSent) return;
      res.status(500).json({ error: "internal_error" });
    },
  );

  app.listen(PORT, BIND_HOST, () => {
    logger.info(
      { port: PORT, host: BIND_HOST },
      "Jarvis Desktop backend listening",
    );
  });
}

main();
