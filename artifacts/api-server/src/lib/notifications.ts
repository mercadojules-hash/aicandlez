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
// Same logger-backed transport the exchange-outage emails ride on
// (`ExchangeHealthMonitor.notifyExchangeOutage` → `outage email queued`).
// When a real SMTP/Resend/SendGrid client lands, both this and the
// outage email stub should swap the `logger.info(...)` for the real
// transport call so operators get a single unified channel.

export interface OperatorAlertPayload {
  subject:  string;
  body:     string;
  /** Stable key used by callers to throttle / de-dupe repeat alerts. */
  dedupeKey: string;
  context?: Record<string, unknown>;
}

export async function sendOperatorAlert(payload: OperatorAlertPayload): Promise<void> {
  logger.info(
    {
      subject:   payload.subject,
      body:      payload.body,
      dedupeKey: payload.dedupeKey,
      ...(payload.context ?? {}),
    },
    "operator-alert queued",
  );
}
