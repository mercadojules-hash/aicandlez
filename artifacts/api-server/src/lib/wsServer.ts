import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyToken } from "@clerk/backend";
import { logger } from "./logger.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";

// ── Client registry ───────────────────────────────────────────────────────────

interface WsClient {
  ws:            WebSocket;
  userId:        string;
  subscriptions: Set<string>;
  isAlive:       boolean;
  connectedAt:   number;
}

const clients = new Map<WebSocket, WsClient>();

// ── Message types ─────────────────────────────────────────────────────────────

export type WsEventType =
  | "connected"
  | "pong"
  | "market_data"
  | "signal"
  | "trade_executed"
  | "position_update"
  | "portfolio_update"
  | "scanner_update"
  | "notification"
  | "system_status"
  | "error";

function send(ws: WebSocket, type: WsEventType, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, timestamp: Date.now(), ...payload }));
  } catch {
    // client disconnected mid-send — ignore
  }
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authenticateToken(token: string): Promise<string | null> {
  const secretKey = process.env["CLERK_SECRET_KEY"];
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — WS auth will fail in production");
    return null;
  }
  try {
    const payload = await verifyToken(token, { secretKey });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ── Server factory ────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;

export function createWsServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    void handleConnection(ws, req);
  });

  // Heartbeat — terminate dead connections every 30 s
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.isAlive) {
        const uptimeMs = Date.now() - client.connectedAt;
        clients.delete(ws);
        ws.terminate();
        logger.info(
          {
            tag:                 "WS_DISCONNECTED",
            subtag:              "heartbeat_timeout",
            userId:              client.userId,
            uptimeMs,
            activeSubscriptions: [...client.subscriptions],
            totalClients:        clients.size,
          },
          "[WS_DISCONNECTED] heartbeat timeout — terminated",
        );
        continue;
      }
      client.isAlive = false;
      try { ws.ping(); } catch { clients.delete(ws); }
    }
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeat));

  logger.info("WebSocket server initialised on path /ws");
  return wss;
}

