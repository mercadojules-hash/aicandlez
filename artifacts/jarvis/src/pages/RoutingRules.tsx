import { useState } from "react";
import { Compass, Play } from "lucide-react";
import { toast } from "sonner";
import { RegistryView, StatusBadge } from "@/components/RegistryView";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
  useTestRoute,
  type JarvisRoutingRule,
  type JarvisRouteResult,
} from "@/hooks/useJarvisApi";

const AGENT_TYPES = [
  { label: "Chief of Staff", value: "chief_of_staff" },
  { label: "Operations", value: "operations" },
  { label: "Risk", value: "risk" },
  { label: "QA", value: "qa" },
  { label: "Memory", value: "memory" },
];

const MATCH_TYPES = [
  { label: "Any", value: "any" },
  { label: "Command", value: "command" },
  { label: "Category", value: "category" },
  { label: "Capability", value: "capability" },
  { label: "Keyword", value: "keyword" },
];

function RouteTester() {
  const test = useTestRoute();
  const [matchType, setMatchType] = useState("command");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<JarvisRouteResult | null>(null);

  async function run() {
    const input: Record<string, unknown> = {};
    if (matchType === "command") input.verb = value;
    else if (matchType === "category") input.category = value;
    else if (matchType === "capability") input.capability = value;
    else if (matchType === "keyword") input.text = value;
    try {
      const r = await test.mutateAsync(input);
      setResult(r.result);
    } catch {
      toast.error("Route test failed");
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Route Tester</h2>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Match Type</Label>
          <Select value={matchType} onValueChange={setMatchType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_TYPES.filter((m) => m.value !== "any").map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label>Value</Label>
          <Input
            value={value}
            placeholder="e.g. assess_risk"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button onClick={run} disabled={!value.trim() || test.isPending}>
          <Play className="mr-1.5 h-4 w-4" /> Test
        </Button>
      </div>
      {result && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary"
            >
              {result.targetAgentType}
            </Badge>
            {result.fallback && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-500"
              >
                fallback
              </Badge>
            )}
            {result.chainId && (
              <span className="text-xs text-muted-foreground">
                chain {result.chainId.slice(0, 8)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{result.reason}</p>
        </div>
      )}
    </Card>
  );
}

export default function RoutingRules() {
  const { data, isLoading, isError } = useRoutingRules();
  const create = useCreateRoutingRule();
  const update = useUpdateRoutingRule();
  const remove = useDeleteRoutingRule();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <RouteTester />
      <RegistryView
        title="Routing Rules"
        description="Deterministic command-to-agent routing, evaluated by priority."
        entityLabel="Rule"
        items={data}
        isLoading={isLoading}
        isError={isError}
        isMutating={create.isPending || update.isPending}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (r) => <span className="font-medium">{r.name}</span>,
          },
          {
            key: "match",
            label: "Match",
            render: (r) => (
              <span className="font-mono text-xs text-muted-foreground">
                {r.matchType}
                {r.matchValue ? `: ${r.matchValue}` : ""}
              </span>
            ),
          },
          {
            key: "target",
            label: "Target",
            render: (r) => (
              <span className="text-muted-foreground">
                {r.targetAgentType ?? r.targetAgentId ?? r.chainId ?? "—"}
              </span>
            ),
          },
          {
            key: "priority",
            label: "Priority",
            render: (r) => <span>{r.priority}</span>,
          },
          {
            key: "enabled",
            label: "Status",
            render: (r) => (
              <StatusBadge status={r.enabled ? "active" : "disabled"} />
            ),
          },
        ]}
        fields={[
          { name: "name", label: "Name", required: true, placeholder: "e.g. Risk commands" },
          {
            name: "matchType",
            label: "Match Type",
            type: "select",
            defaultValue: "command",
            options: MATCH_TYPES,
          },
          {
            name: "matchValue",
            label: "Match Value",
            placeholder: "e.g. assess_risk (blank for any)",
          },
          {
            name: "targetAgentType",
            label: "Target Agent",
            type: "select",
            defaultValue: "chief_of_staff",
            options: AGENT_TYPES,
          },
          {
            name: "fallbackAgentType",
            label: "Fallback Agent",
            type: "select",
            defaultValue: "",
            options: [{ label: "None", value: "" }, ...AGENT_TYPES],
          },
          { name: "priority", label: "Priority", placeholder: "100", defaultValue: "100" },
          {
            name: "enabled",
            label: "Enabled",
            type: "select",
            defaultValue: "true",
            options: [
              { label: "Enabled", value: "true" },
              { label: "Disabled", value: "false" },
            ],
          },
          { name: "description", label: "Description", type: "textarea" },
        ]}
        toFormValues={(r) => ({
          name: r.name,
          matchType: r.matchType,
          matchValue: r.matchValue ?? "",
          targetAgentType: r.targetAgentType ?? "",
          fallbackAgentType: r.fallbackAgentType ?? "",
          priority: String(r.priority),
          enabled: r.enabled ? "true" : "false",
          description: r.description ?? "",
        })}
        onCreate={(v) =>
          create.mutateAsync({
            name: v.name,
            matchType: (v.matchType || "command") as never,
            matchValue: v.matchValue || null,
            targetAgentType: v.targetAgentType || null,
            fallbackAgentType: v.fallbackAgentType || null,
            priority: Number(v.priority) || 100,
            enabled: v.enabled !== "false",
            description: v.description || null,
          })
        }
        onUpdate={(id, v) =>
          update.mutateAsync({
            id,
            name: v.name,
            matchType: (v.matchType || "command") as never,
            matchValue: v.matchValue || null,
            targetAgentType: v.targetAgentType || null,
            fallbackAgentType: v.fallbackAgentType || null,
            priority: Number(v.priority) || 100,
            enabled: v.enabled !== "false",
            description: v.description || null,
          })
        }
        onDelete={(id) => remove.mutateAsync(id)}
      />
    </div>
  );
}
