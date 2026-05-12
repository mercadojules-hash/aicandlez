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
//   - In-memory map used here; Phase 2 will persist to PostgreSQL (encrypted column)
//
// Usage:
//   await vault.store(userId, "Kraken", { apiKey: "...", apiSecret: "..." });
//   const creds = await vault.retrieve(userId, "Kraken");
//   // → { apiKey: "...", apiSecret: "..." } (decrypted, in-memory only)
//
// Exchange connection wizard in the frontend should:
//   1. Accept credentials over HTTPS
//   2. POST to /api/vault/store (body never logged)
//   3. Test credentials via /api/vault/test-connection
//   4. If test passes, credentials are vaulted and never exposed again

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
  private store = new Map<string, VaultEntry>();   // key: `${userId}:${exchange}`

  // ── Store ─────────────────────────────────────────────────────────────────

  store_creds(userId: string, exchange: string, creds: ExchangeCredentials): void {
    const key     = this.deriveKey(userId);
    const iv      = crypto.randomBytes(12);
    const cipher  = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plain   = JSON.stringify({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase });

    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const authTag   = cipher.getAuthTag();

    const mapKey = this.mapKey(userId, exchange);
    const now    = Date.now();
    const existing = this.store.get(mapKey);

    this.store.set(mapKey, {
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

  // ── Retrieve ──────────────────────────────────────────────────────────────

  retrieve(userId: string, exchange: string): ExchangeCredentials | null {
    const entry = this.store.get(this.mapKey(userId, exchange));
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
    const deleted = this.store.delete(this.mapKey(userId, exchange));
    if (deleted) logger.info({ userId, exchange }, "CredentialVault: credentials deleted");
    return deleted;
  }

  // ── List connected exchanges (no credential data exposed) ─────────────────

  listConnected(userId: string): Array<{ exchange: string; label?: string; updatedAt: number }> {
    const results: Array<{ exchange: string; label?: string; updatedAt: number }> = [];
    for (const [k, entry] of this.store) {
      if (entry.userId === userId) {
        results.push({ exchange: entry.exchange, label: entry.label, updatedAt: entry.updatedAt });
      }
    }
    return results;
  }

  has(userId: string, exchange: string): boolean {
    return this.store.has(this.mapKey(userId, exchange));
  }

  // ── Key derivation ────────────────────────────────────────────────────────

  private deriveKey(userId: string): Buffer {
    const master = process.env["VAULT_MASTER_KEY"] ?? "default-dev-key-not-for-production-000";
    // PBKDF2: 32-byte key for AES-256, userId as salt, 100k iterations
    return crypto.pbkdf2Sync(master, userId, 100_000, 32, "sha256");
  }

  private mapKey(userId: string, exchange: string): string {
    return `${userId}:${exchange.toLowerCase()}`;
  }

  // ── Platform stats (no credential data) ───────────────────────────────────

  stats(): { totalEntries: number; uniqueUsers: number; exchangeBreakdown: Record<string, number> } {
    const users = new Set<string>();
    const exchanges: Record<string, number> = {};
    for (const e of this.store.values()) {
      users.add(e.userId);
      exchanges[e.exchange] = (exchanges[e.exchange] ?? 0) + 1;
    }
    return { totalEntries: this.store.size, uniqueUsers: users.size, exchangeBreakdown: exchanges };
  }
}

export const vault = new CredentialVault();
