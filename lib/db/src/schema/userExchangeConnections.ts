import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── user_exchange_connections ─────────────────────────────────────────────────
//
// Persists per-user exchange API key connections.
//
// Security model:
//   - Credentials (apiKey + apiSecret + passphrase) are encrypted by
//     CredentialVault (AES-256-GCM, PBKDF2 per-user key) BEFORE being stored here.
//   - Raw credentials are NEVER stored, logged, or returned in API responses.
//   - The encrypted blob (iv + authTag + ciphertext) is a single JSON column.
//   - Only metadata (exchange, status, permissions, timestamps) is returned to frontend.

export const userExchangeConnectionsTable = pgTable(
  "user_exchange_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owner
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

    // Which exchange this credential set belongs to
    exchange: varchar("exchange", { length: 50 }).notNull(),

    // User-friendly label
    label: varchar("label", { length: 100 }).notNull().default("Default"),

    // Encrypted credential blob — JSON: { iv, authTag, ciphertext }
    // The actual apiKey + apiSecret + passphrase are inside this blob (encrypted).
    encryptedBlob: text("encrypted_blob").notNull(),

    // Connection lifecycle
    status: varchar("status", { length: 30 }).notNull().default("active"),
    // active | error | revoked

    // When true, this is the exchange used for the user's simulation/live engine
    isDefault: boolean("is_default").notNull().default(false),

    // paper = safe default; live = user explicitly opted in + acknowledged risk
    tradingMode: varchar("trading_mode", { length: 20 }).notNull().default("paper"),

    // Detected API permissions from last successful connection test
    // e.g. { read: true, trade: true, withdraw: false }
    permissions: jsonb("permissions").$type<{
      read:     boolean;
      trade:    boolean;
      withdraw: boolean;
    }>(),

    // Last time we confirmed the credentials still work
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),

    // Last error message from a failed test (sanitised, no key data)
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One connection per user per exchange
    uniqueIndex("uec_user_exchange_uidx").on(t.userId, t.exchange),
    // Fast lookups for a user's connections
    index("uec_user_idx").on(t.userId),
  ],
);

export type UserExchangeConnection    = typeof userExchangeConnectionsTable.$inferSelect;
export type NewUserExchangeConnection = typeof userExchangeConnectionsTable.$inferInsert;
