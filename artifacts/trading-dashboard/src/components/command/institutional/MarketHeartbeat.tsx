/**
 * MarketHeartbeat — the full-width Bloomberg-style live chart row at the
 * very top of the institutional desktop dashboard. The "market heartbeat".
 */

import { HEARTBEAT } from "./tickers";
import { HeartbeatTile } from "./HeartbeatTile";
import { N } from "./theme";

export function MarketHeartbeat() {
  return (
    <section
      className="w-full"
      style={{
        background: N.BG,
        borderBottom: `1px solid ${N.BORDER}`,
        fontFamily: N.FONT_MONO,
      }}
    >
      {/* Label bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: `1px solid ${N.BORDER}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full"
            style={{
              width: 6, height: 6, background: N.BRAND,
              boxShadow: `0 0 8px ${N.BRAND}, 0 0 18px ${N.BRAND}50`,
              animation: "neon-pulse 1.4s infinite",
            }}
          />
          <span
            className="text-[10px] font-bold tracking-[0.22em]"
            style={{ color: N.TEXT_0 }}
          >
            MARKET HEARTBEAT
          </span>
          <span
            className="text-[8px] font-semibold tracking-[0.16em]"
            style={{ color: N.TEXT_3 }}
          >
            · LIVE CROSS-ASSET FEED
          </span>
        </div>
        <span
          className="text-[8px] font-semibold tracking-[0.18em]"
          style={{ color: N.TEXT_2 }}
        >
          15M · {HEARTBEAT.length} INSTRUMENTS
        </span>
      </div>

      {/* Tile grid — auto fits widescreen */}
      <div
        className="grid gap-2 p-2"
        style={{
          gridTemplateColumns: `repeat(${HEARTBEAT.length}, minmax(170px, 1fr))`,
        }}
      >
        {HEARTBEAT.map(spec => (
          <HeartbeatTile key={spec.symbol} spec={spec} />
        ))}
      </div>
    </section>
  );
}
