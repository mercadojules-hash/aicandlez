import { logger } from "./logger.js";

// ── Twilio SMS sender ─────────────────────────────────────────────────────────
// Reads credentials from env vars. If any are missing, logs and skips silently.
// Format sent: "EXECUTED: BTCUSD BUY @ $80061.50"
//
// Required env vars:
//   TWILIO_ACCOUNT_SID  — Twilio account SID (ACxxxxxxxx)
//   TWILIO_AUTH_TOKEN   — Twilio auth token
//   TWILIO_FROM         — Twilio-purchased "From" phone number (+1xxxxxxxxxx)
//   TWILIO_TO           — Recipient phone number (+1xxxxxxxxxx)

function twilioConfigured(): { accountSid: string; authToken: string; from: string; to: string } | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken  = process.env["TWILIO_AUTH_TOKEN"];
  const from       = process.env["TWILIO_FROM"];
  const to         = process.env["TWILIO_TO"];
  if (!accountSid || !authToken || !from || !to) return null;
  return { accountSid, authToken, from, to };
}

export async function sendTradeExecutedSMS(
  symbol: string,
  side:   "BUY" | "SELL",
  price:  number,
): Promise<void> {
  const cfg = twilioConfigured();

  const body = `EXECUTED: ${symbol} ${side} @ $${price.toFixed(2)}`;

  if (!cfg) {
    logger.info({ symbol, side, price, body }, "SMS skipped — Twilio env vars not configured");
    return;
  }

  try {
    const url  = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
    const cred = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");

    const params = new URLSearchParams();
    params.set("From", cfg.from);
    params.set("To",   cfg.to);
    params.set("Body", body);

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Basic ${cred}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (res.ok) {
      const data = await res.json() as { sid?: string };
      logger.info({ symbol, side, price, sid: data.sid, body }, "SMS sent: trade executed");
    } else {
      const text = await res.text();
      logger.warn({ symbol, side, price, status: res.status, text }, "SMS failed — Twilio API error");
    }
  } catch (err) {
    logger.warn({ symbol, side, price, err }, "SMS failed — network error");
  }
}

// ── Operator alert channel ────────────────────────────────────────────────────
// Operator-visible incidents (back-fill scheduler failures, exchange outages
// once that path is wired in) flow through `sendOperatorAlert`. In production
// we want an actual email to land in the on-call inbox the moment something
// blows up off-hours — relying on someone happening to open the admin console
// is not a notification strategy.
//
// Transport: Resend HTTP API (no extra dep — just `fetch`).
//
// Required env vars to actually deliver email:
//   RESEND_API_KEY            — Resend API key (re_...)
//   OPERATOR_ALERT_EMAIL_FROM — verified sender (e.g. "alerts@aicandlez.com")
//   OPERATOR_ALERT_EMAIL_TO   — comma-separated recipient list
//
// If any of the three are missing we fall back to the previous
// logger-only behaviour so dev / preview environments stay quiet and
// no boot-time crash is introduced. The structured "operator-alert
// queued" log line is always emitted regardless of transport result
// so the alert is observable in log aggregators even when email
// delivery itself fails.

export interface OperatorAlertPayload {
  subject:  string;
  body:     string;
  /** Stable key used by callers to throttle / de-dupe repeat alerts. */
  dedupeKey: string;
  context?: Record<string, unknown>;
}

interface OperatorEmailConfig {
  apiKey: string;
  from:   string;
  to:     string[];
}

/**
 * Public, side-effect-free check for whether the operator email transport
 * is fully configured. Used by the admin telemetry endpoint so the
 * operator console can render a green/red "Operator email" pill without
 * having to send a real email. Returns only a boolean — never leaks any
 * env var values.
 */
export function isOperatorEmailConfigured(): boolean {
  return operatorEmailConfigured() !== null;
}

function operatorEmailConfigured(): OperatorEmailConfig | null {
  const apiKey = process.env["RESEND_API_KEY"];
  const from   = process.env["OPERATOR_ALERT_EMAIL_FROM"];
  const toRaw  = process.env["OPERATOR_ALERT_EMAIL_TO"];
  if (!apiKey || !from || !toRaw) return null;
  const to = toRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (to.length === 0) return null;
  return { apiKey, from, to };
}

async function deliverOperatorEmail(
  cfg:     OperatorEmailConfig,
  payload: OperatorAlertPayload,
): Promise<{ ok: boolean; status?: number; id?: string; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    cfg.from,
        to:      cfg.to,
        subject: payload.subject,
        text:    payload.body,
        headers: {
          // Lets receiving MTAs collapse retried pages on the same
          // signature (e.g. the same persistent back-fill failure
          // re-paged after the 7-day escalation window) into a
          // single thread instead of N separate inbox items.
          "X-Entity-Ref-ID": payload.dedupeKey,
        },
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as { id?: string };
      return { ok: true, status: res.status, id: data.id };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendOperatorAlert(payload: OperatorAlertPayload): Promise<void> {
  // Always log first so the alert is captured even if email delivery
  // fails or the transport is intentionally not configured.
  logger.info(
    {
      subject:   payload.subject,
      body:      payload.body,
      dedupeKey: payload.dedupeKey,
      ...(payload.context ?? {}),
    },
    "operator-alert queued",
  );

  const cfg = operatorEmailConfigured();
  if (!cfg) {
    logger.debug(
      { dedupeKey: payload.dedupeKey },
      "operator-alert email skipped — RESEND_API_KEY / OPERATOR_ALERT_EMAIL_FROM / OPERATOR_ALERT_EMAIL_TO not all set",
    );
    return;
  }

  const result = await deliverOperatorEmail(cfg, payload);
  if (result.ok) {
    logger.info(
      { dedupeKey: payload.dedupeKey, id: result.id, recipients: cfg.to.length },
      "operator-alert email delivered",
    );
  } else {
    // Don't throw — the caller's structured log + the "queued" line above
    // remain the source of truth. Surface delivery failure at warn so it
    // shows up alongside other transport problems without masking the
    // underlying incident the alert was about.
    logger.warn(
      { dedupeKey: payload.dedupeKey, status: result.status, error: result.error },
      "operator-alert email delivery FAILED",
    );
  }
}
