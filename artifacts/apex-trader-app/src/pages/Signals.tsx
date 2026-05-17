import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { api, type SignalBreakdown, type MobileSignalsResponse } from "@/lib/api";
import { UpgradeBanner } from "@/components/UpgradeBanner";

const ACTION_COLOR: Record<string, string> = {
  BUY:  "#00ff8a",
  SELL: "#ff4466",
  HOLD: "#ffaa00",
};

const TREND_LABEL: Record<string, string> = {
  bullish: "↑ BULL",
  bearish: "↓ BEAR",
  neutral: "→ FLAT",
};

function SignalCard({ symbol, breakdown }: { symbol: string; breakdown: SignalBreakdown }) {
  const color   = ACTION_COLOR[breakdown.action] ?? "#3a6080";
  const age     = Math.floor((Date.now() - breakdown.lastUpdated) / 1000);
  const ageText = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;

  return (
    <div style={{
      background:   "#050d18",
      border:       `1px solid ${breakdown.blockReason ? "#0d2035" : color + "30"}`,
      borderRadius: 10,
      padding:      "14px 16px",
      opacity:      breakdown.blockReason ? 0.55 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
            {symbol}
          </div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
            marginTop: 2, letterSpacing: "0.1em" }}>
            {ageText}
          </div>
        </div>
        <div style={{
          padding:      "4px 12px",
          borderRadius: 6,
          background:   color + "18",
          border:       `1px solid ${color}40`,
          fontSize:     11,
          fontFamily:   "monospace",
          fontWeight:   800,
          color,
          letterSpacing: "0.12em",
        }}>
          {breakdown.action}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {/* Confidence bar */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "#2a4060",
              letterSpacing: "0.1em" }}>CONFIDENCE</span>
            <span style={{ fontSize: 9, fontFamily: "monospace", color, fontWeight: 700 }}>
              {breakdown.confidence}%
            </span>
          </div>
          <div style={{ height: 3, background: "#0d2035", borderRadius: 2 }}>
            <div style={{
              height:     "100%",
              width:      `${breakdown.confidence}%`,
              background: color,
              borderRadius: 2,
              boxShadow:  `0 0 4px ${color}80`,
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Badge label={TREND_LABEL[breakdown.marketCondition] ?? breakdown.marketCondition} color="#3a6080" />
        <Badge label={`1H ${TREND_LABEL[breakdown.trend1H] ?? breakdown.trend1H}`} color="#2a4060" />
        {breakdown.volumeConfirmed && <Badge label="VOL ✓" color="#00ff8a" />}
        {breakdown.mtfConfirmed    && <Badge label="MTF ✓" color="#00aaff" />}
        {breakdown.blockReason     && <Badge label={`⛔ ${breakdown.blockReason}`} color="#ff4466" />}
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding:      "2px 7px",
      background:   color + "12",
      border:       `1px solid ${color}40`,
      borderRadius: 4,
      fontSize:     8,
      fontFamily:   "monospace",
      fontWeight:   700,
      color,
      letterSpacing: "0.08em",
      whiteSpace:   "nowrap",
    }}>
      {label}
    </span>
  );
}

function FilterToggle({
  label, on, color, disabled, onClick,
}: {
  label:    string;
  on:       boolean;
  color:    string;
  disabled: boolean;
  onClick:  () => void;
}) {
  const activeColor = on ? color : "#2a4060";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:       "4px 10px",
        background:    activeColor + "12",
        border:        `1px solid ${activeColor}40`,
        borderRadius:  4,
        fontSize:      9,
        fontFamily:    "monospace",
        fontWeight:    700,
        color:         activeColor,
        letterSpacing: "0.08em",
        whiteSpace:    "nowrap",
        cursor:        disabled ? "not-allowed" : "pointer",
        opacity:       disabled ? 0.5 : 1,
        userSelect:    "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label} {on ? "ON" : "OFF"}
    </button>
  );
}

export default function Signals() {
  const queryClient = useQueryClient();
  const { isSignedIn } = useUser();

  const { data, isLoading, isError } = useQuery<MobileSignalsResponse>({
    queryKey:        ["signal-breakdowns"],
    queryFn:         () => api.get("/mobile/signals"),
    refetchInterval: 5_000,
  });

  const filterMutation = useMutation<
    { volumeFilter: boolean; require1HTrend: boolean },
    Error,
    { volumeFilter: boolean; require1HTrend: boolean },
    { previous?: MobileSignalsResponse }
  >({
    mutationFn: (body) =>
      api.post("/engine/filters", body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["signal-breakdowns"] });
      const previous = queryClient.getQueryData<MobileSignalsResponse>(["signal-breakdowns"]);
      if (previous?.signalFilter) {
        queryClient.setQueryData<MobileSignalsResponse>(["signal-breakdowns"], {
          ...previous,
          signalFilter: {
            volumeFilter:   body.volumeFilter,
            require1HTrend: body.require1HTrend,
          },
        });
      }
      return { previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["signal-breakdowns"], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-breakdowns"] });
    },
  });

  const filter      = data?.signalFilter;
  const canToggle   = Boolean(isSignedIn && filter);
  const isMutating  = filterMutation.isPending;

  const entries = data?.breakdowns ? Object.entries(data.breakdowns) : [];

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <UpgradeBanner />
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
          AI ENGINE
        </div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Signal Feed
        </div>
        {filter && (
          <>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <FilterToggle
                label="VOL FILTER"
                on={filter.volumeFilter}
                color="#00ff8a"
                disabled={!canToggle || isMutating}
                onClick={() => filterMutation.mutate({
                  volumeFilter:   !filter.volumeFilter,
                  require1HTrend: filter.require1HTrend,
                })}
              />
              <FilterToggle
                label="1H TREND"
                on={filter.require1HTrend}
                color="#00aaff"
                disabled={!canToggle || isMutating}
                onClick={() => filterMutation.mutate({
                  volumeFilter:   filter.volumeFilter,
                  require1HTrend: !filter.require1HTrend,
                })}
              />
            </div>
            {!isSignedIn && (
              <div style={{ marginTop: 6, fontSize: 8, fontFamily: "monospace",
                color: "#2a4060", letterSpacing: "0.08em" }}>
                SIGN IN TO ADJUST FILTERS
              </div>
            )}
            {filterMutation.isError && (
              <div style={{ marginTop: 6, fontSize: 8, fontFamily: "monospace",
                color: "#ff4466", letterSpacing: "0.08em" }}>
                FILTER UPDATE FAILED — {filterMutation.error?.message ?? "RETRY"}
              </div>
            )}
          </>
        )}
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace",
          fontSize: 11, color: "#2a4060" }}>
          FETCHING SIGNALS...
        </div>
      )}

      {isError && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace",
          fontSize: 11, color: "#ff4466" }}>
          SIGNAL FEED OFFLINE
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map(([symbol, breakdown]) => (
          <SignalCard key={symbol} symbol={symbol} breakdown={breakdown} />
        ))}
      </div>

      {entries.length === 0 && !isLoading && !isError && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace",
          fontSize: 11, color: "#2a4060" }}>
          NO SIGNALS YET — ENGINE WARMING UP
        </div>
      )}

      <div style={{ marginTop: 16, padding: "10px 14px", background: "#050d18",
        border: "1px solid #0d2035", borderRadius: 6 }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.08em", lineHeight: 1.6 }}>
          Signals are free to view. Try AI Paper Trading Free for 7 Days.
          Upgrade to Unlock Live AI Trading.
        </div>
      </div>
    </div>
  );
}
