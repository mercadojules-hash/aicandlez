import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "\n⚠️  [db] DATABASE_URL is not set.\n" +
    "   The app will start without a database — DB-backed features return empty/mock data.\n" +
    "   Set DATABASE_URL to a PostgreSQL connection string for full functionality.\n",
  );
}

// ── In-memory mock returned when DATABASE_URL is absent ───────────────────────
// All select() calls resolve to [].
// All insert() calls resolve to [{ id: "mock-<random>", createdAt, updatedAt }].
// This prevents startup crashes while keeping API routes functional (degraded).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockDb(): any {
  const makeFinalResult = (op: string): unknown[] => {
    if (op === "insert") {
      return [{
        id:        `mock-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];
    }
    return [];
  };

  const makeChain = (op: string): Record<string, unknown> =>
    new Proxy({} as Record<string, unknown>, {
      get(_t, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "then") {
          return (
            resolve: (v: unknown) => void,
            reject?: (e: unknown) => void,
          ) => Promise.resolve(makeFinalResult(op)).then(resolve, reject);
        }
        return (..._args: unknown[]) => makeChain(op);
      },
    });

  return new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      return (..._args: unknown[]) => makeChain(String(prop));
    },
  });
}

// ── Exports ────────────────────────────────────────────────────────────────────
export const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL })
  : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: ReturnType<typeof drizzle<typeof schema>> = DATABASE_URL
  ? drizzle(pool!, { schema })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  : (createMockDb() as any);

export * from "./schema";
