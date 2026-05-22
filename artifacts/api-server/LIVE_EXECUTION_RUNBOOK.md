# Per-Customer Live Execution Runbook

> Single-account pilot procedure for the trading loop's per-user live
> execution bridge. Use this **before** enabling live mode for the full
> customer base.

## What changed

The trading loop now fans out live AI trades through each customer's own
connected exchange (`user_exchange_connections`), in addition to the
operator-level path on `admintrade.aicandlez.com`.

For each confirmed live signal the loop:

1. Resolves every user with `is_default=true`, `status='active'`,
   `trading_mode='live'`.
2. Decrypts that user's credential blob via `CredentialVault` (AES-256-GCM,
   per-user PBKDF2 key).
3. Builds an ephemeral exchange adapter with those credentials.
4. Submits a market order through the adapter.
5. Persists a `sim_positions` row (with the new `exchange` +
   `exchange_order_id` columns) so the position appears in the customer's
   portal.
6. On any failure, writes a `user_notifications` row tagged
   `live_trade_failed` so the customer is alerted.

The operator (process-env) path still runs in parallel and remains
unchanged — admintrade keeps working exactly as before.

## Pilot procedure (single Kraken account)

1. **Pick the pilot user**. Choose ONE Clerk userId (yours, ideally) with
   small live capital — recommended ≤ $200 total balance.

2. **Connect Kraken via the customer flow**
   `POST /api/user/exchanges/connect` with that user's session:
   - `exchange: "Kraken"`, `apiKey`, `apiSecret`
   - Confirm `permissions.read = true`, `permissions.trade = true`,
     `permissions.withdraw = false`.

3. **Promote it to default + live**
   - `POST /api/user/exchanges/Kraken/default`
   - `POST /api/user/exchanges/Kraken/mode  { "mode": "live",
     "acknowledged": true }`

4. **Enable dry-run mode globally**
   In the API server environment, set:
   ```
   LIVE_TRADE_DRY_RUN=true
   ```
   Restart the `api-server` workflow. While this flag is on,
   `placeLiveAutoOrderForUser` does NOT call the exchange — it only
   resolves credentials, fetches the reference price, and synthesises a
   `DRYRUN-…` order ID. Logs and `sim_positions` rows are still produced.

5. **Verify dry-run wiring**
   Trigger an admin force-trade (or wait for a normal high-confidence
   signal in live mode). Look for in the api-server logs:
   ```
   liveUserExecution: DRY-RUN — adapter call skipped
   Live fan-out completed  { totalUsers: 1, succeeded: 1, failed: 0,
                             dryRun: true }
   ```
   Then check the DB:
   ```sql
   SELECT id, user_id, symbol, side, exchange, exchange_order_id, entry_price
   FROM sim_positions
   WHERE user_id = '<pilot_clerk_user_id>'
   ORDER BY created_at DESC LIMIT 3;
   ```
   The `exchange` column should read `Kraken` and `exchange_order_id`
   should start with `DRYRUN-`.

6. **Verify failure surfaces**
   Temporarily mark the connection inactive
   (`UPDATE user_exchange_connections SET status='error' WHERE …`),
   trigger another signal, and confirm a row appears in
   `user_notifications` with `type='live_trade_failed'`.
   Revert: `UPDATE … SET status='active'`.

7. **Go live for ONE user only**
   Unset `LIVE_TRADE_DRY_RUN` (or set to `false`) and restart the API
   server. The pilot user is now executing real Kraken orders.
   - Watch logs for `liveUserExecution: order filled`.
   - Verify on Kraken's web UI that the order shows up with the
     `loop-u-…` clientId.
   - Confirm `exchange_order_id` in `sim_positions` matches Kraken's
     order ID.

8. **Smoke-test small-size order**
   First fill should be at ≤ $25 sizeUSD. Adjust the engine's
   `allocation` setting accordingly if needed.

9. **Cooldown + review**
   Let the pilot run for at least 24h with a single user before opening
   live mode to additional customers.

## Rollback

To stop all per-customer live execution instantly:

- **Per-user**: `POST /api/user/exchanges/Kraken/mode  { "mode": "paper" }`
- **Global**: set `LIVE_TRADE_DRY_RUN=true` and restart the api-server —
  all per-user orders become no-ops while signals continue generating.
- **Hard stop**: the engine's existing kill switch on the operator console
  blocks both operator and per-user execution.

## Failure codes

`LiveUserOrderResult.errorCode` values (also persisted in
`user_notifications.data.reason`):

| Code               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| `no_connection`    | No default+active+live exchange connection             |
| `decrypt_failed`   | Credential blob could not be decrypted (key rotated?)  |
| `unsupported`      | Connection points at an exchange with no adapter       |
| `price_unavailable`| Reference ticker fetch failed for the symbol           |
| `exchange_reject`  | Adapter `placeOrder` threw (auth / balance / symbol)   |

## Environment variables

| Variable               | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `LIVE_TRADE_DRY_RUN`   | `true` → skip adapter call, return synthetic order ID    |
| `VAULT_MASTER_KEY`     | Master key for AES-256-GCM credential blob decryption    |
| `EXCHANGE_LIVE_ENABLED`| Required by operator path; per-user path ignores it      |
