import {
  ShieldCheck,
  Gauge,
  CheckSquare,
  Scale,
  ScrollText,
  Activity,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useGovernanceOverview,
  useApprovalDecision,
  type JarvisApproval,
  type JarvisBudget,
  type JarvisAgentTrust,
  type JarvisPolicyEvaluation,
} from "@/hooks/useJarvisApi";

function decisionTone(decision: string): string {
  switch (decision) {
    case "allow":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "deny":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "require_approval":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function scoreTone(score: number): string {
  if (score >= 70) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  if (score >= 40) return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString();
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </Card>
  );
}

function Panel({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      <div className="max-h-[22rem] overflow-y-auto">{children}</div>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>
  );
}

function ApprovalRow({ a }: { a: JarvisApproval }) {
  const decide = useApprovalDecision();

  async function act(decision: "approve" | "reject") {
    try {
      await decide.mutateAsync({ id: a.id, decision });
      toast.success(`Approval ${decision === "approve" ? "approved" : "rejected"}`);
    } catch {
      toast.error("Decision failed — you may lack the required role");
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {a.subjectType ?? "—"} · {fmt(a.createdAt)}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-emerald-500 hover:text-emerald-500"
          disabled={decide.isPending}
          onClick={() => act("approve")}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          disabled={decide.isPending}
          onClick={() => act("reject")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BudgetRow({ b }: { b: JarvisBudget }) {
  const pct = b.limitCount > 0 ? Math.min(100, (b.consumed / b.limitCount) * 100) : 0;
  const exceeded = b.consumed >= b.limitCount;
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{b.name}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {b.consumed}/{b.limitCount}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            exceeded ? "bg-destructive" : pct > 75 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TrustRow({ t }: { t: JarvisAgentTrust }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", scoreTone(t.score))}>
        {t.score}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {t.agentName ?? t.agentType ?? "—"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {t.successfulRuns}/{t.totalRuns} ok · {t.deniedActions} denied
        </div>
      </div>
    </div>
  );
}

function EvalRow({ e }: { e: JarvisPolicyEvaluation }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", decisionTone(e.decision))}>
        {e.decision}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {e.policyName ?? e.action ?? e.subjectType}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {e.agentType ?? "—"} · {e.reason ?? "—"}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {fmt(e.createdAt)}
      </div>
    </div>
  );
}

export default function Governance() {
  const { data, isLoading, isError } = useGovernanceOverview();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load governance overview.
          </p>
        </Card>
      </div>
    );
  }

  const countFor = (decision: string) =>
    data.decisionBreakdown.find((d) => d.decision === decision)?.c ?? 0;
  const allowed = countFor("allow");
  const denied = countFor("deny");
  const requireApproval = countFor("require_approval");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic policy, trust, and budget layer — every orchestration
          action is evaluated to allow, deny, or require approval.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Allowed"
          value={allowed}
          hint="recent evaluations"
          icon={ShieldCheck}
        />
        <StatCard
          label="Require Approval"
          value={requireApproval}
          hint="held for human sign-off"
          icon={CheckSquare}
        />
        <StatCard
          label="Denied"
          value={denied}
          hint="blocked by policy"
          icon={Scale}
        />
        <StatCard
          label="Pending Approvals"
          value={data.pendingApprovals.length}
          hint="awaiting decision"
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Pending Approvals"
          icon={CheckSquare}
          count={data.pendingApprovals.length}
        >
          {data.pendingApprovals.length === 0 ? (
            <Empty text="No approvals awaiting decision." />
          ) : (
            <div className="divide-y divide-border">
              {data.pendingApprovals.map((a) => (
                <ApprovalRow key={a.id} a={a} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Budgets" icon={Gauge} count={data.budgets.length}>
          {data.budgets.length === 0 ? (
            <Empty text="No budgets configured." />
          ) : (
            <div className="divide-y divide-border">
              {data.budgets.map((b) => (
                <BudgetRow key={b.id} b={b} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Trust Leaderboard"
          icon={ShieldCheck}
          count={data.trustLeaderboard.length}
        >
          {data.trustLeaderboard.length === 0 ? (
            <Empty text="No trust scores computed yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.trustLeaderboard.map((t) => (
                <TrustRow key={t.id} t={t} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent Evaluations"
          icon={ScrollText}
          count={data.recentEvaluations.length}
        >
          {data.recentEvaluations.length === 0 ? (
            <Empty text="No policy evaluations yet." />
          ) : (
            <div className="divide-y divide-border">
              {data.recentEvaluations.map((e) => (
                <EvalRow key={e.id} e={e} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
