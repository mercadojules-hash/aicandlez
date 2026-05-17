import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";
import { WebhookHandlers } from "./webhookHandlers.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

// ── Production-safe CORS ───────────────────────────────────────────────────────
// In production: only allow known origins (custom domains + Replit previews).
// In development: allow all origins for ease of local use.

function buildAllowedOrigins(): string[] {
  const origins: string[] = [
    // Production custom domains
    "https://aicandlez.com",
    "https://www.aicandlez.com",
    "https://app.aicandlez.com",
    "https://api.aicandlez.com",
  ];

  // Replit preview domains (dev + staging — REPLIT_DOMAINS is comma-separated)
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    replitDomains.split(",").forEach((d) => origins.push(`https://${d.trim()}`));
  }

  // Local development origins
  if (process.env["NODE_ENV"] !== "production") {
    origins.push(
      "http://localhost:80",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
    );
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    // Allow requests with no Origin header (mobile apps, health probes, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, be permissive so local tooling works
    if (process.env["NODE_ENV"] !== "production") return callback(null, true);
    logger.warn({ origin }, "CORS: blocked disallowed origin");
    callback(new Error(`CORS: origin ${origin} not allowed`), false);
  },
};

// ── Rate limiters ─────────────────────────────────────────────────────────────

// General API: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         (_req, res) => res.status(429).json({ error: "Too many requests. Please slow down." }),
  skip:            (req) => req.path.startsWith("/api/stripe/webhook"),
});

// Sensitive routes: 20 requests per minute per IP (auth, billing)
const strictLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         (_req, res) => res.status(429).json({ error: "Rate limit exceeded on sensitive endpoint." }),
});

// ── App ───────────────────────────────────────────────────────────────────────

const app: Express = express();

// Trust proxy headers from Railway/Render/Replit reverse proxies
app.set("trust proxy", 1);

// ── Helmet (security headers) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by the frontend separately
    crossOriginEmbedderPolicy: false, // Allows cross-origin iframes (charts, widgets)
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id:     req.id,
          method: req.method,
          url:    req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk proxy MUST be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors(corsOptions));

// ── Stripe webhook — MUST be before express.json() ───────────────────────────
// Stripe requires the raw Buffer body for signature verification.

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    if (!Buffer.isBuffer(req.body)) {
      logger.error("Stripe webhook: req.body is not a Buffer — express.json() ran first");
      res.status(500).json({ error: "Webhook configuration error" });
      return;
    }

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

// ── Body parsers (after webhook) ──────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Clerk session middleware — resolves publishable key per-host for multi-domain
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Rate limiting — applied after middleware, before routes
app.use("/api",                  apiLimiter);
app.use("/api/billing/checkout", strictLimiter);
app.use("/api/billing/portal",   strictLimiter);
app.use("/api/auth",             strictLimiter);

app.use("/api", router);

export default app;
