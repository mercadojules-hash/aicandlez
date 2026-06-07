import { RegistryView } from "@/components/RegistryView";
import { Badge } from "@/components/ui/badge";
import {
  useFindings,
  useCreateFinding,
  useUpdateFinding,
  useDeleteFinding,
  useBusinesses,
  useProjects,
} from "@/hooks/useJarvisApi";

const NONE = "__none__";

const SEVERITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

const STATUSES = [
  { label: "Open", value: "open" },
  { label: "Investigating", value: "investigating" },
  { label: "Resolved", value: "resolved" },
  { label: "Dismissed", value: "dismissed" },
];

function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "critical"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : severity === "high"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : severity === "low"
          ? "border-border bg-muted text-muted-foreground"
          : "border-blue-500/30 bg-blue-500/10 text-blue-500";
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs capitalize ${tone}`}
    >
      {severity}
    </span>
  );
}

export default function Findings() {
  const { data, isLoading, isError } = useFindings();
  const { data: businesses } = useBusinesses();
  const { data: projects } = useProjects();
  const create = useCreateFinding();
  const update = useUpdateFinding();
  const remove = useDeleteFinding();

  const optionsOf = (list: { id: string; name: string }[] | undefined) => [
    { label: "Unassigned", value: NONE },
    ...(list ?? []).map((x) => ({ label: x.name, value: x.id })),
  ];

  const resolveId = (v: string) => (v && v !== NONE ? v : null);
  const parseTags = (v: string) =>
    v
      ? v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : null;
  const parseConfidence = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : undefined;
  };

  return (
    <RegistryView
      title="Findings"
      description="Material observations surfaced from across the business — risks, anomalies, and opportunities."
      entityLabel="Finding"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "title", label: "Finding", render: (r) => <span className="font-medium">{r.title}</span> },
        {
          key: "category",
          label: "Category",
          render: (r) => (
            <Badge variant="outline" className="capitalize">
              {r.category}
            </Badge>
          ),
        },
        {
          key: "severity",
          label: "Severity",
          render: (r) => <SeverityBadge severity={r.severity} />,
        },
        {
          key: "confidence",
          label: "Confidence",
          render: (r) => <span className="text-muted-foreground">{r.confidence}%</span>,
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span className="text-muted-foreground capitalize">{r.status}</span>
          ),
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Churn spiking in EMEA" },
        { name: "summary", label: "Summary", type: "textarea", placeholder: "One-line executive summary" },
        { name: "detail", label: "Detail", type: "textarea" },
        { name: "category", label: "Category", defaultValue: "general", placeholder: "e.g. revenue, risk, ops" },
        { name: "severity", label: "Severity", type: "select", defaultValue: "medium", options: SEVERITIES },
        { name: "confidence", label: "Confidence (0-100)", defaultValue: "50", placeholder: "50" },
        { name: "source", label: "Source", placeholder: "e.g. analytics, board review" },
        { name: "businessId", label: "Business", type: "select", defaultValue: NONE, options: optionsOf(businesses) },
        { name: "projectId", label: "Project", type: "select", defaultValue: NONE, options: optionsOf(projects) },
        { name: "tags", label: "Tags", placeholder: "comma, separated, tags" },
        { name: "status", label: "Status", type: "select", defaultValue: "open", options: STATUSES },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        summary: r.summary ?? "",
        detail: r.detail ?? "",
        category: r.category,
        severity: r.severity,
        confidence: String(r.confidence),
        source: r.source ?? "",
        businessId: r.businessId ?? NONE,
        projectId: r.projectId ?? NONE,
        tags: (r.tags ?? []).join(", "),
        status: r.status,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          summary: v.summary || null,
          detail: v.detail || null,
          category: v.category || "general",
          severity: v.severity,
          confidence: parseConfidence(v.confidence),
          source: v.source || null,
          businessId: resolveId(v.businessId),
          projectId: resolveId(v.projectId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          summary: v.summary || null,
          detail: v.detail || null,
          category: v.category || "general",
          severity: v.severity,
          confidence: parseConfidence(v.confidence),
          source: v.source || null,
          businessId: resolveId(v.businessId),
          projectId: resolveId(v.projectId),
          tags: parseTags(v.tags),
          status: v.status,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
