import { Router, type IRouter } from "express";
import { EXCHANGE_CATALOG } from "../services/exchanges/catalog.js";

// ── Exchange Catalog (public read) ────────────────────────────────────────────
//
// Single source of truth for "what exchanges does this platform support".
// Used by:
//   • PortalExchangeConnectModal (customer + admin)
//   • aicandlez-app PWA exchange surfaces (forthcoming R2)
//   • admin telemetry / CRM exchange columns (R4 / CRM A)
//
// No auth required — catalog is product metadata, not user data. Connection
// state lives at /api/user/exchanges (auth-gated) and is joined client-side.

const router: IRouter = Router();

router.get("/exchanges/catalog", (_req, res) => {
  res.json({ exchanges: EXCHANGE_CATALOG });
});

export default router;
