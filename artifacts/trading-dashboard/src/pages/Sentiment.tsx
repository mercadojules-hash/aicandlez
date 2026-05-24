import { authFetch } from "@/lib/authFetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, RefreshCw, TrendingUp, TrendingDown, Minus,
  Newspaper, Zap, ArrowRight, Clock, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────────

type SentimentLabel = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

interface Headline {
  id: string; title: string; source: string; symbol: string | null;
  score: number; magnitude: "low" | "medium" | "high"; publishedAt: number;
}

interface SymbolSentiment {
  symbol: string; displayName: string; score: number; label: SentimentLabel;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"; signalStrength: "STRONG" | "MODERATE" | "WEAK";
  confidenceAdj: number; headlines: Headline[]; updatedAt: number;
}

interface MarketSentiment {
  composite: number; label: SentimentLabel; fearGreed: number;
  description: string; updatedAt: number;
}

interface SentimentOverview {
  market: MarketSentiment; assets: SymbolSentiment[];
  allNews: Headline[]; updatedAt: number;
}

// ── Config maps ────────────────────────────────────────────────────────────────

const LABEL_CONFIG: Record<SentimentLabel, { label: string; color: string; bg: string; border: string }> = {
  EXTREME_FEAR:  { label: "Extreme Fear",  color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30"    },
  FEAR:          { label: "Fear",          color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  NEUTRAL:       { label: "Neutral",       color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  GREED:         { label: "Greed",         color: "text-lime-400",   bg: "bg-lime-500/10",   border: "border-lime-500/30"   },
  EXTREME_GREED: { label: "Extreme Greed", color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30"  },
};

const SIGNAL_CONFIG = {
  BULLISH: { color: "text-green-400", bg: "bg-green-500/15 border-green-500/30", icon: TrendingUp  },
  BEARISH: { color: "text-red-400",   bg: "bg-red-500/15 border-red-500/30",     icon: TrendingDown },
  NEUTRAL: { color: "text-slate-400", bg: "bg-slate-700/40 border-slate-600/30", icon: Minus        },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

function scoreBarColor(score: number): string {
  if (score <= -60) return "bg-red-500";
  if (score < -20)  return "bg-orange-500";
  if (score <= 20)  return "bg-yellow-500";
  if (score < 60)   return "bg-lime-500";
  return "bg-green-500";
}

function scoreTextColor(score: number): string {
  if (score <= -60) return "text-red-400";
  if (score < -20)  return "text-orange-400";
  if (score <= 20)  return "text-yellow-400";
  if (score < 60)   return "text-lime-400";
  return "text-green-400";
}

// ── Sentiment gauge (SVG) ──────────────────────────────────────────────────────

function SentimentGauge({ score }: { score: number }) {
  const r = 72;
  const cx = 100, cy = 96;

  // Arc path helpers
  function polarToXY(angleDeg: number, radius: number) {
    const rad = angleDeg * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  }

  function arcPath(startDeg: number, endDeg: number, innerR: number, outerR: number) {
    const s1 = polarToXY(startDeg, outerR);
    const e1 = polarToXY(endDeg,   outerR);
    const s2 = polarToXY(endDeg,   innerR);
    const e2 = polarToXY(startDeg, innerR);
    const lg = endDeg - startDeg > 180 ? 1 : 0;
    return [
      `M ${s1.x} ${s1.y}`,
      `A ${outerR} ${outerR} 0 ${lg} 0 ${e1.x} ${e1.y}`,
      `L ${s2.x} ${s2.y}`,
      `A ${innerR} ${innerR} 0 ${lg} 1 ${e2.x} ${e2.y}`,
      "Z",
    ].join(" ");
  }

  // Segments: 180° (far-left/score=-100) to 0° (far-right/score=+100)
  const segments = [
    { start: 144, end: 180, fill: "#ef4444" },  // extreme fear
    { start: 108, end: 144, fill: "#f97316" },  // fear
    { start: 72,  end: 108, fill: "#eab308" },  // neutral
    { start: 36,  end: 72,  fill: "#84cc16" },  // greed
    { start: 0,   end: 36,  fill: "#22c55e" },  // extreme greed
  ];

  // Needle angle: score -100 → 180°, score 0 → 90°, score +100 → 0°
  const needleAngle = 180 - ((score + 100) / 200) * 180;
  const needle = polarToXY(needleAngle, r - 12);

  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[240px]">
      {/* Background arc */}
      <path d={arcPath(0, 180, r - 18, r)} fill="#1e293b" />

      {/* Colored segments */}
      {segments.map((seg, i) => (
        <path key={i} d={arcPath(seg.start, seg.end, r - 18, r)} fill={seg.fill} opacity={0.85} />
      ))}

      {/* Tick marks */}
      {[-100, -50, 0, 50, 100].map(tick => {
        const ang = 180 - ((tick + 100) / 200) * 180;
        const inner = polarToXY(ang, r - 20);
        const outer = polarToXY(ang, r + 2);
        return <line key={tick} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#94a3b8" strokeWidth={1} />;
      })}

      {/* Tick labels */}
      {[-100, 0, 100].map(tick => {
        const ang = 180 - ((tick + 100) / 200) * 180;
        const pos = polarToXY(ang, r + 12);
        return (
          <text key={tick} x={pos.x} y={pos.y} textAnchor="middle" fill="#64748b" fontSize={7} fontFamily="monospace">
            {tick}
          </text>
        );
      })}

      {/* Needle */}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y}
        stroke="#f1f5f9" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill="#f1f5f9" />

      {/* Score label */}
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#f1f5f9" fontSize={11} fontFamily="monospace" fontWeight="bold">
        {score > 0 ? `+${score}` : score}
      </text>
    </svg>
  );
}

// ── Asset sentiment card ───────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: SymbolSentiment }) {
  const lbl   = LABEL_CONFIG[asset.label];
  const sig   = SIGNAL_CONFIG[asset.signal];
  const SigIcon = sig.icon;

  // Bar: position score on -100…+100 axis (0–100% width, 50% = neutral)
  const barFill   = Math.max(0, Math.min(100, (asset.score + 100) / 2));
  const barCenter = 50;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base">{asset.displayName}</span>
          <span className={`text-[10px] font-mono font-bold ${lbl.color}`}>{asset.score > 0 ? "+" : ""}{asset.score}</span>
        </div>
        <div className={`flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-lg border ${sig.bg}`}>
          <SigIcon className={`w-3 h-3 ${sig.color}`} />
          <span className={sig.color}>{asset.signal}</span>
        </div>
      </div>

      {/* Sentiment bar -100 → +100 */}
      <div>
        <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden relative">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600 z-10" />
          {/* Fill */}
          <div
            className={`absolute h-full rounded-full transition-all ${scoreBarColor(asset.score)}`}
            style={
              asset.score >= 0
                ? { left: "50%", width: `${barFill - 50}%` }
                : { left: `${barFill}%`, width: `${50 - barFill}%` }
            }
          />
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5 font-mono">
          <span>−100</span><span>0</span><span>+100</span>
        </div>
      </div>

      {/* Confidence adj */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Confidence adj.</span>
        <span className={`font-mono font-bold ${asset.confidenceAdj >= 0 ? "text-green-400" : "text-red-400"}`}>
          {asset.confidenceAdj >= 0 ? "+" : ""}{asset.confidenceAdj}%
        </span>
      </div>

      {/* Label pill */}
      <div className={`text-[9px] font-semibold px-2 py-1 rounded border text-center ${lbl.bg} ${lbl.border} ${lbl.color}`}>
        {lbl.label}  ·  {asset.signalStrength}
      </div>

      {/* Mini headlines */}
      <div className="space-y-1.5 pt-1 border-t border-border/20">
        {asset.headlines.slice(0, 2).map(h => (
          <div key={h.id} className="flex items-start gap-2">
            <span className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
              h.score >= 30 ? "bg-green-500/15 text-green-400" :
              h.score <= -30 ? "bg-red-500/15 text-red-400" :
              "bg-slate-700/50 text-slate-400"
            }`}>
              {h.score > 0 ? "+" : ""}{h.score}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{h.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── News headline row ──────────────────────────────────────────────────────────

function HeadlineRow({ h }: { h: Headline }) {
  const symLabel = h.symbol ? h.symbol.replace("USD", "") : "MKT";
  const isPos = h.score >= 0;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      {/* Score badge */}
      <div className={`shrink-0 w-10 text-center text-[10px] font-mono font-bold px-1 py-1 rounded border ${
        h.score >= 50  ? "bg-green-500/15 border-green-500/25 text-green-400" :
        h.score >= 20  ? "bg-lime-500/15 border-lime-500/25 text-lime-400" :
        h.score >= -20 ? "bg-yellow-500/15 border-yellow-500/25 text-yellow-400" :
        h.score >= -50 ? "bg-orange-500/15 border-orange-500/25 text-orange-400" :
        "bg-red-500/15 border-red-500/25 text-red-400"
      }`}>
        {isPos ? "+" : ""}{h.score}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-200 leading-snug mb-1">{h.title}</div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span>{h.source}</span>
          <span>·</span>
          <span className={`font-mono px-1.5 py-0.5 rounded ${
            h.symbol ? "bg-primary/10 text-primary/70" : "bg-slate-700/40 text-slate-400"
          }`}>{symLabel}</span>
          <span>·</span>
          <Clock className="w-2.5 h-2.5" />
          <span>{timeAgo(h.publishedAt)}</span>
        </div>
      </div>

      {/* Magnitude dot */}
      <div className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
        h.magnitude === "high" ? (isPos ? "bg-green-500" : "bg-red-500") :
        h.magnitude === "medium" ? (isPos ? "bg-lime-500" : "bg-orange-500") :
        "bg-slate-600"
      }`} />
    </div>
  );
}

// ── Confidence integration panel ───────────────────────────────────────────────

function ConfidencePanel({ assets }: { assets: SymbolSentiment[] }) {
  const BASE = 60;  // illustrative base AI confidence

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Confidence Integration
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">How sentiment adjusts AI signal confidence</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {assets.map(asset => {
          const adj     = asset.confidenceAdj;
          const adjusted = Math.max(5, Math.min(99, BASE + adj));
          const sig     = SIGNAL_CONFIG[asset.signal];
          const SigIcon = sig.icon;
          const aligned = asset.signal === "BULLISH";   // vs assumed BUY signal

          return (
            <div key={asset.symbol} className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold">{asset.displayName}</span>
                <div className={`flex items-center gap-1 ${sig.color}`}>
                  <SigIcon className="w-3 h-3" />
                  <span className="text-[9px]">{asset.signal}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">{BASE}%</span>
                  <span className="text-muted-foreground">base</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <div className={`flex items-center gap-0.5 ${adj >= 0 ? "text-green-400" : "text-red-400"}`}>
                  <span>{adj >= 0 ? "+" : ""}{adj}%</span>
                  <span className="text-[8px] text-muted-foreground">sentiment</span>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-bold text-foreground">{adjusted}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${adjusted >= 65 ? "bg-green-500" : adjusted >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${adjusted}%` }}
                />
              </div>

              <div className={`text-[8px] font-mono ${aligned ? "text-green-400" : "text-orange-400"}`}>
                {aligned ? "✓ Sentiment aligned with BUY signal" : "⚠ Sentiment diverges from BUY signal"}
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t border-border/30 text-[9px] text-muted-foreground leading-relaxed">
          Base confidence of {BASE}% shown for illustration. Live integration applies per-symbol adjustment to AI decision engine output.
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Sentiment() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<SentimentOverview>({
    queryKey: ["/sentiment/overview"],
    queryFn: () => authFetch("/api/sentiment/overview").then(r => r.json()),
    refetchInterval: 5 * 60 * 1000,   // refresh every 5 minutes
  });

  const market  = data?.market;
  const assets  = data?.assets ?? [];
  const allNews = data?.allNews ?? [];

  const marketCfg = market ? LABEL_CONFIG[market.label] : null;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Sentiment AI</h1>
            <p className="text-[11px] text-muted-foreground">News scoring · Market sentiment · AI confidence integration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2.5 py-1.5 rounded-lg bg-card border border-border/40">
            <RefreshCw className="w-3 h-3" />
            <span>Updates every 5 min</span>
          </div>
          <Button variant="outline" size="sm" className="gap-2 text-xs"
            onClick={() => qc.invalidateQueries({ queryKey: ["/sentiment/overview"] })}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Badge variant="outline" className="font-mono text-[10px] px-3 py-1">v1.0 · MODULE 14</Badge>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading sentiment data...
        </div>
      )}

      {data && (
        <>
          {/* ── Market composite banner ── */}
          <div className={`rounded-xl border p-5 ${marketCfg?.bg} ${marketCfg?.border}`}>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <SentimentGauge score={market!.composite} />
                <div className="text-[10px] text-muted-foreground mt-1">Market Sentiment Score</div>
              </div>

              {/* Labels */}
              <div className="space-y-2">
                <div className={`text-2xl font-bold ${marketCfg?.color}`}>{marketCfg?.label}</div>
                <div className="text-sm text-slate-300 leading-relaxed max-w-sm">{market!.description}</div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  <span>Composite: <span className={`font-mono font-bold ${marketCfg?.color}`}>{market!.composite > 0 ? "+" : ""}{market!.composite}</span></span>
                  <span>Fear & Greed: <span className="font-mono font-bold text-foreground">{market!.fearGreed}/100</span></span>
                </div>
              </div>

              {/* Fear & Greed gauge */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#1e293b" strokeWidth="8" />
                    <circle
                      cx="40" cy="40" r="30" fill="none"
                      stroke={market!.fearGreed >= 60 ? "#22c55e" : market!.fearGreed >= 40 ? "#eab308" : "#ef4444"}
                      strokeWidth="8"
                      strokeDasharray={`${market!.fearGreed / 100 * 188.5} 188.5`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-base font-bold font-mono ${marketCfg?.color}`}>{market!.fearGreed}</span>
                  </div>
                </div>
                <div className="text-[9px] text-muted-foreground text-center">Fear & Greed<br />Index</div>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

            {/* Left: asset cards + news */}
            <div className="space-y-5">
              {/* Asset sentiment cards */}
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Per-Asset Sentiment
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {assets.map(asset => <AssetCard key={asset.symbol} asset={asset} />)}
                </div>
              </div>

              {/* News feed */}
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-primary" /> Sentiment-Scored Headlines
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">{allNews.length} articles</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="max-h-[520px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
                    {allNews.map(h => <HeadlineRow key={h.id} h={h} />)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: confidence integration + signal guide */}
            <div className="space-y-4">
              <ConfidencePanel assets={assets} />

              {/* Signal interpretation guide */}
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" /> Signal Scale
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {[
                    { range: "+60 to +100", label: "Extreme Greed",  adj: "+20%", color: "text-green-400",  dot: "bg-green-500"  },
                    { range: "+20 to +60",  label: "Greed",          adj: "+10%", color: "text-lime-400",   dot: "bg-lime-500"   },
                    { range: " 0 to +20",   label: "Mild Positive",  adj: "+5%",  color: "text-yellow-400", dot: "bg-yellow-500" },
                    { range: "-20 to  0",   label: "Mild Negative",  adj: "−5%",  color: "text-orange-400", dot: "bg-orange-500" },
                    { range: "-60 to -20",  label: "Fear",           adj: "−10%", color: "text-orange-400", dot: "bg-orange-500" },
                    { range: "-100 to -60", label: "Extreme Fear",   adj: "−20%", color: "text-red-400",    dot: "bg-red-500"    },
                  ].map(row => (
                    <div key={row.range} className="flex items-center gap-2 text-[10px]">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
                      <span className={`font-mono w-24 shrink-0 ${row.color}`}>{row.range}</span>
                      <span className="text-muted-foreground flex-1">{row.label}</span>
                      <span className={`font-mono font-bold ${row.adj.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{row.adj}</span>
                    </div>
                  ))}
                  <div className="mt-3 pt-2 border-t border-border/30 text-[9px] text-muted-foreground leading-relaxed">
                    Adjustment applies when sentiment aligns with AI decision direction. Misaligned signals receive a ½ penalty instead.
                  </div>
                </CardContent>
              </Card>

              {/* Score legend */}
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-primary" /> Scoring Method
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 text-[10px] text-muted-foreground space-y-2 leading-relaxed">
                  <p>Each headline is scored −100 to +100 based on language and market impact. Scores are aggregated per asset (weighted average) and refreshed every 5 minutes.</p>
                  <p>Market composite = 70% asset average + 30% macro headlines.</p>
                  <p className="text-[9px] text-muted-foreground/60 italic">Powered by curated news dataset with live time-decay weighting.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
