import { useMemo, useState } from "react";
import {
  History,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  FileText,
  Camera,
  Database,
  Trash2,
  CreditCard,
  ScrollText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  useHistoricalPeriod,
  useHistoricalComparison,
  useHistoricalSnapshots,
  useHistoricalChanges,
  useHistoricalSubscriptions,
  useHistoricalIngest,
  useCaptureSnapshot,
  useBackfillSnapshots,
  useReports,
  useGenerateReport,
  useDeleteReport,
  type HistoricalPeriodStats,
} from "@/hooks/useJarvisApi";

// ─────────────────────────────────────────────────────────────────────────────
// AICandlez Historical Intelligence surface. Read-only LIVE analytics +
// executive report generation. Every value that is not reliably derivable is
// rendered as a dash — never a fabricated/estimated number.
// ─────────────────────────────────────────────────────────────────────────────

const DASH = "—";

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFor(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: dayStr(start), end: dayStr(end) };
}

function priorRangeFor(days: number): { start: string; end: string } {
  const curStart = new Date(Date.now() - (days - 1) * 86400000);
  const prevEnd = new Date(curStart.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return { start: dayStr(prevStart), end: dayStr(prevEnd) };
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

function fmtPct(n: number | null | undefined, scale01 = false): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const v = scale01 ? n * 100 : n;
  return `${v.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}

function PeriodStatGrid({ stats }: { stats: HistoricalPeriodStats }) {
  // Fail-safe: a degraded read carries placeholder zeros from the server. Never
  // present them as real performance — render dashes for every metric instead.
  const degraded = stats.degraded;
  const usd = (n: number | null | undefined) => (degraded ? DASH : fmtUsd(n));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Closed Trades"
        value={degraded ? DASH : fmtNum(stats.closedTrades)}
      />
      <StatCard
        label="Win Rate"
        value={degraded ? DASH : fmtPct(stats.winRate, true)}
        hint={
          degraded
            ? undefined
            : `${fmtNum(stats.wins)}W / ${fmtNum(stats.losses)}L`
        }
      />
      <StatCard label="Realized P&L" value={usd(stats.realizedPnlUsd)} />
      <StatCard
        label="Profit Factor"
        value={
          degraded || stats.profitFactor == null
            ? DASH
            : stats.profitFactor.toFixed(2)
        }
      />
      <StatCard label="Gross Profit" value={usd(stats.grossProfitUsd)} />
      <StatCard label="Gross Loss" value={usd(stats.grossLossUsd)} />
      <StatCard label="Avg Win" value={usd(stats.avgWinUsd)} />
      <StatCard label="Avg Loss" value={usd(stats.avgLossUsd)} />
    </div>
  );
}

function DeltaBadge({ value, suffix }: { value: number | null; suffix: string }) {
  if (value == null || !Number.isFinite(value)) {
    return <Badge variant="outline">{DASH}</Badge>;
  }
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <Badge variant={positive ? "secondary" : "destructive"} className="gap-1">
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}
      {value.toFixed(suffix === "%" ? 1 : 2)}
      {suffix}
    </Badge>
  );
}

export default function HistoricalIntelligence() {
  const [days, setDays] = useState(30);
  const range = useMemo(() => rangeFor(days), [days]);
  const prior = useMemo(() => priorRangeFor(days), [days]);

  const period = useHistoricalPeriod(range.start, range.end);
  const comparison = useHistoricalComparison(
    range.start,
    range.end,
    prior.start,
    prior.end,
  );
  const snapshots = useHistoricalSnapshots();
  const changes = useHistoricalChanges();
  const subscriptions = useHistoricalSubscriptions();
  const reports = useReports();

  const ingest = useHistoricalIngest();
  const capture = useCaptureSnapshot();
  const backfill = useBackfillSnapshots();
  const generate = useGenerateReport();
  const removeReport = useDeleteReport();

  function runIngest() {
    ingest.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `Ingested ${r.changes} change(s)${r.degraded ? " (partial)" : ""}.`,
        ),
      onError: () => toast.error("Ingestion failed."),
    });
  }

  function runCapture() {
    capture.mutate(undefined, {
      onSuccess: () => toast.success("Snapshot captured."),
      onError: () => toast.error("Snapshot failed."),
    });
  }

  function runBackfill() {
    backfill.mutate(undefined, {
      onSuccess: (r) => toast.success(`Backfilled ${r.days} day(s).`),
      onError: () => toast.error("Backfill failed."),
    });
  }

  function runGenerate(withNarrative: boolean) {
    generate.mutate(
      {
        reportType: "executive_summary",
        start: range.start,
        end: range.end,
        compareStart: prior.start,
        compareEnd: prior.end,
        withNarrative,
      },
      {
        onSuccess: () => toast.success("Report generated."),
        onError: () => toast.error("Report generation unavailable."),
      },
    );
  }

  function runDelete(id: string) {
    removeReport.mutate(id, {
      onSuccess: () => toast.success("Report deleted."),
      onError: () => toast.error("Delete failed."),
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <History className="h-5 w-5 text-primary" /> Historical Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only LIVE trading history, growth trend, configuration changes,
            subscriptions, and executive reports. Live fills only — paper and
            simulated activity is never included.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={days === p.days ? "default" : "outline"}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trend">Growth Trend</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ── Overview: period stats + comparison ──────────────────────────── */}
        <TabsContent value="overview" className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Window {range.start} → {range.end}
          </p>
          {period.isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : period.isError || !period.data ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Period data unavailable.
            </Card>
          ) : (
            <>
              {period.data.degraded ? (
                <Badge variant="destructive">Degraded read</Badge>
              ) : null}
              <PeriodStatGrid stats={period.data} />
            </>
          )}

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> vs Prior {days} Days
            </h2>
            {comparison.isLoading ? (
              <Skeleton className="h-24" />
            ) : comparison.isError || !comparison.data ? (
              <p className="text-sm text-muted-foreground">
                Comparison unavailable.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Win rate
                  </span>
                  <DeltaBadge
                    value={comparison.data.delta.winRatePts}
                    suffix="%"
                  />
                  <span className="ml-2 text-xs text-muted-foreground">
                    Profit factor
                  </span>
                  <DeltaBadge
                    value={comparison.data.delta.profitFactor}
                    suffix=""
                  />
                  <span className="ml-2 text-xs text-muted-foreground">
                    Realized P&L
                  </span>
                  {comparison.data.current.degraded ||
                  comparison.data.previous.degraded ? (
                    <Badge variant="outline">{DASH}</Badge>
                  ) : (
                    <Badge
                      variant={
                        comparison.data.delta.realizedPnlUsd >= 0
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {comparison.data.delta.realizedPnlUsd >= 0 ? "+" : ""}
                      {fmtUsd(comparison.data.delta.realizedPnlUsd)}
                    </Badge>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {comparison.data.explanations.map((e, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {period.data && period.data.byCloseReason.length > 0 ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Exits by Reason</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Wins</TableHead>
                    <TableHead className="text-right">Losses</TableHead>
                    <TableHead className="text-right">Realized P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {period.data.byCloseReason.map((r) => (
                    <TableRow key={r.reason}>
                      <TableCell className="font-medium">{r.reason}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.trades)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.wins)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(r.losses)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.realizedPnlUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── Growth Trend: daily snapshots ────────────────────────────────── */}
        <TabsContent value="trend" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={runCapture}
              disabled={capture.isPending}
            >
              <Camera className="h-4 w-4" /> Capture Today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runBackfill}
              disabled={backfill.isPending}
            >
              <Database className="h-4 w-4" /> Backfill
            </Button>
          </div>
          {snapshots.isLoading ? (
            <Skeleton className="h-64" />
          ) : snapshots.isError ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Snapshots unavailable.
            </Card>
          ) : (snapshots.data ?? []).length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No snapshots yet. The runtime captures one per day, or capture now.
            </Card>
          ) : (
            <Card className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Cum. P&L</TableHead>
                    <TableHead className="text-right">Closed</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">PF</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Open Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(snapshots.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.snapshotDate}
                        {s.degraded ? (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px]"
                          >
                            degraded
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(s.cumulativeRealizedPnlUsd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(s.closedTrades)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(s.winRate, true)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.profitFactor == null
                          ? DASH
                          : s.profitFactor.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNum(s.activeTrades)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(s.openTradeValueUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Changes: config / risk / admin actions ───────────────────────── */}
        <TabsContent value="changes" className="space-y-4">
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={runIngest}
              disabled={ingest.isPending}
            >
              <RefreshCw className="h-4 w-4" /> Ingest into Memory
            </Button>
          </div>
          {changes.isLoading ? (
            <Skeleton className="h-64" />
          ) : changes.isError ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Change history unavailable.
            </Card>
          ) : (changes.data ?? []).length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No configuration changes recorded.
            </Card>
          ) : (
            <div className="space-y-2">
              {(changes.data ?? []).map((c) => (
                <Card key={`${c.source}-${c.id}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{c.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.actor ? `by ${c.actor}` : "system"}
                          {c.target ? ` · ${c.target}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {c.source}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(c.at)}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Subscriptions: synced Stripe mirror ──────────────────────────── */}
        <TabsContent value="subscriptions" className="space-y-4">
          {subscriptions.isLoading ? (
            <Skeleton className="h-48" />
          ) : subscriptions.isError || !subscriptions.data ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Subscription data unavailable.
            </Card>
          ) : subscriptions.data.degraded ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Subscription mirror not synced.
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                  label="Total"
                  value={fmtNum(subscriptions.data.totalSubscriptions)}
                />
                <StatCard
                  label="Active"
                  value={fmtNum(subscriptions.data.activeCount)}
                />
                <StatCard
                  label="Canceled"
                  value={fmtNum(subscriptions.data.canceledCount)}
                />
                <StatCard
                  label="Statuses"
                  value={fmtNum(subscriptions.data.byStatus.length)}
                />
              </div>
              {subscriptions.data.recent.length > 0 ? (
                <Card className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.data.recent.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="flex items-center gap-2 font-mono text-xs">
                            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                            {s.id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {fmtDateTime(s.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : null}
            </>
          )}
        </TabsContent>

        {/* ── Reports: executive report generation ─────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => runGenerate(false)}
              disabled={generate.isPending}
            >
              <FileText className="h-4 w-4" /> Generate Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runGenerate(true)}
              disabled={generate.isPending}
            >
              <FileText className="h-4 w-4" /> Generate + Narrative
            </Button>
          </div>
          {reports.isLoading ? (
            <Skeleton className="h-64" />
          ) : reports.isError ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Reports unavailable.
            </Card>
          ) : (reports.data ?? []).length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              No reports yet. Generate one from the current window.
            </Card>
          ) : (
            <div className="space-y-3">
              {(reports.data ?? []).map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        <FileText className="h-4 w-4 text-primary" />
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.periodStart ?? DASH} → {r.periodEnd ?? DASH}
                        {" · "}
                        {new Date(r.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {r.reportType.replace(/_/g, " ")}
                      </Badge>
                      {r.groundingScore != null ? (
                        <Badge variant="secondary">
                          grounded {r.groundingScore}
                        </Badge>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => runDelete(r.id)}
                        disabled={removeReport.isPending}
                        aria-label="Delete report"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {r.narrative ? (
                    <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
                      {r.narrative}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
