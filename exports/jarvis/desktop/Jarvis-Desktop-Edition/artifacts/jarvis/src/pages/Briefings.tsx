import { useState } from "react";
import { Sparkles, Send, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useBriefings,
  useCreateBriefing,
  useUpdateBriefing,
  useDeleteBriefing,
  useBusinesses,
  useCognitionEnabled,
  useGenerateBriefing,
  usePublishBriefing,
  type JarvisBriefing,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const PERIODS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Ad Hoc", value: "ad_hoc" },
];

const AUDIENCES = [
  { label: "Executive", value: "executive" },
  { label: "Board", value: "board" },
  { label: "Operations", value: "operations" },
  { label: "Investors", value: "investors" },
];

const STATUSES = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
];

function groundingTone(score: number | null): string {
  if (score === null) return "border-border bg-muted text-muted-foreground";
  if (score >= 75) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  if (score >= 60) return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function CognitionGenerateCard() {
  const generate = useGenerateBriefing();
  const { data: businesses } = useBusinesses();
  const [query, setQuery] = useState("");
  const [instructions, setInstructions] = useState("");
  const [period, setPeriod] = useState("weekly");
  const [audience, setAudience] = useState("executive");
  const [businessId, setBusinessId] = useState(NONE);

  async function onGenerate() {
    if (!query.trim()) return;
    try {
      const res = await generate.mutateAsync({
        query: query.trim(),
        instructions: instructions.trim() || null,
        period,
        audience,
        businessId: businessId !== NONE ? businessId : null,
      });
      if (res.ok && res.briefing) {
        toast.success(
          `Draft synthesized — grounding ${res.groundingScore ?? "—"} · ${res.citations.length} citations`,
        );
        setQuery("");
        setInstructions("");
      } else if (res.status === "budget_exceeded") {
        toast.error("Cognition budget exceeded — generation blocked.");
      } else if (res.status === "disabled") {
        toast.error("Cognition is disabled.");
      } else {
        toast.error(
          res.reason
            ? `Cognition degraded — ${res.reason}`
            : "Cognition degraded — no draft produced.",
        );
      }
    } catch {
      toast.error("Generation failed — advisory plane stayed inert.");
    }
  }

  return (
    <Card className="space-y-4 border-primary/20 bg-primary/[0.03] p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Synthesize with Cognition</h2>
          <p className="text-xs text-muted-foreground">
            Advisory only — produces a grounded draft. Publishing stays governed.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cog-query">What should this briefing cover?</Label>
          <Input
            id="cog-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Summarize Q2 operational risk across all businesses"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cog-instructions">Additional instructions (optional)</Label>
          <Textarea
            id="cog-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Tone, focus areas, length…"
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Business scope</Label>
          <Select value={businessId} onValueChange={setBusinessId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All businesses</SelectItem>
              {(businesses ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onGenerate} disabled={!query.trim() || generate.isPending}>
          {generate.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          Generate Draft
        </Button>
      </div>
    </Card>
  );
}

export default function Briefings() {
  const { data, isLoading, isError } = useBriefings();
  const { data: businesses } = useBusinesses();
  const { isAdmin } = useUserRole();
  const { data: cognitionEnabled } = useCognitionEnabled();
  const create = useCreateBriefing();
  const update = useUpdateBriefing();
  const remove = useDeleteBriefing();
  const publish = usePublishBriefing();

  const businessOptions = [
    { label: "Unassigned", value: NONE },
    ...(businesses ?? []).map((x) => ({ label: x.name, value: x.id })),
  ];

  const resolveId = (v: string) => (v && v !== NONE ? v : null);
  const parseTags = (v: string) =>
    v
      ? v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : null;

  async function onPublish(row: JarvisBriefing) {
    try {
      const res = await publish.mutateAsync(row.id);
      if (res.decision === "allow") {
        toast.success("Briefing published.");
      } else {
        toast.warning(
          `Publish requires approval — ${res.reason} (grounding ${
            res.groundingScore ?? "—"
          } < ${res.threshold}). Approval ${res.approvalId ? "created" : "pending"}.`,
        );
      }
    } catch {
      toast.error("Publish failed — you may lack the required role.");
    }
  }

  const showCognition = Boolean(isAdmin && cognitionEnabled);

  return (
    <div className="space-y-6">
      {showCognition ? (
        <div className="mx-auto max-w-6xl">
          <CognitionGenerateCard />
        </div>
      ) : null}

      <RegistryView
        title="Executive Briefings"
        description="Periodic executive summaries — synthesized findings, insights, and recommendations."
        entityLabel="Briefing"
        items={data}
        isLoading={isLoading}
        isError={isError}
        isMutating={create.isPending || update.isPending}
        columns={[
          {
            key: "title",
            label: "Briefing",
            render: (r) => <span className="font-medium">{r.title}</span>,
          },
          {
            key: "sourceMode",
            label: "Source",
            render: (r) =>
              r.sourceMode === "cognition" ? (
                <Badge className="gap-1 border-primary/30 bg-primary/10 text-primary">
                  <Sparkles className="h-3 w-3" /> Cognition
                </Badge>
              ) : (
                <Badge variant="outline">Manual</Badge>
              ),
          },
          {
            key: "groundingScore",
            label: "Grounding",
            render: (r) => (
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${groundingTone(
                  r.groundingScore,
                )}`}
              >
                {r.groundingScore === null ? "—" : r.groundingScore}
              </span>
            ),
          },
          {
            key: "period",
            label: "Period",
            render: (r) => (
              <Badge variant="outline" className="capitalize">
                {r.period.replace(/_/g, " ")}
              </Badge>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${
                  r.status === "published"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {r.status}
              </span>
            ),
          },
          {
            key: "publish",
            label: "Publish",
            render: (r) =>
              r.status !== "published" && isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={publish.isPending}
                  onClick={() => onPublish(r)}
                >
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Publish
                </Button>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]}
        fields={[
          { name: "title", label: "Title", required: true, placeholder: "e.g. Q2 Executive Briefing" },
          { name: "summary", label: "Summary", type: "textarea", placeholder: "Headline takeaways" },
          { name: "content", label: "Content", type: "textarea" },
          { name: "period", label: "Period", type: "select", defaultValue: "weekly", options: PERIODS },
          { name: "audience", label: "Audience", type: "select", defaultValue: "executive", options: AUDIENCES },
          { name: "businessId", label: "Business", type: "select", defaultValue: NONE, options: businessOptions },
          { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
          { name: "status", label: "Status", type: "select", defaultValue: "draft", options: STATUSES },
        ]}
        toFormValues={(r) => ({
          title: r.title,
          summary: r.summary ?? "",
          content: r.content ?? "",
          period: r.period,
          audience: r.audience,
          businessId: r.businessId ?? NONE,
          tags: (r.tags ?? []).join(", "),
          status: r.status,
        })}
        onCreate={(v) =>
          create.mutateAsync({
            title: v.title,
            summary: v.summary || null,
            content: v.content || null,
            period: v.period,
            audience: v.audience,
            businessId: resolveId(v.businessId),
            tags: parseTags(v.tags),
            status: v.status,
          })
        }
        onUpdate={(id, v) =>
          update.mutateAsync({
            id,
            title: v.title,
            summary: v.summary || null,
            content: v.content || null,
            period: v.period,
            audience: v.audience,
            businessId: resolveId(v.businessId),
            tags: parseTags(v.tags),
            status: v.status,
          })
        }
        onDelete={(id) => remove.mutateAsync(id)}
      />
    </div>
  );
}