async function handleConnection(ws: WebSocket, req: InstanceType<typeof import("http").IncomingMessage>): Promise<void> {
  // Extract token from ?token= query param (mobile) or Authorization header (web)
  const rawUrl = req.url ?? "";
  let token: string | null = null;

  try {
    const url = new URL(rawUrl, "http://localhost");
    token = url.searchParams.get("token");
  } catch { /* ignore */ }

  if (!token) {
    const authHeader = req.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  // Origin captured for instrumentation only — surfaces whether the
  // failing handshake is coming from app./trade./admintrade. so we can
  // tell cross-origin proxy misroutes apart from genuine auth failures.
  const origin    = (req.headers["origin"] as string | undefined) ?? null;
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

  if (!token) {
    logger.warn(
      { tag: "WS_AUTH_REJECTED", reason: "missing_token", origin, userAgent, totalClients: clients.size },
      "[WS_AUTH_REJECTED] handshake rejected — missing token",
    );
    ws.close(4001, "Unauthorized: missing token");
    return;
  }

  const userId = await authenticateToken(token);
  if (!userId) {
    logger.warn(
      { tag: "WS_AUTH_REJECTED", reason: "invalid_token", origin, userAgent, totalClients: clients.size },
      "[WS_AUTH_REJECTED] handshake rejected — invalid token",
    );
    ws.close(4003, "Unauthorized: invalid token");
    return;
  }

  const connectedAt = Date.now();
  const client: WsClient = {
    ws,
    userId,
    // Default subscriptions — client can change these after connect
    subscriptions: new Set(["BTCUSD", "ETHUSD", "SOLUSD"]),
    isAlive: true,
    connectedAt,
  };
  clients.set(ws, client);

  send(ws, "connected", { userId, subscriptions: [...client.subscriptions] });
  logger.info(
    {
      tag:                 "WS_CONNECTED",
      userId,
      origin,
      activeSubscriptions: [...client.subscriptions],
      totalClients:        clients.size,
      connectedAt,
    },
    "[WS_CONNECTED] client established",
  );

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; symbols?: string[] };
      if (msg.type === "subscribe" && Array.isArray(msg.symbols)) {
        const added: string[] = [];
        msg.symbols.forEach((s) => {
          const sym = String(s).toUpperCase();
          if (!client.subscriptions.has(sym)) added.push(sym);
          client.subscriptions.add(sym);
        });
        logger.info(
          {
            tag:                 "WS_SUBSCRIBED",
            userId,
            added,
            activeSubscriptions: [...client.subscriptions],
            uptimeMs:            Date.now() - client.connectedAt,
          },
          "[WS_SUBSCRIBED] client added subscriptions",
        );
      } else if (msg.type === "unsubscribe" && Array.isArray(msg.symbols)) {
        const removed: string[] = [];
        msg.symbols.forEach((s) => {
          const sym = String(s).toUpperCase();
          if (client.subscriptions.delete(sym)) removed.push(sym);
        });
        logger.info(
          {
            tag:                 "WS_SUBSCRIBED",
            subtag:              "unsubscribe",
            userId,
            removed,
            activeSubscriptions: [...client.subscriptions],
            uptimeMs:            Date.now() - client.connectedAt,
          },
          "[WS_SUBSCRIBED] client removed subscriptions",
        );
      } else if (msg.type === "ping") {
        send(ws, "pong", {});
      }
    } catch { /* ignore malformed messages */ }
  });

  ws.on("pong", () => { client.isAlive = true; });

  ws.on("close", (code, reason) => {
    const uptimeMs = Date.now() - client.connectedAt;
    clients.delete(ws);
    logger.info(
      {
        tag:                 "WS_DISCONNECTED",
        subtag:              "client_close",
        userId,
        code,
        reason:              reason?.toString() || null,
        uptimeMs,
        activeSubscriptions: [...client.subscriptions],
        totalClients:        clients.size,
      },
      "[WS_DISCONNECTED] client closed connection",
    );
  });

  ws.on("error", (err) => {
    const uptimeMs = Date.now() - client.connectedAt;
    logger.error(
      {
        tag:          "WS_DISCONNECTED",
        subtag:       "socket_error",
        userId,
        err,
        uptimeMs,
        totalClients: clients.size,
      },
      "[WS_DISCONNECTED] socket error",
    );
    clients.delete(ws);
  });
}

// ── Broadcast helpers (called by trading loop / sim engine) ───────────────────

export function broadcastMarketData(
  symbol: string,
  data: { price: number; volume: number; timestamp?: number },
): void {
  if (clients.size === 0) return;
  const sym = symbol.toUpperCase();
  const msg = JSON.stringify({ type: "market_data", symbol: sym, ...data, timestamp: data.timestamp ?? Date.now() });
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.subscriptions.has(sym)) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
}

export function broadcastSignal(signal: {
  symbol:     string;
  action:     string;
  confidence: number;
  reason?:    string;
}): void {
  if (clients.size === 0) return;
  const msg = JSON.stringify({ type: "signal", ...signal, timestamp: Date.now() });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
}

