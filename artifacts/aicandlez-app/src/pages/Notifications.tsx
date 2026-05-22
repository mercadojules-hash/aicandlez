import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_BLOOM = "rgba(102,255,102,0.22)";
const NEG         = "#FF5577";
const NEG_BLOOM   = "rgba(255,85,119,0.22)";
const BG          = "#000";
const SURFACE     = "#0A1410";
const SURFACE_2   = "#0F1F18";
const BORDER      = "rgba(255,255,255,0.07)";
const BORDER_HI   = "rgba(102,255,102,0.18)";
const TEXT        = "#E8F5EC";
const TEXT_SUB    = "#9FB3A8";
const TEXT_DIM    = "#5A726A";
const SANS        = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO        = "'SF Mono','JetBrains Mono',ui-monospace,Menlo,monospace";

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface NotificationRow {
  id:        string;
  type:      string;
  title:     string;
  message:   string;
  read:      boolean;
  createdAt: string;
  data?:     Record<string, unknown> | null;
}

interface LiveCloseData {
  symbol:         string;
  side:           string;
  exchange:       string;
  exitPrice:      number;
  quantity:       number;
  realizedPnL:    number;
  realizedPnLPct: number;
  closeReason:    string;
  dryRun?:        boolean;
}

function isLiveCloseData(d: unknown): d is LiveCloseData {
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  return typeof o.symbol === "string"
      && typeof o.realizedPnL === "number"
      && typeof o.closeReason === "string";
}

const REASON_LABEL: Record<string, string> = {
  TP:      "TP",
  SL:      "SL",
  MANUAL:  "MANUAL",
  AI_EXIT: "AI EXIT",
};

function reasonLabel(reason: string): string {
  const k = reason.toUpperCase();
  return REASON_LABEL[k] ?? k;
}

function fmtTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LiveCloseCard({ d }: { d: LiveCloseData }) {
  const positive = d.realizedPnL >= 0;
  const color    = positive ? BRAND : NEG;
  const bloom    = positive ? BRAND_BLOOM : NEG_BLOOM;
  const sign     = positive ? "+" : "−";
  const reason   = reasonLabel(d.closeReason);
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10, marginTop: 10,
      padding: "12px 14px", borderRadius: 14,
      background: `linear-gradient(160deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
      border: `1px solid ${positive ? BORDER_HI : "rgba(255,85,119,0.22)"}`,
      boxShadow: `0 0 24px ${bloom}`,
    }}>
      {/* Top row: symbol/side + PnL pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: SANS, fontWeight: 800, fontSize: 13, color: TEXT, letterSpacing: -0.2,
          }}>{d.symbol}</span>
          <span style={{
            padding: "2px 7px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
            fontFamily: SANS, fontWeight: 700, fontSize: 9, color: TEXT_SUB,
            letterSpacing: 1, textTransform: "uppercase",
          }}>{d.side}</span>
          <span style={{
            padding: "2px 7px", borderRadius: 6,
            background: `${color}1A`, border: `1px solid ${color}55`,
            fontFamily: MONO, fontWeight: 800, fontSize: 9, color,
            letterSpacing: 1, textTransform: "uppercase",
          }}>{reason}</span>
          {d.dryRun && (
            <span style={{
              padding: "2px 7px", borderRadius: 6,
              background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
              fontFamily: SANS, fontWeight: 700, fontSize: 9, color: TEXT_DIM,
              letterSpacing: 1, textTransform: "uppercase",
            }}>Dry-Run</span>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "baseline", gap: 6,
          padding: "5px 12px", borderRadius: 999,
          background: `linear-gradient(135deg, ${color}26, ${color}10)`,
          border: `1px solid ${color}66`,
          boxShadow: `0 0 14px ${bloom}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: MONO, fontWeight: 800, fontSize: 13, color,
            letterSpacing: -0.3, lineHeight: 1,
          }}>
            {sign}${fmtMoney(Math.abs(d.realizedPnL))}
          </span>
          <span style={{
            fontFamily: MONO, fontWeight: 700, fontSize: 10, color: `${color}CC`,
            letterSpacing: 0, lineHeight: 1,
          }}>
            ({sign}{Math.abs(d.realizedPnLPct).toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Bottom row: qty @ price · exchange */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        fontFamily: MONO, fontSize: 10, color: TEXT_SUB,
      }}>
        <span>
          {d.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })} @ ${fmtMoney(d.exitPrice)}
        </span>
        <span style={{ color: TEXT_DIM, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
          {d.exchange}
        </span>
      </div>
    </div>
  );
}

