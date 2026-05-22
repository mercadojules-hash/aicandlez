/**
 * EngineHeartbeat — operator-facing engine health + Safe Test Mode controls.
 *
 * Polls /api/admin/execution/heartbeat every 3s. Surfaces:
 *   - Loop status (healthy / stale / dead / not_started)
 *   - Last tick age
 *   - Signals + executions + blocks
 *   - Live confidence floor (and any active override)
 *   - Funnel: total → MTF-confirmed → executed
 *   - Safe Test Mode banner + activate/deactivate
 *
 * Admin-only via server-side gate.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { N } from "@/components/command/institutional/theme";

interface SafeTestModeState {
  active:                       boolean;
  expiresAt:                    number | null;
  liveConfidenceFloorOverride:  number | null;
  minOrderUsdOverride:          number | null;
  reason:                       string | null;
  activatedBy:                  string | null;
}

interface HeartbeatResponse {
  running:               boolean;
  startedAt:             number | null;
  lastTickAt:            number | null;
  tickAgeMs:             number | null;
  loopHealth:            "healthy" | "stale" | "dead" | "not_started";
  uptimeSec:             number;
  testMode:              boolean;
  require1HTrend:        boolean;
  volumeFilter:          boolean;
  liveConfidenceFloor:   number;
  safeTestMode:          SafeTestModeState;
  signalsGenerated:      number;
  signalsPerMin:         number;
  tradesExecuted:        number;
  tradesBlocked:         number;
  mtfConfirmedCount:     number;
  mtfBlockCount:         number;
  correlationBlocks:     number;
  signalCounts:          { BUY: number; SELL: number; HOLD: number };
  funnel:                { total: number; passedMTF: number; blockedMTF: number; executed: number };
  lastSignalAt:          number | null;
  lastTradeAt:           number | null;
  errors:                string[];
  streamBufferSize:      number;
  timestamp:             number;
}

const HEALTH_COLOR: Record<HeartbeatResponse["loopHealth"], string> = {
  healthy:     "#66FF66",
  stale:       "#FFB347",
  dead:        "#FF4D4D",
  not_started: "#9aa3a0",
};

function ageStr(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

function Tile(props: { label: string; value: React.ReactNode; sub?: string; color?: string; glow?: boolean }) {
  return (
    <div style={{
      padding: "8px 10px",
      background: "rgba(0,0,0,0.4)",
      border: `1px solid ${N.BORDER}`,
      borderRadius: 3,
      minWidth: 110,
      fontFamily: N.FONT_MONO,
    }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em", color: N.TEXT_3 }}>
        {props.label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 900,
        color: props.color ?? N.TEXT_1,
        textShadow: props.glow ? `0 0 8px ${props.color ?? "#66FF66"}80` : undefined,
        fontVariantNumeric: "tabular-nums",
        marginTop: 2,
      }}>
        {props.value}
      </div>
      {props.sub && (
        <div style={{ fontSize: 8.5, color: N.TEXT_3, fontWeight: 700, letterSpacing: "0.12em", marginTop: 1 }}>
          {props.sub}
        </div>
      )}
    </div>
  );
}

export default function EngineHeartbeat() {
  const qc = useQueryClient();
  const [showStmForm, setShowStmForm] = useState(false);
  const [stmFloor, setStmFloor]       = useState(60);
  const [stmSize, setStmSize]         = useState(25);
  const [stmMinutes, setStmMinutes]   = useState(15);
  const [stmReason, setStmReason]     = useState("Live execution pipeline verification");

  const { data, isLoading } = useQuery<HeartbeatResponse>({
    queryKey: ["admin-engine-heartbeat"],
    queryFn:  async () => {
      const r = await fetch(`/api/admin/execution/heartbeat`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`heartbeat ${r.status}`);
      return r.json() as Promise<HeartbeatResponse>;
    },
    refetchInterval:      3_000,
    refetchOnWindowFocus: false,
    staleTime:            0,
  });

  const activateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/execution/safe-test-mode`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          activate:                     true,
          durationMinutes:              stmMinutes,
          liveConfidenceFloorOverride:  stmFloor,
          minOrderUsdOverride:          stmSize,
          reason:                       stmReason,
        }),
      });
      if (!r.ok) throw new Error(`activate ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      setShowStmForm(false);
      qc.invalidateQueries({ queryKey: ["admin-engine-heartbeat"] });
      qc.invalidateQueries({ queryKey: ["admin-execution-stream"] });
    },
  });

  const deactivateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/execution/safe-test-mode`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activate: false }),
      });
      if (!r.ok) throw new Error(`deactivate ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-engine-heartbeat"] });
      qc.invalidateQueries({ queryKey: ["admin-execution-stream"] });
    },
  });

  if (isLoading || !data) {
    return (
      <div style={{
        background: N.SURFACE_1, border: `1px solid ${N.BORDER}`, borderRadius: 4,
        padding: 14, color: N.TEXT_3, fontFamily: N.FONT_MONO,
        fontSize: 10, letterSpacing: "0.2em", fontWeight: 700, textAlign: "center",
      }}>
        LOADING HEARTBEAT…
      </div>
    );
  }

  const healthColor    = HEALTH_COLOR[data.loopHealth];
  const liveFloorShown = data.safeTestMode.active && data.safeTestMode.liveConfidenceFloorOverride !== null
    ? data.safeTestMode.liveConfidenceFloorOverride
    : data.liveConfidenceFloor;
  const stmExpiresIn   = data.safeTestMode.expiresAt ? Math.max(0, data.safeTestMode.expiresAt - Date.now()) : 0;

  return (
    <div style={{
      background: N.SURFACE_1, border: `1px solid ${N.BORDER}`, borderRadius: 4,
      padding: 12, fontFamily: N.FONT_MONO,
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: healthColor,
            boxShadow: `0 0 8px ${healthColor}, 0 0 16px ${healthColor}66`,
            animation: data.loopHealth === "healthy" ? "brand-pulse 1.4s ease-in-out infinite" : undefined,
          }} />
          <span style={{
            fontSize: 11, fontWeight: 900, letterSpacing: "0.22em", color: N.TEXT_1,
            textShadow: `0 0 8px ${healthColor}66`,
          }}>
            ENGINE HEARTBEAT
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.2em", color: healthColor,
            textShadow: `0 0 6px ${healthColor}66`,
          }}>
            {data.loopHealth.toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 9, color: N.TEXT_3, fontWeight: 700, letterSpacing: "0.16em" }}>
          UP {ageStr(data.uptimeSec * 1000)} · TICK {ageStr(data.tickAgeMs)} AGO
        </span>
      </div>

      {/* ── Safe Test Mode banner (sticky when active) ─────────────────── */}
      {data.safeTestMode.active && (
        <div style={{
          padding: "8px 12px",
          marginBottom: 10,
          background: "rgba(255,179,71,0.10)",
          border: "1px solid #FFB347",
          borderRadius: 3,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 900, letterSpacing: "0.2em", color: "#FFB347",
              textShadow: "0 0 6px rgba(255,179,71,0.5)",
            }}>
              ⚠ SAFE TEST MODE ACTIVE · {Math.ceil(stmExpiresIn / 60_000)}m REMAINING
            </div>
            <div style={{ fontSize: 9.5, color: N.TEXT_2, fontWeight: 700, marginTop: 2 }}>
              floor={data.safeTestMode.liveConfidenceFloorOverride ?? "—"}% · size=${data.safeTestMode.minOrderUsdOverride ?? "—"} · {data.safeTestMode.reason}
            </div>
          </div>
          <button
            onClick={() => deactivateMut.mutate()}
            disabled={deactivateMut.isPending}
            style={{
              padding: "5px 10px", fontSize: 9, fontWeight: 900, letterSpacing: "0.18em",
              fontFamily: N.FONT_MONO,
              background: "rgba(255,77,77,0.15)", color: "#FF4D4D",
              border: "1px solid #FF4D4D", borderRadius: 2, cursor: "pointer",
            }}
          >
            DEACTIVATE
          </button>
        </div>
      )}

      {/* ── Tiles ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <Tile label="SIGNALS"     value={data.signalsGenerated} sub={`${data.signalsPerMin}/min`} color="#66FF66" glow />
        <Tile label="EXECUTED"    value={data.tradesExecuted}   color="#66FF66" glow />
        <Tile label="BLOCKED"     value={data.tradesBlocked}    color="#FFB347" />
        <Tile label="LIVE FLOOR"  value={`${liveFloorShown}%`}
              sub={data.safeTestMode.active ? "SAFE-TEST OVERRIDE" : "DEFAULT"}
              color={data.safeTestMode.active ? "#FFB347" : N.TEXT_1} />
        <Tile label="FUNNEL"      value={`${data.funnel.passedMTF}/${data.funnel.total}`} sub={`${data.funnel.executed} exec`} />
        <Tile label="MTF BLOCKS"  value={data.mtfBlockCount}    color="#FFB347" />
        <Tile label="CORR BLOCKS" value={data.correlationBlocks} color="#FFB347" />
        <Tile label="STREAM BUF"  value={data.streamBufferSize} />
      </div>

      {/* ── Safe Test Mode activation form ─────────────────────────────── */}
      {!data.safeTestMode.active && (
        <div style={{ borderTop: `1px solid ${N.BORDER}`, paddingTop: 10 }}>
          {!showStmForm ? (
            <button
              onClick={() => setShowStmForm(true)}
              style={{
                padding: "7px 12px", fontSize: 10, fontWeight: 900, letterSpacing: "0.2em",
                fontFamily: N.FONT_MONO,
                background: "rgba(255,179,71,0.10)", color: "#FFB347",
                border: "1px solid #FFB347", borderRadius: 2, cursor: "pointer",
              }}
            >
              ⚙ ACTIVATE SAFE TEST MODE
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto auto", gap: 8, alignItems: "end" }}>
              <NumField label="FLOOR %"   value={stmFloor}    min={40} max={85}   step={1}  onChange={setStmFloor} />
              <NumField label="SIZE $"    value={stmSize}     min={5}  max={1000} step={5}  onChange={setStmSize}  />
              <NumField label="DURATION m"value={stmMinutes}  min={1}  max={120}  step={1}  onChange={setStmMinutes} />
              <TextField label="REASON"   value={stmReason}   onChange={setStmReason} />
              <button
                onClick={() => activateMut.mutate()}
                disabled={activateMut.isPending}
                style={{
                  padding: "8px 14px", fontSize: 10, fontWeight: 900, letterSpacing: "0.18em",
                  fontFamily: N.FONT_MONO,
                  background: "rgba(102,255,102,0.15)", color: "#66FF66",
                  border: "1px solid #66FF66", borderRadius: 2, cursor: "pointer",
                  textShadow: "0 0 6px rgba(102,255,102,0.5)",
                }}
              >
                {activateMut.isPending ? "ACTIVATING…" : "ACTIVATE"}
              </button>
              <button
                onClick={() => setShowStmForm(false)}
                style={{
                  padding: "8px 12px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
                  fontFamily: N.FONT_MONO,
                  background: "transparent", color: N.TEXT_3,
                  border: `1px solid ${N.BORDER}`, borderRadius: 2, cursor: "pointer",
                }}
              >
                CANCEL
              </button>
              {activateMut.isError && (
                <div style={{ gridColumn: "1 / -1", color: "#FF4D4D", fontSize: 10, fontWeight: 700 }}>
                  Failed to activate. Check admin permissions.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumField(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em", color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        {props.label}
      </span>
      <input
        type="number"
        value={props.value}
        min={props.min} max={props.max} step={props.step}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        style={{
          padding: "6px 8px", fontSize: 11, fontWeight: 800,
          fontFamily: N.FONT_MONO,
          background: "#000", color: N.TEXT_1,
          border: `1px solid ${N.BORDER}`, borderRadius: 2,
          outline: "none",
        }}
      />
    </label>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em", color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        {props.label}
      </span>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        style={{
          padding: "6px 8px", fontSize: 11, fontWeight: 700,
          fontFamily: N.FONT_MONO,
          background: "#000", color: N.TEXT_1,
          border: `1px solid ${N.BORDER}`, borderRadius: 2,
          outline: "none",
        }}
      />
    </label>
  );
}
