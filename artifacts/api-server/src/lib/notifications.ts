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

async function sendTwilioSms(
  cfg:  { accountSid: string; authToken: string; from: string; to: string },
  body: string,
): Promise<{ ok: boolean; status?: number; sid?: string; error?: string }> {
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
      const data = await res.json().catch(() => ({})) as { sid?: string };
      return { ok: true, status: res.status, sid: data.sid };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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

  const result = await sendTwilioSms(cfg, body);
  if (result.ok) {
    logger.info({ symbol, side, price, sid: result.sid, body }, "SMS sent: trade executed");
  } else {
    logger.warn({ symbol, side, price, status: result.status, error: result.error }, "SMS failed — Twilio API error");
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

// ── Last-success tracking + SMS fallback ──────────────────────────────────────
// `lastOperatorEmailSuccessAt` is updated only when Resend returns a 2xx for an
// actual operator alert (or for the explicit health probe). Surfaced through
// the admin telemetry endpoint so the operator console can render
// "last delivered Xm ago" alongside the existing CONFIGURED pill.
let lastOperatorEmailSuccessAt: number | null = null;

export function getLastOperatorEmailSuccessAt(): number | null {
  return lastOperatorEmailSuccessAt;
}

// SMS fallback throttling — when the email transport is broken we don't want to
// hammer the on-call phone with one SMS per failed alert. Throttle per
// dedupeKey so distinct failure modes still page independently.
const SMS_FALLBACK_THROTTLE_MS = 60 * 60 * 1000; // 1 h per key
const smsFallbackLastSentAt = new Map<string, number>();

async function pageOperatorViaSms(reason: string, dedupeKey: string): Promise<void> {
  const cfg = twilioConfigured();
  if (!cfg) {
    logger.warn(
      { reason, dedupeKey },
      "operator-email SMS fallback skipped — TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM/TO not all set",
    );
    return;
  }
  const now  = Date.now();
  const last = smsFallbackLastSentAt.get(dedupeKey);
  if (last && now - last < SMS_FALLBACK_THROTTLE_MS) {
    logger.debug(
      { reason, dedupeKey, sinceLastMs: now - last },
      "operator-email SMS fallback throttled",
    );
    return;
  }
  smsFallbackLastSentAt.set(dedupeKey, now);

  const body = `[AICandlez] Operator email transport BROKEN: ${reason}. ` +
               `Check RESEND_API_KEY / sender domain / OPERATOR_ALERT_EMAIL_*. ` +
               `Alerts are degraded to log-only until fixed.`;
  const result = await sendTwilioSms(cfg, body.slice(0, 1500));
  if (result.ok) {
    logger.warn(
      { reason, dedupeKey, sid: result.sid },
      "operator-email SMS fallback PAGED on-call",
    );
  } else {
    logger.error(
      { reason, dedupeKey, status: result.status, error: result.error },
      "operator-email SMS fallback FAILED to send — on-call NOT paged",
    );
  }
}

/**
 * Boot-time check. Emits a clear WARN if any of the three required env vars
 * is missing so the failure is visible in the very first log line block
 * rather than only when an incident actually tries to page someone.
 */
export function logOperatorEmailBootStatus(): void {
  const cfg = operatorEmailConfigured();
  if (!cfg) {
    logger.warn(
      {
        RESEND_API_KEY:            !!process.env["RESEND_API_KEY"],
        OPERATOR_ALERT_EMAIL_FROM: !!process.env["OPERATOR_ALERT_EMAIL_FROM"],
        OPERATOR_ALERT_EMAIL_TO:   !!process.env["OPERATOR_ALERT_EMAIL_TO"],
      },
      "Operator email transport NOT configured — operator alerts will log only. " +
      "Set RESEND_API_KEY + OPERATOR_ALERT_EMAIL_FROM + OPERATOR_ALERT_EMAIL_TO to enable email delivery.",
    );
  } else {
    logger.info({ recipients: cfg.to.length }, "Operator email transport configured");
  }
}

/**
 * Periodic health probe that exercises the *actual send path* via Resend's
 * POST /emails endpoint, not just an API-key auth check. This is the only
 * way to detect delivery-side misconfigurations the task explicitly cares
 * about (sender domain unverified, sender address not authorized, free-tier
 * sandbox restrictions, etc.) — an API-key probe alone would happily pass
 * while every real alert silently 4xx'd.
 *
 * To avoid spamming the on-call inbox, the probe sends a single low-noise
 * message to a dedicated probe recipient and tags it with the
 * `X-AICandlez-Probe: 1` header + a stable `X-Entity-Ref-ID` so receiving
 * MTAs collapse all probes into one thread and a server-side mail rule can
 * trivially route them straight to an archive folder.
 *
 * Probe recipient resolution (first match wins):
 *   1. OPERATOR_ALERT_EMAIL_PROBE_TO  — explicit override
 *   2. OPERATOR_ALERT_EMAIL_FROM      — "send to self" (verified by definition)
 *
 * A 2xx response updates `lastOperatorEmailSuccessAt` (delivery path is
 * known healthy) and a non-2xx pages on-call via the SMS fallback.
 */
function probeRecipient(cfg: OperatorEmailConfig): string {
  const override = process.env["OPERATOR_ALERT_EMAIL_PROBE_TO"]?.trim();
  if (override) return override;
  return cfg.from;
}

export async function probeOperatorEmailHealth(): Promise<{
  ok:        boolean;
  skipped?:  boolean;
  status?:   number;
  error?:    string;
}> {
  const cfg = operatorEmailConfigured();
  if (!cfg) return { ok: false, skipped: true };
  const to = probeRecipient(cfg);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    cfg.from,
        to:      [to],
        subject: "[AICandlez] Operator email health probe",
        text:    "Automated send-path health probe. Safe to filter/archive. " +
                 "This message confirms the operator alert transport (Resend → " +
                 `${cfg.from} → on-call) is delivering end-to-end.`,
        headers: {
          "X-AICandlez-Probe": "1",
          // Stable ref so all probes collapse into one MTA thread instead
          // of cluttering the inbox with one item per probe.
          "X-Entity-Ref-ID":   "operator-email-health-probe",
        },
      }),
    });
    if (res.ok) {
      // The send path round-tripped successfully — record it so the admin
      // console "Last Delivery" cell reflects transport health even when
      // no real operator alert has fired recently.
      lastOperatorEmailSuccessAt = Date.now();
      logger.debug({ status: res.status, to }, "operator-email health probe ok");
      return { ok: true, status: res.status };
    }
    const text = await res.text().catch(() => "");
    const err  = text.slice(0, 200);
    logger.error(
      { status: res.status, error: err, to },
      "operator-email health probe FAILED — paging on-call via SMS fallback",
    );
    await pageOperatorViaSms(
      `Resend send-path probe HTTP ${res.status}: ${err.slice(0, 120)}`,
      "operator-email-health-probe",
    );
    return { ok: false, status: res.status, error: err };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, to }, "operator-email health probe network error");
    return { ok: false, error: msg };
  }
}

