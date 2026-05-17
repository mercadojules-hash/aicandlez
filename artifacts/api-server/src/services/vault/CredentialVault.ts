import crypto from "node:crypto";
import { logger } from "../../lib/logger.js";

// ── CredentialVault ───────────────────────────────────────────────────────────
//
// Encrypted storage for per-user exchange API credentials.
//
// Security model:
//   - Credentials are AES-256-GCM encrypted at rest
//   - Encryption key derived from VAULT_MASTER_KEY (env) + userId (per-user salt)
//   - IV is randomly generated per credential write
//   - Auth tag is stored alongside ciphertext for tamper detection
//   - Plain credentials are NEVER stored, logged, or returned in API responses
//   - VAULT_MASTER_KEY is server-only — never included in any VITE_* / frontend build
//
// Key requirements:
//   - VAULT_MASTER_KEY must be set in production (validateEnv crashes if missing)
//   - Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   - Minimum length: 32 characters (64 hex recommended)
//   - NEVER rotate after users have stored credentials — rotation requires re-encryption
//   - Store in Replit Secrets (never in .env committed to git)
//
// Fallback dev key:
//   - Only used when VAULT_MASTER_KEY is absent in development
//   - Credentials encrypted with the dev key are unreadable with the production key
//   - A startup warning is logged when fallback is active (see validateEnv.ts)
//
// Usage:
//   await vault.encryptBlob(userId, { apiKey: "...", apiSecret: "..." });
//   const creds = vault.decryptBlob(userId, blob);
//   // → { apiKey: "...", apiSecret: "..." } (decrypted, in-memory only)

export interface ExchangeCredentials {
  apiKey:      string;
  apiSecret:   string;
  passphrase?: string;    // required by OKX, KuCoin
  label?:      string;    // user-friendly label e.g. "Main Kraken account"
}

interface VaultEntry {
  userId:     string;
  exchange:   string;
  iv:         string;     // hex
  authTag:    string;     // hex
  ciphertext: string;     // hex
  createdAt:  number;
  updatedAt:  number;
  label?:     string;
}

// ── Vault ─────────────────────────────────────────────────────────────────────

class CredentialVault {
  private entries = new Map<string, VaultEntry>();   // key: `${userId}:${exchange}`

  /** True when the vault has a real master key; false when using fallback. */
  get isKeyConfigured(): boolean {
    return Boolean(process.env["VAULT_MASTER_KEY"]);
  }

  // ── Store (in-memory, legacy path) ────────────────────────────────────────

  store_creds(userId: string, exchange: string, creds: ExchangeCredentials): void {
    const key     = this.deriveKey(userId);
    const iv      = crypto.randomBytes(12);
    const cipher  = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plain   = JSON.stringify({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase });

    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const authTag   = cipher.getAuthTag();

    const mapKey = this.entryKey(userId, exchange);
    const now    = Date.now();
    const existing = this.entries.get(mapKey);

    this.entries.set(mapKey, {
      userId,
      exchange,
      iv:         iv.toString("hex"),
      authTag:    authTag.toString("hex"),
      ciphertext: encrypted.toString("hex"),
      createdAt:  existing?.createdAt ?? now,
      updatedAt:  now,
      label:      creds.label,
    });

    logger.info({ userId, exchange }, "CredentialVault: credentials stored (encrypted)");
  }

  // ── Retrieve (in-memory, legacy path) ─────────────────────────────────────