type FilterKey = "all" | "trades" | "signals" | "system";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",     label: "All"     },
  { key: "trades",  label: "Trades"  },
  { key: "signals", label: "Signals" },
  { key: "system",  label: "System"  },
];

const FILTER_STORAGE_KEY = "aicandlez_notifications_filter_v1";
const FILTER_KEYS: FilterKey[] = ["all", "trades", "signals", "system"];

function loadFilter(): FilterKey {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw && (FILTER_KEYS as string[]).includes(raw)) return raw as FilterKey;
  } catch { /* unavailable */ }
  return "all";
}

function saveFilter(f: FilterKey) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FILTER_STORAGE_KEY, f); } catch { /* quota */ }
}

function bucketOf(type: string): Exclude<FilterKey, "all"> {
  const t = type.toLowerCase();
  if (t.includes("trade") || t.includes("position") || t.includes("order") || t.includes("fill") || t.includes("tp") || t.includes("sl")) {
    return "trades";
  }
  if (t.includes("signal") || t.includes("scanner") || t.includes("setup") || t.includes("breakout") || t.includes("alert")) {
    return "signals";
  }
  return "system";
}

const EMPTY_COPY: Record<FilterKey, { title: string; body: string }> = {
  all:     { title: "No notifications yet",       body: "Trade fills, AI exits and risk alerts will appear here." },
  trades:  { title: "No trade activity yet",      body: "Live fills, AI exits and TP/SL hits will land here." },
  signals: { title: "No signal alerts yet",       body: "High-confidence setups from the AI scanner will appear here." },
  system:  { title: "No system messages",         body: "Connection, billing and platform notices will appear here." },
};

