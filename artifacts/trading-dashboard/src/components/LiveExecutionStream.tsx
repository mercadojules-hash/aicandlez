/**
 * LiveExecutionStream — operator-facing real-time execution event feed.
 *
 * Polls /api/admin/execution/stream every 2s with cursor-based delta loads.
 * Renders the in-memory ring buffer from executionStreamBus.ts in reverse-
 * chronological order, colour-coded by severity:
 *   info     → neutral
 *   success  → neon green
 *   warn     → amber
 *   error    → red
 *
 * Built for the /command Operator Console. Admin-only via server-side gate.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { N } from "@/components/command/institutional/theme";

type Severity = "info" | "success" | "warn" | "error";

interface ExecStreamEvent {
  id:          string;
  ts:          number;
  type:        string;
  severity:    Severity;
  symbol?:     string;
  side?:       "BUY" | "SELL";
  confidence?: number;
  sizeUSD?:    number;
  price?:      number;
  gate?:       string;
  mode?:       "simulation" | "live" | "test";
  exchange?:   string;
  reason?:     string;
  message:     string;
  details?:    Record<string, unknown>;
}

interface StreamResponse {
  events:     ExecStreamEvent[];
  cursor:     number;
  bufferSize: number;
  timestamp:  number;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  info:    "#9aa3a0",
  success: "#66FF66",
  warn:    "#FFB347",
  error:   "#FF4D4D",
};

const SEVERITY_BG: Record<Severity, string> = {
  info:    "rgba(154,163,160,0.08)",
  success: "rgba(102,255,102,0.10)",
  warn:    "rgba(255,179,71,0.10)",
  error:   "rgba(255,77,77,0.12)",
};

const SEVERITY_FILTERS: Array<{ label: string; value: Severity | "all" }> = [
  { label: "ALL",     value: "all"     },
  { label: "FILLED",  value: "success" },
  { label: "BLOCKED", value: "warn"    },
  { label: "ERROR",   value: "error"   },
];

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function LiveExecutionStream() {
  const [filter, setFilter] = useState<Severity | "all">("all");

  const { data, isLoading, isError } = useQuery<StreamResponse>({
    queryKey:           ["admin-execution-stream"],
    queryFn:            async () => {
      const r = await fetch(`/api/admin/execution/stream?limit=300`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`stream ${r.status}`);
      return r.json() as Promise<StreamResponse>;
    },
    refetchInterval:    2_000,
    refetchOnWindowFocus: false,
    staleTime:          0,
  });

  const events = useMemo(() => {
    const all = data?.events ?? [];
    if (filter === "all") return all;
    return all.filter(e => e.severity === filter);
  }, [data, filter]);

  return (
    <div
      style={{
        background: N.SURFACE_1,
        border: `1px solid ${N.BORDER}`,
        borderRadius: 4,
        padding: 12,
        fontFamily: N.FONT_MONO,
        display: "flex",
        flexDirection: "column",
        minHeight: 360,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isLoading ? N.TEXT_3 : isError ? "#FF4D4D" : "#66FF66",
              boxShadow: isError ? "0 0 6px #FF4D4D" : "0 0 8px #66FF66, 0 0 14px rgba(102,255,102,0.35)",
              animation: !isError && !isLoading ? "brand-pulse 1.4s ease-in-out infinite" : undefined,
            }}
          />
          <span style={{
            fontSize: 11, fontWeight: 900, letterSpacing: "0.22em",
            color: N.TEXT_1,
            textShadow: "0 0 8px rgba(102,255,102,0.45)",
          }}>
            LIVE EXECUTION STREAM
          </span>
          <span style={{ fontSize: 9, color: N.TEXT_3, fontWeight: 700, letterSpacing: "0.18em" }}>
            BUF {data?.bufferSize ?? 0} · {events.length} SHOWN
          </span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {SEVERITY_FILTERS.map(f => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  fontFamily: N.FONT_MONO,
                  background: active ? "rgba(102,255,102,0.15)" : "transparent",
                  color: active ? "#66FF66" : N.TEXT_3,
                  border: `1px solid ${active ? "#66FF66" : N.BORDER}`,
                  borderRadius: 2,
                  cursor: "pointer",
                  textShadow: active ? "0 0 6px rgba(102,255,102,0.5)" : undefined,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Event list ─────────────────────────────────────────────────── */}
      <div
        className="neon-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          maxHeight: 480,
          border: `1px solid ${N.BORDER}`,
          borderRadius: 2,
          background: "#000",
        }}
      >
        {events.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center", color: N.TEXT_3,
            fontSize: 10, letterSpacing: "0.2em", fontWeight: 700,
          }}>
            {isLoading ? "LOADING STREAM…" : isError ? "STREAM UNAVAILABLE" : "NO EVENTS YET — ENGINE IDLE OR WARMING UP"}
          </div>
        ) : (
          events.map(ev => (
            <div
              key={ev.id}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 90px 80px 1fr",
                gap: 8,
                padding: "5px 10px",
                fontSize: 10.5,
                lineHeight: 1.4,
                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                background: SEVERITY_BG[ev.severity],
                color: N.TEXT_1,
              }}
            >
              <span style={{ color: N.TEXT_3, fontVariantNumeric: "tabular-nums" }}>{fmtTs(ev.ts)}</span>
              <span
                style={{
                  color: SEVERITY_COLOR[ev.severity],
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textShadow: ev.severity === "success" ? "0 0 6px rgba(102,255,102,0.5)" : undefined,
                }}
              >
                {ev.type.replace(/_/g, " ").toUpperCase()}
              </span>
              <span style={{
                color: ev.mode === "live" ? "#66FF66" : ev.mode === "test" ? "#FFB347" : N.TEXT_3,
                fontWeight: 800, letterSpacing: "0.14em",
              }}>
                {(ev.mode ?? "—").toUpperCase()}
              </span>
              <span style={{ color: N.TEXT_1 }}>
                {ev.message}
                {typeof ev.confidence === "number" && (
                  <span style={{ color: N.TEXT_3, marginLeft: 8 }}>· conf {ev.confidence.toFixed(1)}%</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
