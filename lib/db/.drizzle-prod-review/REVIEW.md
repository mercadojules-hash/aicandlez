# Production Schema SQL — Review (review-only, nothing applied)

Artifact: `0000_prod_full_schema.sql` (430 lines). Generated from
`lib/db/src/schema/index.ts` via `drizzle-kit generate` — **no DB connection,
no production access.** Prod delta below computed from read-only
`information_schema` introspection of the prod replica.

---

## ⚠️ Read first: artifact ≠ prod delta

`drizzle-kit generate` had no prior snapshot, so the artifact is the **entire
schema as if from scratch** — it emits `CREATE TABLE` for all 25 tables,
**including the 4 that already exist in prod** (`logs`, `settings`, `signals`,
`trades`). **Do not pipe this raw `.sql` straight into prod** — the 4 `CREATE
TABLE`s for existing tables would either error (raw psql) or be diffed away
(drizzle push).

The **actual prod migration** must be produced by `drizzle-kit push` (non-force),
which diffs against the live schema. Based on the read-only column comparison, the
real delta = **21 CREATE TABLE + their FKs/indexes + 5 ADD COLUMN on `trades`**
(detail in §4).

---

## 2. Categorized statement summary (of the artifact)

| Category | Count | Notes |
| --- | --- | --- |
| `CREATE TABLE` | 25 | 21 genuinely new + 4 already-existing (diffed away by push) |
| `ADD COLUMN` | 0 | (artifact is from-scratch; real prod delta adds 5 — see §4) |
| `CREATE INDEX` | 23 | incl. 4 UNIQUE: `uec_user_exchange_uidx`, `user_push_tokens_token_idx`, `user_sessions_clerk_session_uniq`, `user_exchange_visibility_user_exchange_uniq` |
| `ADD FOREIGN KEY` (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`) | 14 | all → `users.clerk_user_id` `ON DELETE cascade`; all target **new** tables |
| `ALTER TABLE` (existing tables) | 0 | none of the 14 ALTERs touch `logs`/`settings`/`signals`/`trades` |
| Potentially destructive | **0** | see §3 |

The 14 `ALTER TABLE` lines are drizzle's standard "create table, then add FK
constraint" pattern — every one targets a newly-created table, never an existing
prod table.

---

## 3. Destructive-statement confirmation ✅

Full-text scan of the artifact:

- **`DROP TABLE`** — none
- **`DROP COLUMN`** — none
- **`ALTER … TYPE` / type narrowing** — none
- **table / column RENAME** — none
- **`DELETE FROM` / `TRUNCATE` / data deletion** — none
- **`DROP CONSTRAINT` / `DROP INDEX` / `DROP DEFAULT`** — none

The artifact is **purely additive** (CREATE + ADD CONSTRAINT + CREATE INDEX).

---

## 4. Changes to the 4 existing production tables

Comparison of prod live columns (read-only) vs current schema:

| Table | Prod cols | Schema cols | Delta push would apply |
| --- | --- | --- | --- |
| `logs` | 6 | 6 | **NONE** — identical |
| `settings` | 11 | 11 | **NONE** — identical |
| `signals` | 13 | 13 | **NONE** — identical |
| `trades` | 16 | 21 | **+5 nullable columns** (additive) |

`trades` additions (all nullable, no default, no NOT NULL → safe against the
existing 4 rows):
```sql
ALTER TABLE "trades" ADD COLUMN "exchange" text;
ALTER TABLE "trades" ADD COLUMN "exchange_order_id" text;
ALTER TABLE "trades" ADD COLUMN "fill_price" real;
ALTER TABLE "trades" ADD COLUMN "fill_qty" real;
ALTER TABLE "trades" ADD COLUMN "broker_response" jsonb;
```

No existing column on any of the 4 tables is dropped, retyped, renamed, or
re-defaulted. `logs`/`settings`/`signals` are byte-for-byte already current —
confirms zero schema drift there.

---

## 5. The 21 tables that would be created

Identity/customer core: `users`, `user_settings`, `user_consents`,
`user_trade_limits`, `user_risk_settings`, `user_notifications`,
`user_push_tokens`, `user_sessions`.
Paper/AI state: `sim_accounts`, `sim_positions`, `sim_trades`.
Live exchange: `user_exchange_connections`, `user_exchange_visibility`.
Billing: `user_credits`, `credit_transactions`, `performance_fees`,
`processed_stripe_events`.
Admin/audit/risk: `user_admin_status`, `user_admin_actions`, `audit_log`,
`risk_throttle_events`.

(The 4 already-existing — `logs`, `settings`, `signals`, `trades` — are NOT
recreated by push.)

---

## 6. Warnings requiring manual review before production migration

1. **Do not apply the raw artifact to prod.** It contains 4 `CREATE TABLE`s for
   existing tables. The real migration must come from `drizzle-kit push`
   (non-force) so it diffs against live prod. This artifact is for *review*.
2. **Confirm the real delta with a non-force push diff (then abort).** Before the
   actual apply, run `drizzle-kit push` against prod and read the printed plan —
   it should show exactly: 21 CREATE TABLE, 14 FK, 23 indexes, 5 ADD COLUMN on
   `trades`, and **nothing** against `logs`/`settings`/`signals`. If it proposes
   anything else, stop. (Not run this pass — review-only.)
3. **`push-force` is forbidden against prod** — it suppresses the destructive-op
   prompt that is the last human gate.
4. **FK ordering / cascade.** All 14 FKs cascade-delete from `users`. `users`
   must exist first (push orders this). Deleting a user row will cascade-delete
   their sim/exchange/billing rows by design — note for any future admin tooling.
5. **`processed_stripe_events` (app table)** is distinct from the `stripe.*`
   schema managed by `stripe-replit-sync` (the Render startup migration). No
   overlap, no conflict — but don't confuse the two during verification.
6. **Unique indexes on new tables** (`uec_user_exchange_uidx`, etc.) are safe on
   empty tables. If any data were pre-seeded into these tables out-of-band before
   the push, a unique-violation could block index creation — they are empty in
   prod today, so this is informational.
7. **NOT NULL + default columns on new tables** are safe because the tables are
   created empty. The only change to a *populated* table is `trades`, and all 5
   additions are nullable.
