import { db, jarvisCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";

/**
 * Credential awareness (Sovereignty Pillar 2) — NAMES ONLY.
 *
 * CRITICAL SECURITY INVARIANT: this module reads only the KEYS of
 * `process.env`. It NEVER reads, returns, stores, or logs an environment
 * variable VALUE. Jarvis becomes aware that a credential of a given NAME exists
 * without ever handling the secret itself.
 */

// Only surface credential-relevant names; system/runtime noise is excluded.
const RELEVANT =
  /(_KEY|_SECRET|_TOKEN|_PASSWORD|_URL|API|CLERK|STRIPE|RENDER|DATABASE|SESSION|VAULT|VAPID|OPENAI|ELEVEN|WEBHOOK|BINANCE|COINBASE|KRAKEN|CRYPTOCOM|GITHUB)/i;
const EXCLUDE = /^(PATH|HOME|PWD|SHELL|TERM|LANG|LC_|USER|HOSTNAME|NODE_|npm_|PNPM_|REPL_|REPLIT_PORT|_$)/;

/** Names of credential-relevant env vars currently present (KEYS ONLY). */
export function detectEnvNames(): string[] {
  const names: string[] = [];
  for (const key of Object.keys(process.env)) {
    if (EXCLUDE.test(key)) continue;
    if (!RELEVANT.test(key)) continue;
    names.push(key);
  }
  return names.sort();
}

/** Whether a single env var NAME is present (no value is read). */
export function isEnvPresent(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(process.env, name);
}

/**
 * Refresh the `present` flag on every registered credential by checking whether
 * an env var of that NAME exists. Values are never touched. Fail-safe.
 */
export async function refreshCredentialPresence(): Promise<{
  checked: number;
  present: number;
}> {
  try {
    const rows = await db
      .select({
        id: jarvisCredentialsTable.id,
        name: jarvisCredentialsTable.name,
      })
      .from(jarvisCredentialsTable);
    let present = 0;
    const now = new Date();
    for (const row of rows) {
      const isPresent = isEnvPresent(row.name);
      if (isPresent) present += 1;
      await db
        .update(jarvisCredentialsTable)
        .set({ present: isPresent, lastVerifiedAt: now })
        .where(eq(jarvisCredentialsTable.id, row.id));
    }
    return { checked: rows.length, present };
  } catch (err) {
    logger.warn({ err }, "jarvis: refreshCredentialPresence failed");
    return { checked: 0, present: 0 };
  }
}