  retrieve(userId: string, exchange: string): ExchangeCredentials | null {
    const entry = this.entries.get(this.entryKey(userId, exchange));
    if (!entry) return null;

    try {
      const key     = this.deriveKey(userId);
      const iv      = Buffer.from(entry.iv,      "hex");
      const authTag = Buffer.from(entry.authTag, "hex");
      const cipher  = Buffer.from(entry.ciphertext, "hex");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const plain = decipher.update(cipher) + decipher.final("utf8");
      return JSON.parse(plain) as ExchangeCredentials;
    } catch (err) {
      logger.error({ userId, exchange, err: (err as Error).message }, "CredentialVault: decryption failed");
      return null;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  delete(userId: string, exchange: string): boolean {
    const deleted = this.entries.delete(this.entryKey(userId, exchange));
    if (deleted) logger.info({ userId, exchange }, "CredentialVault: credentials deleted");
    return deleted;
  }

  // ── Encrypt for DB persistence ────────────────────────────────────────────
  // Produces a JSON string safe to store in the encrypted_blob column.
  // The blob is bound to userId — a different user cannot decrypt it.

  encryptBlob(userId: string, creds: ExchangeCredentials): string {
    const key      = this.deriveKey(userId);
    const iv       = crypto.randomBytes(12);
    const cipher   = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plain    = JSON.stringify({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase });
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const authTag  = cipher.getAuthTag();
    return JSON.stringify({
      iv:         iv.toString("hex"),
      authTag:    authTag.toString("hex"),
      ciphertext: encrypted.toString("hex"),
    });
  }

  // ── Decrypt from DB persistence ───────────────────────────────────────────
  // Returns null on any failure — callers must handle the null case and
  // prompt the user to reconnect the exchange.

  decryptBlob(userId: string, blob: string): ExchangeCredentials | null {
    try {
      const { iv: ivHex, authTag: tagHex, ciphertext: ctHex } = JSON.parse(blob) as {
        iv: string; authTag: string; ciphertext: string;
      };
      const key      = this.deriveKey(userId);
      const iv       = Buffer.from(ivHex,  "hex");
      const authTag  = Buffer.from(tagHex, "hex");
      const ct       = Buffer.from(ctHex,  "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const plain = decipher.update(ct).toString("utf8") + decipher.final("utf8");
      return JSON.parse(plain) as ExchangeCredentials;
    } catch {
      logger.error({ userId }, "CredentialVault: decryptBlob failed — possible key mismatch or tampering");
      return null;
    }
  }

  // ── List connected exchanges (no credential data exposed) ─────────────────

  listConnected(userId: string): Array<{ exchange: string; label?: string; updatedAt: number }> {
    const results: Array<{ exchange: string; label?: string; updatedAt: number }> = [];
    for (const entry of this.entries.values()) {
      if (entry.userId === userId) {
        results.push({ exchange: entry.exchange, label: entry.label, updatedAt: entry.updatedAt });
      }
    }
    return results;
  }

  has(userId: string, exchange: string): boolean {
    return this.entries.has(this.entryKey(userId, exchange));
  }

  // ── Key derivation ────────────────────────────────────────────────────────
  // VAULT_MASTER_KEY is the root secret — all user keys are derived from it.
  // In production: missing key → process.exit(1) via validateEnv before reaching here.
  // In development: missing key → falls back to insecure dev string + logs a warning.
  // The derived key (Buffer) is never logged, stored, or returned to callers.

  private deriveKey(userId: string): Buffer {
    const isProd = process.env["NODE_ENV"] === "production";
    const master = process.env["VAULT_MASTER_KEY"];

    if (!master) {
      if (isProd) {
        // validateEnv should have caught this at startup, but guard defensively.
        logger.error("VAULT_MASTER_KEY is not set in production — refusing to derive encryption key");
        throw new Error("VAULT_MASTER_KEY is required in production");
      }
      // Dev fallback — credentials encrypted here are NOT portable to production.
      return crypto.pbkdf2Sync(
        "default-dev-key-not-for-production-000",
        userId,
        100_000,
        32,
        "sha256",
      );
    }

    if (master.length < 32) {
      logger.warn(
        { length: master.length },
        "VAULT_MASTER_KEY is shorter than 32 characters — use at least 64 hex characters for AES-256 strength",
      );
    }

    return crypto.pbkdf2Sync(master, userId, 100_000, 32, "sha256");
  }

  private entryKey(userId: string, exchange: string): string {
    return `${userId}:${exchange.toLowerCase()}`;
  }

  // ── Platform stats (no credential data) ───────────────────────────────────

  stats(): { totalEntries: number; uniqueUsers: number; exchangeBreakdown: Record<string, number> } {
    const users = new Set<string>();
    const exchanges: Record<string, number> = {};
    for (const e of this.entries.values()) {
      users.add(e.userId);
      exchanges[e.exchange] = (exchanges[e.exchange] ?? 0) + 1;
    }
    return { totalEntries: this.entries.size, uniqueUsers: users.size, exchangeBreakdown: exchanges };
  }
}

export const vault = new CredentialVault();