export function broadcastTrade(trade: {
  symbol:  string;
  side:    string;
  price:   number;
  sizeUSD: number;
  userId?: string;
}): void {
  // Hydration-chain instrumentation: every executed trade SHOULD push a
  // `trade_executed` event to the relevant user's WS, which the client
  // is expected to translate into invalidateQueries(["mobile-portfolio",
  // "sim-account", "sim-trades"]). When totalClients=0 (or recipients=0
  // for a userId-scoped event), the push is SILENTLY dropped and the
  // panels go stale until their poll interval lapses (10–60s).
  if (clients.size === 0) {
    logger.warn(
      {
        tag:          "WS_HYDRATE_INVALIDATE",
        subtag:       "skipped_no_clients",
        eventType:    "trade_executed",
        targetUserId: trade.userId ?? null,
        symbol:       trade.symbol,
        invalidateKeysHint: ["mobile-portfolio", "sim-account", "sim-trades"],
      },
      "[WS_HYDRATE_INVALIDATE] trade_executed push skipped — no WS clients connected (panels will go stale)",
    );
    return;
  }
  const msg = JSON.stringify({ type: "trade_executed", ...trade, timestamp: Date.now() });
  let recipients = 0;
  for (const [ws, client] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    // User-scoped trades → send only to that user; global broadcasts → send to all
    if (!trade.userId || client.userId === trade.userId) {
      try { ws.send(msg); recipients++; } catch { clients.delete(ws); }
    }
  }
  logger.info(
    {
      tag:          "WS_HYDRATE_INVALIDATE",
      eventType:    "trade_executed",
      targetUserId: trade.userId ?? null,
      symbol:       trade.symbol,
      recipients,
      totalClients: clients.size,
      invalidateKeysHint: ["mobile-portfolio", "sim-account", "sim-trades"],
    },
    recipients === 0
      ? "[WS_HYDRATE_INVALIDATE] trade_executed published but 0 recipients matched targetUserId (panels will go stale)"
      : "[WS_HYDRATE_INVALIDATE] trade_executed published",
  );
}

export function broadcastSystemStatus(status: {
  killSwitch: boolean;
  autoMode:   boolean;
  uptime:     number;
}): void {
  if (clients.size === 0) return;
  const msg = JSON.stringify({ type: "system_status", ...status, timestamp: Date.now() });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
}

export function broadcastNotification(
  userId: string,
  notification: {
    notifType: string;
    title:     string;
    message:   string;
    data?:     Record<string, unknown>;
  },
): void {
  const msg = JSON.stringify({
    type:      "notification",
    notifType: notification.notifType,
    title:     notification.title,
    message:   notification.message,
    data:      notification.data ?? null,
    timestamp: Date.now(),
  });

  let deliveredViaWs = false;
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.userId === userId) {
      try { ws.send(msg); deliveredViaWs = true; } catch { clients.delete(ws); }
    }
  }

  // User is offline — send push notification as fallback
  if (!deliveredViaWs) {
    NotificationDispatcher.sendToUser(userId, {
      title:     notification.title,
      body:      notification.message,
      notifType: notification.notifType as "signal" | "trade" | "risk" | "system" | "general",
      data:      notification.data,
    }).catch((err) => logger.warn({ err, userId }, "wsServer: offline push fallback failed"));
  }
}

export function broadcastToUser(
  userId:  string,
  type:    WsEventType,
  payload: Record<string, unknown>,
): void {
  if (clients.size === 0) {
    logger.warn(
      {
        tag:          "WS_HYDRATE_INVALIDATE",
        subtag:       "skipped_no_clients",
        eventType:    type,
        targetUserId: userId,
      },
      "[WS_HYDRATE_INVALIDATE] user-scoped push skipped — no WS clients connected",
    );
    return;
  }
  const msg = JSON.stringify({ type, ...payload, timestamp: Date.now() });
  let recipients = 0;
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.userId === userId) {
      try { ws.send(msg); recipients++; } catch { clients.delete(ws); }
    }
  }
  if (recipients === 0) {
    logger.warn(
      {
        tag:          "WS_HYDRATE_INVALIDATE",
        subtag:       "no_matching_user",
        eventType:    type,
        targetUserId: userId,
        totalClients: clients.size,
      },
      "[WS_HYDRATE_INVALIDATE] user-scoped push published but 0 recipients matched targetUserId",
    );
  }
}

export function getConnectedUserIds(): string[] {
  return Array.from(clients.values()).map((c) => c.userId);
}

export function getWsStats(): { connected: number } {
  return { connected: clients.size };
}
