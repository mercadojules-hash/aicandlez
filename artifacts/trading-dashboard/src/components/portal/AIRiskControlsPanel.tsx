/**
 * AIRiskControlsPanel — per-user AI LIVE-trade risk budgeting card.
 *
 * Mounted in the customer branch of PortalCustomerShell only (admin
 * branch uses unrestricted operator controls). Caps are evaluated
 * server-side in `lib/riskGate.ts` and enforced as gate 0d inside
 * `placeLiveAutoOrderForUser`. This component is the configuration +
 * live-metrics surface; it never decides whether a trade is allowed.
 *
 * Endpoints:
 *   GET  /api/user/risk-settings  — current caps + defaults
 *   PUT  /api/user/risk-settings  — patch caps (allowlist on server)
 *   GET  /api/user/risk-status    — live snapshot (equity, exposure,
 *                                   slots, max next size); polled 5s
 *                                   while the card is expanded.
 *
 * Each cap (except simultaneous-trade count) accepts USD OR PCT of
 * live equity — the unit toggle is per-field. Presets snap the four
 * fields to named buckets (Conservative / Moderate / Aggressive); the
 * "Custom" preset is auto-assigned when any field is edited manually.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Shield, AlertTriangle } from "lucide-react";
import { authFetch } from "../../lib/authFetch";

type RiskUnit   = "usd" | "pct";
type RiskPreset = "conservative" | "moderate" | "aggressive" | "custom";

interface RiskSettings {
  enabled: boolean;
  preset: RiskPreset;
  maxCapitalPerTradeValue: number;
  maxCapitalPerTradeUnit:  RiskUnit;
  maxSimultaneousTrades:   number;
  maxTotalAllocationValue: number;
  maxTotalAllocationUnit:  RiskUnit;
  reserveCashValue:        number;
  reserveCashUnit:         RiskUnit;
}

interface RiskSnapshot {
  equityUsd: number;
  openCount: number;
  openNotionalUsd: number;
  effective: {
    maxCapitalPerTradeUsd: number;
    maxSimultaneousTrades: number;
    maxTotalAllocationUsd: number;
    reserveCashUsd: number;
  };
  derived: {
    freeCapitalUsd:        number;
    allocationHeadroomUsd: number;
    maxNextSizeUsd:        number;
    slotsRemaining:        number;
  };
}

// Hardcoded preset bundles — server doesn't store these; the UI just
// snaps the four fields and saves. Server enforcement only reads the
// resulting numeric fields. Conservative / Moderate / Aggressive are
// expressed in PCT of equity so they scale across account sizes.
const PRESETS: Record<Exclude<RiskPreset, "custom">, Omit<RiskSettings, "enabled" | "preset">> = {
  conservative: {
    maxCapitalPerTradeValue: 2,  maxCapitalPerTradeUnit: "pct",
    maxSimultaneousTrades:   2,
    maxTotalAllocationValue: 15, maxTotalAllocationUnit: "pct",
    reserveCashValue:        50, reserveCashUnit:        "pct",
  },
  moderate: {
    maxCapitalPerTradeValue: 5,  maxCapitalPerTradeUnit: "pct",
    maxSimultaneousTrades:   3,
    maxTotalAllocationValue: 30, maxTotalAllocationUnit: "pct",
    reserveCashValue:        25, reserveCashUnit:        "pct",
  },
  aggressive: {
    maxCapitalPerTradeValue: 10, maxCapitalPerTradeUnit: "pct",
    maxSimultaneousTrades:   6,
    maxTotalAllocationValue: 70, maxTotalAllocationUnit: "pct",
    reserveCashValue:        10, reserveCashUnit:        "pct",
  },
};

// Token palette — kept local so the panel stays self-contained.
const C = {
  NEON:     "#66FF66",
  NEON_DIM: "rgba(102,255,102,0.55)",
  GLOW:     "rgba(102,255,102,0.18)",
  BORDER:   "#1A2E22",
  BORDER_HI:"rgba(102,255,102,0.32)",
  BG_PANEL: "#0A1410",
  BG_INPUT: "#050C09",
  TEXT_0:   "#E8FFE8",
  TEXT_1:   "#9CB8A2",
  TEXT_2:   "#5A7560",
  RED:      "#FF5C5C",
  AMBER:    "#FFB347",
  TRACK_LABEL: "0.10em" as const,
};

const fmtUsd = (n: number): string => {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000)    return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(n < 100 ? 2 : 0)}`;
};
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

function unitLabel(unit: RiskUnit): string { return unit === "usd" ? "$" : "%"; }

function approximatelyEqualPreset(s: RiskSettings, p: Omit<RiskSettings, "enabled" | "preset">): boolean {
  return (
    s.maxCapitalPerTradeValue === p.maxCapitalPerTradeValue &&
    s.maxCapitalPerTradeUnit  === p.maxCapitalPerTradeUnit  &&
    s.maxSimultaneousTrades   === p.maxSimultaneousTrades   &&
    s.maxTotalAllocationValue === p.maxTotalAllocationValue &&
    s.maxTotalAllocationUnit  === p.maxTotalAllocationUnit  &&
    s.reserveCashValue        === p.reserveCashValue        &&
    s.reserveCashUnit         === p.reserveCashUnit
  );
}

function detectPreset(s: RiskSettings): RiskPreset {
  for (const key of ["conservative", "moderate", "aggressive"] as const) {
    if (approximatelyEqualPreset(s, PRESETS[key])) return key;
  }
  return "custom";
}

// ── Field row ──────────────────────────────────────────────────────────────

function CapField({
  label, value, unit, supportsUnit, onValueChange, onUnitChange, disabled, hint,
}: {
  label: string;
  value: number;
  unit?: RiskUnit;
  supportsUnit: boolean;
  onValueChange: (v: number) => void;
  onUnitChange?: (u: RiskUnit) => void;
  disabled: boolean;
  hint?: string;
}) {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{
        fontSize: 10, letterSpacing: C.TRACK_LABEL, color: C.TEXT_2,
        textTransform: "uppercase",
      }}>{label}</span>
      <div style={{
        display: "flex", alignItems: "stretch",
        border: `1px solid ${C.BORDER}`, background: C.BG_INPUT,
        opacity: disabled ? 0.4 : 1,
      }}>
        <input
          type="number"
          min={0}
          step={supportsUnit && unit === "pct" ? 0.5 : 1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = parseFloat(text);
            if (Number.isFinite(n) && n >= 0) onValueChange(n);
            else setText(String(value));
          }}
          style={{
            flex: 1, minWidth: 0,
            background: "transparent", border: "none", outline: "none",
            color: C.TEXT_0, fontFamily: "JetBrains Mono, IBM Plex Mono, monospace",
            fontSize: 14, padding: "8px 10px", fontWeight: 500,
          }}
        />
        {supportsUnit && unit && onUnitChange ? (
          <div style={{ display: "flex", borderLeft: `1px solid ${C.BORDER}` }}>
            {(["usd", "pct"] as const).map((u) => (
              <button
                key={u}
                type="button"
                disabled={disabled}
                onClick={() => onUnitChange(u)}
                style={{
                  border: "none", cursor: disabled ? "not-allowed" : "pointer",
                  background: unit === u ? "rgba(102,255,102,0.14)" : "transparent",
                  color: unit === u ? C.NEON : C.TEXT_2,
                  fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                  padding: "0 12px", letterSpacing: C.TRACK_LABEL,
                  fontWeight: 600,
                }}
              >{unitLabel(u)}</button>
            ))}
          </div>
        ) : (
          <span style={{
            padding: "8px 12px", color: C.TEXT_2, fontSize: 11,
            borderLeft: `1px solid ${C.BORDER}`, alignSelf: "center",
            letterSpacing: C.TRACK_LABEL,
          }}>CT</span>
        )}
      </div>
      {hint && <span style={{ fontSize: 10, color: C.TEXT_2 }}>{hint}</span>}
    </label>
  );
}

// ── Metric chip ─────────────────────────────────────────────────────────────

function MetricChip({ label, value, tone }: { label: string; value: string; tone?: "neon" | "amber" | "red" }) {
  const color = tone === "red" ? C.RED : tone === "amber" ? C.AMBER : C.NEON;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      padding: "8px 10px",
      border: `1px solid ${C.BORDER}`, background: C.BG_INPUT,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 9, letterSpacing: C.TRACK_LABEL, color: C.TEXT_2 }}>{label}</span>
      <span style={{
        fontSize: 14, color, fontWeight: 600,
        fontFamily: "JetBrains Mono, monospace",
      }}>{value}</span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export const AIRiskControlsPanel = memo(function AIRiskControlsPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // Settings query — single fetch, cached. We hold a draft locally so
  // edits don't round-trip on every keystroke; "Save" flushes it.
  const settingsQ = useQuery({
    queryKey: ["risk-settings"],
    queryFn:  async () => {
      const r = await authFetch("/api/user/risk-settings");
      if (!r.ok) throw new Error("risk-settings");
      return r.json() as Promise<{ settings: RiskSettings; defaults: RiskSettings }>;
    },
    staleTime: 60_000,
  });

  // Live status — polled while expanded so the metrics readout reflects
  // the current exposure + equity without a manual refresh. Paused when
  // collapsed to keep idle terminals quiet.
  const statusQ = useQuery({
    queryKey: ["risk-status"],
    queryFn:  async () => {
      const r = await authFetch("/api/user/risk-status");
      if (!r.ok) throw new Error("risk-status");
      return r.json() as Promise<{ snapshot: RiskSnapshot; equityAvailable: boolean }>;
    },
    refetchInterval: expanded ? 5_000 : false,
    enabled: expanded,
  });

  const [draft, setDraft] = useState<RiskSettings | null>(null);
  useEffect(() => {
    if (settingsQ.data && draft === null) setDraft(settingsQ.data.settings);
  }, [settingsQ.data, draft]);

  const saveMut = useMutation({
    mutationFn: async (next: RiskSettings) => {
      const r = await authFetch("/api/user/risk-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error("save");
      return r.json() as Promise<{ settings: RiskSettings }>;
    },
    onSuccess: (res) => {
      qc.setQueryData(["risk-settings"], { settings: res.settings, defaults: settingsQ.data?.defaults });
      setDraft(res.settings);
      qc.invalidateQueries({ queryKey: ["risk-status"] });
    },
  });

  const patchDraft = useCallback((p: Partial<RiskSettings>) => {
    setDraft((d) => {
      if (!d) return d;
      const next: RiskSettings = { ...d, ...p };
      next.preset = detectPreset(next);
      return next;
    });
  }, []);

  const applyPreset = useCallback((preset: Exclude<RiskPreset, "custom">) => {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, ...PRESETS[preset], preset };
    });
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !settingsQ.data) return false;
    const s = settingsQ.data.settings;
    return JSON.stringify(s) !== JSON.stringify(draft);
  }, [draft, settingsQ.data]);

  const snap = statusQ.data?.snapshot;
  const equityWarn = statusQ.data && !statusQ.data.equityAvailable;
  const noHeadroom = !!snap && draft?.enabled && (
    snap.derived.slotsRemaining <= 0 ||
    snap.derived.maxNextSizeUsd <= 0
  );

  const loading = settingsQ.isLoading || draft === null;

  return (
    <section style={{
      background: `linear-gradient(180deg, #0B1612 0%, ${C.BG_PANEL} 55%, #050C09 100%)`,
      border: `1px solid ${C.BORDER}`,
      fontFamily: "JetBrains Mono, IBM Plex Mono, monospace",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 14px rgba(0,0,0,0.33)`,
    }}>
      {/* Header — collapsible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          background: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.38) 100%)",
          border: "none", borderBottom: `1px solid ${expanded ? C.BORDER_HI : C.BORDER}`,
          color: C.TEXT_0, cursor: "pointer", textAlign: "left",
        }}
      >
        <Shield size={14} style={{ color: C.NEON, filter: `drop-shadow(0 0 4px ${C.GLOW})` }} />
        <span style={{
          fontSize: 13, fontWeight: 600, letterSpacing: C.TRACK_LABEL,
          textShadow: `0 0 4px rgba(0,0,0,0.36)`,
        }}>AI RISK CONTROLS</span>
        <span style={{
          fontSize: 10, color: draft?.enabled ? C.NEON_DIM : C.TEXT_2,
          letterSpacing: C.TRACK_LABEL, padding: "2px 8px",
          border: `1px solid ${draft?.enabled ? C.BORDER_HI : C.BORDER}`,
        }}>
          {draft?.enabled ? `BUDGET · ${(draft.preset ?? "moderate").toUpperCase()}` : "BUDGET · DISABLED"}
        </span>
        {snap && draft?.enabled && (
          <span style={{ fontSize: 10, color: C.TEXT_1, marginLeft: 4 }}>
            FREE&nbsp;<strong style={{ color: C.NEON }}>{fmtUsd(snap.derived.freeCapitalUsd)}</strong>
            &nbsp;·&nbsp;NEXT&nbsp;<strong style={{ color: C.NEON }}>{fmtUsd(snap.derived.maxNextSizeUsd)}</strong>
            &nbsp;·&nbsp;{snap.derived.slotsRemaining}/{snap.effective.maxSimultaneousTrades}&nbsp;SLOTS
          </span>
        )}
        {noHeadroom && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, color: C.AMBER, marginLeft: 4,
          }}>
            <AlertTriangle size={11} /> NEXT AI TRADE WILL BE THROTTLED
          </span>
        )}
        <ChevronDown size={14} style={{
          marginLeft: "auto", color: C.TEXT_2,
          transform: expanded ? "rotate(180deg)" : "none",
          transition: "transform 200ms ease",
        }} />
      </button>

      {expanded && (
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {loading && (
            <div style={{ color: C.TEXT_2, fontSize: 11 }}>Loading risk settings…</div>
          )}

          {!loading && draft && (
            <>
              {/* Enable toggle + preset row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => patchDraft({ enabled: !draft.enabled })}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${draft.enabled ? C.BORDER_HI : C.BORDER}`,
                    background: draft.enabled ? "rgba(102,255,102,0.12)" : "transparent",
                    color: draft.enabled ? C.NEON : C.TEXT_1,
                    cursor: "pointer", fontSize: 11, letterSpacing: C.TRACK_LABEL, fontWeight: 600,
                  }}
                >{draft.enabled ? "RISK BUDGET · ON" : "RISK BUDGET · OFF"}</button>

                <span style={{ flex: 1 }} />

                {(["conservative", "moderate", "aggressive"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={!draft.enabled}
                    onClick={() => applyPreset(p)}
                    style={{
                      padding: "6px 12px",
                      border: `1px solid ${draft.preset === p ? C.BORDER_HI : C.BORDER}`,
                      background: draft.preset === p ? "rgba(102,255,102,0.10)" : "transparent",
                      color: draft.preset === p ? C.NEON : C.TEXT_1,
                      cursor: draft.enabled ? "pointer" : "not-allowed",
                      opacity: draft.enabled ? 1 : 0.4,
                      fontSize: 11, letterSpacing: C.TRACK_LABEL, fontWeight: 500,
                    }}
                  >{p.toUpperCase()}</button>
                ))}
                <span style={{
                  fontSize: 10, color: draft.preset === "custom" ? C.AMBER : C.TEXT_2,
                  letterSpacing: C.TRACK_LABEL,
                }}>
                  {draft.preset === "custom" ? "CUSTOM" : ""}
                </span>
              </div>

              {/* Cap inputs grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}>
                <CapField
                  label="Max per AI trade"
                  value={draft.maxCapitalPerTradeValue}
                  unit={draft.maxCapitalPerTradeUnit}
                  supportsUnit
                  disabled={!draft.enabled}
                  onValueChange={(v) => patchDraft({ maxCapitalPerTradeValue: v })}
                  onUnitChange={(u) => patchDraft({ maxCapitalPerTradeUnit: u })}
                />
                <CapField
                  label="Max simultaneous trades"
                  value={draft.maxSimultaneousTrades}
                  supportsUnit={false}
                  disabled={!draft.enabled}
                  onValueChange={(v) => patchDraft({ maxSimultaneousTrades: Math.max(0, Math.floor(v)) })}
                />
                <CapField
                  label="Max total AI allocation"
                  value={draft.maxTotalAllocationValue}
                  unit={draft.maxTotalAllocationUnit}
                  supportsUnit
                  disabled={!draft.enabled}
                  onValueChange={(v) => patchDraft({ maxTotalAllocationValue: v })}
                  onUnitChange={(u) => patchDraft({ maxTotalAllocationUnit: u })}
                />
                <CapField
                  label="Reserve cash floor"
                  value={draft.reserveCashValue}
                  unit={draft.reserveCashUnit}
                  supportsUnit
                  disabled={!draft.enabled}
                  onValueChange={(v) => patchDraft({ reserveCashValue: v })}
                  onUnitChange={(u) => patchDraft({ reserveCashUnit: u })}
                />
              </div>

              {/* Live metrics readout */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 8,
              }}>
                <MetricChip label="Live equity"        value={snap ? fmtUsd(snap.equityUsd) : "—"} />
                <MetricChip label="Open AI exposure"   value={snap ? fmtUsd(snap.openNotionalUsd) : "—"} />
                <MetricChip
                  label="Slots used"
                  value={snap ? `${snap.openCount}/${snap.effective.maxSimultaneousTrades}` : "—"}
                  tone={snap && snap.derived.slotsRemaining <= 0 ? "amber" : "neon"}
                />
                <MetricChip
                  label="Allocation headroom"
                  value={snap ? fmtUsd(snap.derived.allocationHeadroomUsd) : "—"}
                />
                <MetricChip
                  label="Reserved cash"
                  value={snap ? fmtUsd(snap.effective.reserveCashUsd) : "—"}
                />
                <MetricChip
                  label="Free capital"
                  value={snap ? fmtUsd(snap.derived.freeCapitalUsd) : "—"}
                  tone={snap && snap.derived.freeCapitalUsd <= 0 ? "amber" : "neon"}
                />
                <MetricChip
                  label="Max next size"
                  value={snap ? fmtUsd(snap.derived.maxNextSizeUsd) : "—"}
                  tone={snap && snap.derived.maxNextSizeUsd <= 0 ? "red" : "neon"}
                />
                <MetricChip
                  label="Exposure %"
                  value={snap && snap.equityUsd > 0
                    ? fmtPct((snap.openNotionalUsd / snap.equityUsd) * 100)
                    : "—"}
                />
              </div>

              {/* Banners */}
              {equityWarn && (
                <div style={{
                  border: `1px solid ${C.AMBER}`, background: "rgba(255,179,71,0.08)",
                  padding: "8px 10px", color: C.AMBER, fontSize: 11,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <AlertTriangle size={12} />
                  Live equity unavailable — percent-based caps cannot be evaluated. New AI live trades will be rejected until equity is reachable.
                </div>
              )}
              {noHeadroom && !equityWarn && (
                <div style={{
                  border: `1px solid ${C.AMBER}`, background: "rgba(255,179,71,0.06)",
                  padding: "8px 10px", color: C.AMBER, fontSize: 11,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <AlertTriangle size={12} />
                  {snap && snap.derived.slotsRemaining <= 0
                    ? "Trade-slot cap reached. Close an open AI position to free a slot."
                    : "Insufficient free capital under your current caps. Lower the reserve, raise allocation, or close a position."}
                </div>
              )}
              {saveMut.isError && (
                <div style={{
                  border: `1px solid ${C.RED}`, background: "rgba(255,92,92,0.08)",
                  padding: "8px 10px", color: C.RED, fontSize: 11,
                }}>
                  Failed to save risk settings — try again.
                </div>
              )}

              {/* Footer actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => settingsQ.data && setDraft(settingsQ.data.settings)}
                  style={{
                    padding: "8px 16px",
                    border: `1px solid ${C.BORDER}`, background: "transparent",
                    color: dirty ? C.TEXT_1 : C.TEXT_2,
                    cursor: dirty ? "pointer" : "not-allowed",
                    fontSize: 11, letterSpacing: C.TRACK_LABEL,
                  }}
                >REVERT</button>
                <button
                  type="button"
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => draft && saveMut.mutate(draft)}
                  style={{
                    padding: "8px 18px",
                    border: `1px solid ${dirty ? C.BORDER_HI : C.BORDER}`,
                    background: dirty ? "rgba(102,255,102,0.16)" : "transparent",
                    color: dirty ? C.NEON : C.TEXT_2,
                    cursor: dirty ? "pointer" : "not-allowed",
                    fontSize: 11, letterSpacing: C.TRACK_LABEL, fontWeight: 600,
                  }}
                >{saveMut.isPending ? "SAVING…" : "SAVE"}</button>
              </div>

              <div style={{ fontSize: 10, color: C.TEXT_2, lineHeight: 1.5 }}>
                Caps gate live AI execution server-side. Admin operators bypass
                these limits; platform-wide controlled-beta caps still apply.
                Percent caps scale with your live account equity.
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
});
