/**
 * NotificationDispatcher — sends push notifications to all registered devices
 * for a given user. Supports Web Push (VAPID) and Expo push tokens.
 *
 * VAPID env vars required:
 *   VAPID_PUBLIC_KEY   — base64url public key
 *   VAPID_PRIVATE_KEY  — base64url private key
 *   VAPID_SUBJECT      — mailto: or https: URI (default: mailto:hello@aicandlez.com)
 *
 * Generate keys:
 *   node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
 */

import webpush from "web-push";
import { db } from "@workspace/db";
import { userPushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

// ── VAPID configuration ───────────────────────────────────────────────────────

const VAPID_PUBLIC  = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"];
const VAPID_SUBJECT = process.env["VAPID_SUBJECT"] ?? "mailto:hello@aicandlez.com";

let vapidConfigured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidConfigured = true;
    logger.info("NotificationDispatcher: VAPID keys loaded");
  } catch (err) {
    logger.error({ err }, "NotificationDispatcher: invalid VAPID keys");
  }
} else {
  logger.warn("NotificationDispatcher: VAPID keys not configured — web push disabled");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title:       string;
  body:        string;
  notifType?:  "signal" | "trade" | "risk" | "system" | "general";
  url?:        string;
  tag?:        string;
  data?:       Record<string, unknown>;
}

interface DispatchResult {
  userId:       string;
  sent:         number;
  failed:       number;
  cleaned:      number;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export const NotificationDispatcher = {

  /**
   * Send a push notification to all registered devices for a single user.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<DispatchResult> {
    const result: DispatchResult = { userId, sent: 0, failed: 0, cleaned: 0 };

    let tokens;
    try {
      tokens = await db
        .select()
        .from(userPushTokensTable)
        .where(eq(userPushTokensTable.userId, userId));
    } catch (err) {
      logger.error({ err, userId }, "NotificationDispatcher: DB fetch failed");
      return result;
    }

    if (tokens.length === 0) return result;

    const webPayload = JSON.stringify({
      title:      payload.title,
      body:       payload.body,
      notifType:  payload.notifType ?? "general",
      url:        payload.url       ?? "/apex-trader-app/",
      tag:        payload.tag       ?? "aicandlez-alert",
      data:       payload.data      ?? {},
    });

    await Promise.allSettled(
      tokens.map(async (row) => {
        if (row.platform === "web") {
          if (!vapidConfigured) return;
          try {
            const sub = JSON.parse(row.token) as webpush.PushSubscription;
            await webpush.sendNotification(sub, webPayload, {
              TTL:     3600,         // 1-hour message lifetime
              urgency: payload.notifType === "risk" ? "high" : "normal",
              topic:   payload.tag ?? "aicandlez",
            });
            result.sent++;
          } catch (err: unknown) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 410 || code === 404) {
              // Subscription expired — remove it
              await db.delete(userPushTokensTable).where(eq(userPushTokensTable.id, row.id)).catch(() => {});
              result.cleaned++;
              logger.info({ userId, id: row.id }, "NotificationDispatcher: removed expired subscription");
            } else {
              result.failed++;
              logger.warn({ err, userId, platform: "web" }, "NotificationDispatcher: web push failed");
            }
          }
        } else if (row.platform === "expo") {
          // Expo Push API — https://exp.host/--/api/v2/push/send
          try {
            const expoResp = await fetch("https://exp.host/--/api/v2/push/send", {
              method:  "POST",
              headers: {
                Accept:           "application/json",
                "Accept-Encoding": "gzip, deflate",
                "Content-Type":   "application/json",
              },
              body: JSON.stringify({
                to:        row.token,
                title:     payload.title,
                body:      payload.body,
                data:      { ...payload.data, notifType: payload.notifType, url: payload.url },
                sound:     payload.notifType === "risk" ? { critical: true, volume: 1.0, name: "default" } : "default",
                priority:  payload.notifType === "risk" ? "high" : "normal",
                channelId: payload.notifType ?? "default",
              }),
            });
            if (expoResp.ok) {
              result.sent++;
              logger.debug({ userId, tokenId: row.id }, "NotificationDispatcher: Expo push sent");
            } else {
              result.failed++;
              logger.warn({ userId, status: expoResp.status }, "NotificationDispatcher: Expo push rejected");
            }
          } catch (err) {
            result.failed++;
            logger.warn({ err, userId }, "NotificationDispatcher: Expo push failed");
          }
        }
      }),
    );

    if (result.sent > 0 || result.failed > 0) {
      logger.info(result, "NotificationDispatcher: dispatch complete");
    }

    return result;
  },

  /**
   * Broadcast a push notification to all users who have registered tokens.
   */
  async broadcastToAll(payload: PushPayload): Promise<void> {
    let rows;
    try {
      rows = await db
        .select({ userId: userPushTokensTable.userId })
        .from(userPushTokensTable);
    } catch (err) {
      logger.error({ err }, "NotificationDispatcher: broadcastToAll DB fetch failed");
      return;
    }
    const userIds = [...new Set(rows.map((r) => r.userId))];
    await Promise.allSettled(userIds.map((uid) => this.sendToUser(uid, payload)));
    logger.info({ count: userIds.length }, "NotificationDispatcher: broadcast complete");
  },

  /**
   * Quick helper — fire-and-forget signal alert to a user.
   */
  async signalAlert(userId: string, opts: {
    symbol:     string;
    direction:  "BUY" | "SELL";
    confidence: number;
    price:      string;
  }): Promise<void> {
    const emoji = opts.direction === "BUY" ? "🟢" : "🔴";
    await this.sendToUser(userId, {
      title:     `${emoji} ${opts.direction} Signal — ${opts.symbol}`,
      body:      `Confidence ${opts.confidence}% @ ${opts.price}`,
      notifType: "signal",
      tag:       `signal-${opts.symbol}`,
      url:       "/apex-trader-app/",
      data:      { ...opts },
    });
  },

  /**
   * Quick helper — fire-and-forget trade execution alert.
   */
  async tradeAlert(userId: string, opts: {
    symbol:    string;
    side:      "buy" | "sell";
    qty:       string;
    price:     string;
    pnl?:      string;
  }): Promise<void> {
    const emoji = opts.side === "buy" ? "⬆️" : "⬇️";
    const pnlStr = opts.pnl ? ` · PnL ${opts.pnl}` : "";
    await this.sendToUser(userId, {
      title:     `${emoji} Trade Executed — ${opts.symbol}`,
      body:      `${opts.side.toUpperCase()} ${opts.qty} @ ${opts.price}${pnlStr}`,
      notifType: "trade",
      tag:       `trade-${opts.symbol}`,
      url:       "/apex-trader-app/trade",
      data:      { ...opts },
    });
  },
};
