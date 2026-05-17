import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyToken } from "@clerk/backend";
import { logger } from "./logger.js";

// ── Client registry ───────────────────────────────────────────────────────────

interface WsClient {
  ws:            WebSocket;
  userId:        string;
  subscriptions: Set<string>;
  isAlive:       boolean;
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
        clients.delete(ws);
        ws.terminate();
        logger.info({ userId: client.userId }, "WS client timed out — terminated");
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

  if (!token) {
    ws.close(4001, "Unauthorized: missing token");
    return;
  }

  const userId = await authenticateToken(token);
  if (!userId) {
    ws.close(4003, "Unauthorized: invalid token");
    return;
  }

  const client: WsClient = {
    ws,
    userId,
    // Default subscriptions — client can change these after connect
    subscriptions: new Set(["BTCUSD", "ETHUSD", "SOLUSD"]),
    isAlive: true,
  };
  clients.set(ws, client);

  send(ws, "connected", { userId, subscriptions: [...client.subscriptions] });
  logger.info({ userId, total: clients.size }, "WS client connected");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; symbols?: string[] };
      if (msg.type === "subscribe" && Array.isArray(msg.symbols)) {
        msg.symbols.forEach((s) => client.subscriptions.add(String(s).toUpperCase()));
      } else if (msg.type === "unsubscribe" && Array.isArray(msg.symbols)) {
        msg.symbols.forEach((s) => client.subscriptions.delete(String(s).toUpperCase()));
      } else if (msg.type === "ping") {
        send(ws, "pong", {});
      }
    } catch { /* ignore malformed messages */ }
  });

  ws.on("pong", () => { client.isAlive = true; });

  ws.on("close", () => {
    clients.delete(ws);
    logger.info({ userId, total: clients.size }, "WS client disconnected");
  });

  ws.on("error", (err) => {
    logger.error({ err, userId }, "WS client error");
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
  if (clients.size === 0) return;
  const msg = JSON.stringify({ type: "trade_executed", ...trade, timestamp: Date.now() });
  for (const [ws, client] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    // User-scoped trades → send only to that user; global broadcasts → send to all
    if (!trade.userId || client.userId === trade.userId) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
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
  if (clients.size === 0) return;
  const msg = JSON.stringify({
    type:      "notification",
    notifType: notification.notifType,
    title:     notification.title,
    message:   notification.message,
    data:      notification.data ?? null,
    timestamp: Date.now(),
  });
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.userId === userId) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
}

export function broadcastToUser(
  userId:  string,
  type:    WsEventType,
  payload: Record<string, unknown>,
): void {
  if (clients.size === 0) return;
  const msg = JSON.stringify({ type, ...payload, timestamp: Date.now() });
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.userId === userId) {
      try { ws.send(msg); } catch { clients.delete(ws); }
    }
  }
}

export function getConnectedUserIds(): string[] {
  return Array.from(clients.values()).map((c) => c.userId);
}

export function getWsStats(): { connected: number } {
  return { connected: clients.size };
}
