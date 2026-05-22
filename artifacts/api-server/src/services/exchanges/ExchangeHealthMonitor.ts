/**
 * ExchangeHealthMonitor — preference-aware notification helper for
 * exchange connection state transitions (healthy ↔ unhealthy).
 *
 * Customers can mute outage alerts per channel from
 * Profile → Alert Preferences → Exchange Outage Notifications. Those
 * toggles persist as `exchange_outage_email_enabled` and
 * `exchange_outage_push_enabled` on `user_settings`. Default is ON for
 * both channels (matches pre-pref behaviour).
 *
 * Read those flags via {@link getOutageNotificationPrefs} and dispatch
 * via {@link notifyExchangeOutage}. Push is fanned out through the
 * existing {@link NotificationDispatcher}. Email transport is not yet
 * wired into this monorepo (no SMTP / Resend / SendGrid client); the
 * email path is a logger-backed stub that already honours the
 * preference, so when transport lands it only needs to swap the
 * `logger.info(...)` line.
 */

import { db, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { NotificationDispatcher } from "../notifications/NotificationDispatcher.js";

export interface OutageNotificationPrefs {
  email: boolean;
  push:  boolean;
}

export async function getOutageNotificationPrefs(userId: string): Promise<OutageNotificationPrefs> {
  try {
    const [row] = await db
      .select({
        email: userSettingsTable.exchangeOutageEmailEnabled,
        push:  userSettingsTable.exchangeOutagePushEnabled,
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    if (!row) return { email: true, push: true };
    return { email: row.email, push: row.push };
  } catch (err) {
    logger.warn({ err, userId }, "ExchangeHealthMonitor: outage prefs lookup failed, defaulting both ON");
    return { email: true, push: true };
  }
}

export interface ExchangeOutageEvent {
  userId:      string;
  exchange:    string;
  transition:  "healthy_to_unhealthy" | "unhealthy_to_healthy";
  reason?:     string;
  at?:         Date;
}

export async function notifyExchangeOutage(evt: ExchangeOutageEvent): Promise<void> {
  const prefs = await getOutageNotificationPrefs(evt.userId);

  const wentDown = evt.transition === "healthy_to_unhealthy";
  const title = wentDown
    ? `⚠️ ${evt.exchange} connection lost`
    : `✅ ${evt.exchange} connection restored`;
  const body  = wentDown
    ? `Live execution paused on ${evt.exchange}.${evt.reason ? ` Reason: ${evt.reason}.` : ""}`
    : `${evt.exchange} is healthy again. Live execution can resume.`;

  if (prefs.push) {
    try {
      await NotificationDispatcher.sendToUser(evt.userId, {
        title, body,
        notifType: "system",
        tag:       `exchange-outage-${evt.exchange}`,
        url:       "/aicandlez-app/profile",
        data:      { exchange: evt.exchange, transition: evt.transition, reason: evt.reason ?? null },
      });
    } catch (err) {
      logger.warn({ err, userId: evt.userId }, "ExchangeHealthMonitor: push dispatch failed");
    }
  } else {
    logger.debug({ userId: evt.userId, exchange: evt.exchange }, "ExchangeHealthMonitor: push suppressed by user pref");
  }

  if (prefs.email) {
    // TODO: route through the real email transport once it exists.
    logger.info(
      { userId: evt.userId, exchange: evt.exchange, transition: evt.transition, title },
      "ExchangeHealthMonitor: outage email queued",
    );
  } else {
    logger.debug({ userId: evt.userId, exchange: evt.exchange }, "ExchangeHealthMonitor: email suppressed by user pref");
  }
}

export const ExchangeHealthMonitor = {
  getOutageNotificationPrefs,
  notifyExchangeOutage,
};
