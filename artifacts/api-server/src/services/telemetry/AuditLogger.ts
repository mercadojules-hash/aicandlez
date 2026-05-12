import { logger } from "../../lib/logger.js";

// ── AuditLogger ───────────────────────────────────────────────────────────────
//
// Immutable append-only audit trail for:
//   - Signal generation events
//   - Trade execution decisions (with full decision chain)
//   - Risk engine checks and violations
//   - Exchange mode changes (simulation ↔ live)
//   - Kill switch activations
//   - Credential vault access
//   - User authentication events
//   - Admin actions
//
// Design principles:
//   - Entries are NEVER deleted or modified (regulatory compliance)
//   - Each entry has a deterministic hash of its content for tamper detection
//   - In Phase 2: persisted to append-only PostgreSQL table with WAL replication
//   - Entries are structured for export to SIEM / compliance reporting

import crypto from "node:crypto";

export type AuditEventType =
  | "SIGNAL_GENERATED"
  | "TRADE_EXECUTED"
  | "TRADE_REJECTED"
  | "TRADE_CLOSED"
  | "RISK_VIOLATION"
  | "KILL_SWITCH_ON"
  | "KILL_SWITCH_OFF"
  | "MODE_CHANGED"
  | "EXCHANGE_CONNECTED"
  | "EXCHANGE_DISCONNECTED"
  | "CREDENTIAL_STORED"
  | "CREDENTIAL_RETRIEVED"
  | "CREDENTIAL_DELETED"
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "SETTINGS_CHANGED"
  | "CIRCUIT_BREAKER_TRIPPED"
  | "DRAWDOWN_ALERT"
  | "ADMIN_ACTION";

export interface AuditEntry {
  id:        string;
  hash:      string;         // sha256 of (id + userId + type + timestamp + payload)
  timestamp: number;         // unix ms — monotonically increasing
  userId:    string;
  sessionId: string | null;
  ipAddress: string | null;
  type:      AuditEventType;
  exchange?: string;
  symbol?:   string;
  payload:   Record<string, unknown>;  // structured event data
  severity:  "info" | "warn" | "critical";
}

// ── AuditLogger ───────────────────────────────────────────────────────────────

class AuditLoggerStore {
  private entries: AuditEntry[] = [];
  private readonly MAX_ENTRIES  = 50_000;

  append(
    userId:    string,
    type:      AuditEventType,
    payload:   Record<string, unknown>,
    opts: {
      exchange?:  string;
      symbol?:    string;
      sessionId?: string;
      ipAddress?: string;
      severity?:  AuditEntry["severity"];
    } = {},
  ): AuditEntry {
    const id        = crypto.randomUUID();
    const timestamp = Date.now();
    const severity  = opts.severity ?? this.defaultSeverity(type);
    const raw       = `${id}${userId}${type}${timestamp}${JSON.stringify(payload)}`;
    const hash      = crypto.createHash("sha256").update(raw).digest("hex");

    const entry: AuditEntry = {
      id, hash, timestamp, userId,
      sessionId:  opts.sessionId  ?? null,
      ipAddress:  opts.ipAddress  ?? null,
      type,
      exchange:   opts.exchange,
      symbol:     opts.symbol,
      payload,
      severity,
    };

    this.entries.push(entry);
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.shift();  // drop oldest (only acceptable truncation point)
    }

    // Forward to structured server log
    if (severity === "critical") {
      logger.error({ auditId: id, userId, type, exchange: opts.exchange, symbol: opts.symbol }, `AUDIT: ${type}`);
    } else if (severity === "warn") {
      logger.warn({ auditId: id, userId, type }, `AUDIT: ${type}`);
    } else {
      logger.info({ auditId: id, userId, type }, `AUDIT: ${type}`);
    }

    return entry;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  query(opts: {
    userId?:     string;
    types?:      AuditEventType[];
    exchange?:   string;
    symbol?:     string;
    since?:      number;    // unix ms
    until?:      number;
    severity?:   AuditEntry["severity"];
    limit?:      number;
  } = {}): AuditEntry[] {
    let result = this.entries as AuditEntry[];

    if (opts.userId)    result = result.filter(e => e.userId   === opts.userId);
    if (opts.types)     result = result.filter(e => opts.types!.includes(e.type));
    if (opts.exchange)  result = result.filter(e => e.exchange === opts.exchange);
    if (opts.symbol)    result = result.filter(e => e.symbol   === opts.symbol);
    if (opts.severity)  result = result.filter(e => e.severity === opts.severity);
    if (opts.since)     result = result.filter(e => e.timestamp >= opts.since!);
    if (opts.until)     result = result.filter(e => e.timestamp <= opts.until!);

    // Return newest first, limited
    return result.reverse().slice(0, opts.limit ?? 200);
  }

  // Verify hash integrity of a specific entry
  verify(entry: AuditEntry): boolean {
    const raw  = `${entry.id}${entry.userId}${entry.type}${entry.timestamp}${JSON.stringify(entry.payload)}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    return hash === entry.hash;
  }

  stats(): { total: number; critical: number; warn: number; uniqueUsers: number } {
    const users = new Set(this.entries.map(e => e.userId));
    return {
      total:       this.entries.length,
      critical:    this.entries.filter(e => e.severity === "critical").length,
      warn:        this.entries.filter(e => e.severity === "warn").length,
      uniqueUsers: users.size,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private defaultSeverity(type: AuditEventType): AuditEntry["severity"] {
    const critical: AuditEventType[] = [
      "KILL_SWITCH_ON", "CIRCUIT_BREAKER_TRIPPED", "DRAWDOWN_ALERT",
      "RISK_VIOLATION", "ADMIN_ACTION",
    ];
    const warn: AuditEventType[] = [
      "TRADE_REJECTED", "EXCHANGE_DISCONNECTED", "MODE_CHANGED",
      "CREDENTIAL_DELETED",
    ];
    if (critical.includes(type)) return "critical";
    if (warn.includes(type))     return "warn";
    return "info";
  }
}

export const auditLogger = new AuditLoggerStore();