export default function Notifications() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [filter, setFilterState] = useState<FilterKey>(() => loadFilter());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FILTER_STORAGE_KEY) return;
      const next = e.newValue;
      if (next && (FILTER_KEYS as string[]).includes(next)) {
        setFilterState(next as FilterKey);
      } else if (next === null) {
        setFilterState("all");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setFilter = (f: FilterKey) => {
    setFilterState(f);
    saveFilter(f);
  };

  const { data, isLoading, isError, error, refetch } = useQuery<{ notifications: NotificationRow[]; unread: number }>({
    queryKey:        ["pwa-notifications"],
    queryFn:         () => api.get("/user/notifications"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry:           false,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/user/notifications/read-all"),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["pwa-notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/user/notifications/${id}/read`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["pwa-notifications"] }),
  });

  const allRows = data?.notifications ?? [];
  const unread  = data?.unread ?? 0;

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: allRows.length, trades: 0, signals: 0, system: 0 };
    for (const n of allRows) c[bucketOf(n.type)]++;
    return c;
  }, [allRows]);

  const rows = useMemo(
    () => (filter === "all" ? allRows : allRows.filter(n => bucketOf(n.type) === filter)),
    [allRows, filter],
  );

  const openRow = (n: NotificationRow) => {
    if (!n.read) markOne.mutate(n.id);
    if (n.type === "live_trade_closed") {
      // /aicandlez-app/portfolio → strip basePath for wouter
      setLocation("/portfolio");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, paddingBottom: 96 }}>
      <PageHeader
        title="Notifications"
        caption={unread > 0 ? `${unread} UNREAD` : "ALL CLEAR"}
        right={unread > 0 ? (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={{
              padding: "7px 12px", borderRadius: 8,
              background: `linear-gradient(135deg, ${BRAND}22, ${BRAND_DEEP}18)`,
              border: `1px solid ${BORDER_HI}`,
              color: BRAND, fontFamily: SANS, fontWeight: 700,
              fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase",
              cursor: "pointer", opacity: markAllRead.isPending ? 0.55 : 1,
            }}>
            Mark all read
          </button>
        ) : undefined}
      />

      <div style={{
        padding: "12px 14px 4px", display: "flex", gap: 8,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count  = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: 999,
                background: active
                  ? `linear-gradient(135deg, ${BRAND}26, ${BRAND_DEEP}18)`
                  : SURFACE,
                border: `1px solid ${active ? BORDER_HI : BORDER}`,
                color: active ? BRAND : TEXT_SUB,
                fontFamily: SANS, fontWeight: 700, fontSize: 10,
                letterSpacing: 1.2, textTransform: "uppercase",
                cursor: "pointer", flexShrink: 0,
                boxShadow: active ? `0 0 12px ${BRAND_BLOOM}` : "none",
              }}>
              {f.label}
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 700,
                color: active ? BRAND : TEXT_DIM, letterSpacing: 0,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: "8px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {isLoading ? (
          <div style={{
            padding: "48px 16px", textAlign: "center",
            border: `1px solid ${BORDER}`, borderRadius: 14, background: SURFACE,
            fontFamily: SANS, fontSize: 11, color: TEXT_DIM, letterSpacing: 1.5,
            textTransform: "uppercase",
          }}>Loading…</div>
        ) : isError ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            border: `1px solid rgba(255,85,119,0.32)`, borderRadius: 14,
            background: "rgba(255,85,119,0.06)",
          }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, color: NEG, letterSpacing: 0.2 }}>
              Couldn’t load notifications
            </div>
            <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 10, color: TEXT_DIM }}>
              {error instanceof Error ? error.message : "Network or server error"}
            </div>
            <button onClick={() => refetch()} style={{
              marginTop: 14, padding: "8px 16px", borderRadius: 8,
              background: `linear-gradient(135deg, ${BRAND}22, ${BRAND_DEEP}18)`,
              border: `1px solid ${BORDER_HI}`,
              color: BRAND, fontFamily: SANS, fontWeight: 700, fontSize: 10,
              letterSpacing: 1.2, textTransform: "uppercase", cursor: "pointer",
            }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            padding: "56px 20px", textAlign: "center",
            border: `1px solid ${BORDER}`, borderRadius: 14, background: SURFACE,
          }}>
            <div style={{
              fontFamily: SANS, fontWeight: 700, fontSize: 12, color: TEXT_SUB,
              letterSpacing: 0.2,
            }}>{EMPTY_COPY[filter].title}</div>
            <div style={{
              marginTop: 6, fontFamily: SANS, fontSize: 10, color: TEXT_DIM,
              letterSpacing: 0.3,
            }}>
              {EMPTY_COPY[filter].body}
            </div>
          </div>
        ) : (
          rows.map(n => {
            const liveClose = n.type === "live_trade_closed" && isLiveCloseData(n.data) ? n.data : null;
            const accent    = liveClose
              ? (liveClose.realizedPnL >= 0 ? BRAND : NEG)
              : "rgba(255,255,255,0.18)";
            return (
              <div
                key={n.id}
                onClick={() => openRow(n)}
                style={{
                  position: "relative",
                  padding: "14px 14px 14px 16px",
                  borderRadius: 16,
                  background: n.read ? SURFACE : `linear-gradient(160deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
                  border: `1px solid ${n.read ? BORDER : BORDER_HI}`,
                  borderLeft: `3px solid ${accent}`,
                  cursor: "pointer",
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{
                    fontFamily: SANS, fontWeight: 700, fontSize: 12, color: n.read ? TEXT_SUB : TEXT,
                    letterSpacing: -0.1, lineHeight: 1.3,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {n.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {!n.read && (
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: BRAND, boxShadow: `0 0 6px ${BRAND}`,
                      }}/>
                    )}
                    <span style={{
                      fontFamily: MONO, fontSize: 9, color: TEXT_DIM, letterSpacing: 0.2,
                    }}>{fmtTime(n.createdAt)}</span>
                  </div>
                </div>

                {liveClose ? (
                  <LiveCloseCard d={liveClose} />
                ) : (
                  <div style={{
                    marginTop: 6,
                    fontFamily: SANS, fontSize: 11, color: n.read ? TEXT_DIM : TEXT_SUB,
                    lineHeight: 1.5,
                  }}>
                    {n.message}
                  </div>
                )}
              </div>
            );
          })
        )}

        <div style={{
          marginTop: 8, textAlign: "center",
          fontFamily: SANS, fontSize: 9, color: TEXT_DIM, letterSpacing: 1.2,
          textTransform: "uppercase",
        }}>
          Synced via {basePath || "/"}api/user/notifications
        </div>
      </div>
    </div>
  );
}
