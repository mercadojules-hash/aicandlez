import express, { type Express } from "express";
import cors from "cors";
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

// ── Rate limiters ─────────────────────────────────────────────────────────────

// General API: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              300,
  standardHeaders:  true,
  legacyHeaders:    false,
  handler:          (_req, res) => res.status(429).json({ error: "Too many requests. Please slow down." }),
  skip:             (req) => req.path.startsWith("/api/stripe/webhook"),
});

// Sensitive routes: 20 requests per minute per IP (auth, billing checkout)
const strictLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  handler:          (_req, res) => res.status(429).json({ error: "Rate limit exceeded on sensitive endpoint." }),
});

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy MUST be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));

// ── Stripe webhook — MUST be before express.json() ───────────────────────────
// Stripe requires the raw Buffer body for signature verification.
// express.json() would parse it into an object first, breaking verification.

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

// Clerk session middleware — resolves publishable key per-host for multi-domain support
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Rate limiting — applied after middleware, before routes
app.use("/api", apiLimiter);
app.use("/api/billing/checkout", strictLimiter);
app.use("/api/billing/portal",   strictLimiter);
app.use("/api/auth",             strictLimiter);

app.use("/api", router);

export default app;