export function startOperatorEmailHealthMonitor(
  // Hourly by default — the probe is a real send so we keep the cadence
  // gentle on both the Resend monthly cap and the probe inbox.
  intervalMs: number = 60 * 60 * 1000,
): void {
  // First probe runs ~30s after boot so the app finishes warming first.
  setTimeout(() => { void probeOperatorEmailHealth(); }, 30_000).unref();
  setInterval(() => { void probeOperatorEmailHealth(); }, intervalMs).unref();
  logger.info({ intervalMs }, "operator-email health monitor started");
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
    lastOperatorEmailSuccessAt = Date.now();
    logger.info(
      { dedupeKey: payload.dedupeKey, id: result.id, recipients: cfg.to.length },
      "operator-alert email delivered",
    );
  } else {
    // Don't throw — the caller's structured log + the "queued" line above
    // remain the source of truth. Surface delivery failure at warn so it
    // shows up alongside other transport problems without masking the
    // underlying incident the alert was about. ALSO page on-call via SMS
    // fallback so a broken email transport doesn't silently swallow the
    // incident that triggered this alert in the first place.
    logger.warn(
      { dedupeKey: payload.dedupeKey, status: result.status, error: result.error },
      "operator-alert email delivery FAILED",
    );
    await pageOperatorViaSms(
      `delivery failed for "${payload.subject}" (HTTP ${result.status ?? "n/a"})`,
      "operator-email-delivery-failure",
    );
  }
}
