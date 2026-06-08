import { useState } from "react";
import { ShieldCheck, Play } from "lucide-react";
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
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  useTestPolicy,
  type JarvisGovernanceResult,
} from "@/hooks/useJarvisApi";

const SCOPE_TYPES = [
  { label: "Global", value: "global" },
  { label: "Agent Type", value: "agent_type" },
  { label: "Action", value: "action" },
  { label: "Verb", value: "verb" },
  { label: "Category", value: "category" },
  { label: "Workflow", value: "workflow" },
];

const EFFECTS = [
  { label: "Allow", value: "allow" },
  { label: "Deny", value: "deny" },
  { label: "Require Approval", value: "require_approval" },
];

const SUBJECT_TYPES = [
  { label: "Command", value: "command" },
  { label: "Delegation", value: "delegation" },
  { label: "Workflow Step", value: "workflow_step" },
  { label: "Escalation", value: "escalation" },
];

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

function PolicyTester() {
  const test = useTestPolicy();
  const [subjectType, setSubjectType] = useState("command");
  const [agentType, setAgentType] = useState("");
  const [action, setAction] = useState("");
  const [verb, setVerb] = useState("");
  const [result, setResult] = useState<JarvisGovernanceResult | null>(null);

  async function run() {
    try {
      const r = await test.mutateAsync({
        subjectType: subjectType as never,
        agentType: agentType || null,
        action: action || null,
        verb: verb || null,
      });
      setResult(r.result);
    } catch {
      toast.error("Policy test failed");
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Policy Tester</h2>
        <span className="text-xs text-muted-foreground">
          dry-run — never executes
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Select value={subjectType} onValueChange={setSubjectType}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_TYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Agent Type</Label>
          <Input
            className="w-40"
            value={agentType}
            placeholder="e.g. risk"
            onChange={(e) => setAgentType(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Action</Label>
          <Input
            className="w-40"
            value={action}
            placeholder="e.g. assess_risk"
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Verb</Label>
          <Input
            className="w-40"
            value={verb}
            placeholder="e.g. delegate"
            onChange={(e) => setVerb(e.target.value)}
          />
        </div>
        <Button onClick={run} disabled={test.isPending}>
          <Play className="mr-1.5 h-4 w-4" /> Evaluate
        </Button>
      </div>
      {result && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={decisionTone(result.decision)}>
              {result.decision}
            </Badge>
            {result.policyName && (
              <span className="text-xs text-muted-foreground">
                matched: {result.policyName}
              </span>
            )}
            {result.trustScore != null && (
              <span className="text-xs text-muted-foreground">
                trust {result.trustScore}
              </span>
            )}
            {result.decision === "require_approval" && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-500"
              >
                role: {result.requireApprovalRole}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{result.reason}</p>
          {result.matchedBudget && (
            <p className="mt-1 text-xs text-muted-foreground">
              budget {result.matchedBudget.name}:{" "}
              {result.matchedBudget.consumed}/{result.matchedBudget.limitCount}
              {result.matchedBudget.exceeded ? " (exceeded)" : ""}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Policies() {
  const { data, isLoading, isError } = usePolicies();
  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const remove = useDeletePolicy();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PolicyTester />
      <RegistryView
        title="Governance Policies"
        description="Deterministic allow / deny / require-approval rules. Precedence: deny > require_approval > allow, then priority, scope specificity, age."
        entityLabel="Policy"
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
            key: "scope",
            label: "Scope",
            render: (r) => (
              <span className="font-mono text-xs text-muted-foreground">
                {r.scopeType}
                {r.scopeValue ? `: ${r.scopeValue}` : ""}
              </span>
            ),
          },
          {
            key: "effect",
            label: "Effect",
            render: (r) => (
              <Badge variant="outline" className={decisionTone(r.effect)}>
                {r.effect}
              </Badge>
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
          {
            name: "name",
            label: "Name",
            required: true,
            placeholder: "e.g. Block risky escalations",
          },
          {
            name: "scopeType",
            label: "Scope Type",
            type: "select",
            defaultValue: "global",
            options: SCOPE_TYPES,
          },
          {
            name: "scopeValue",
            label: "Scope Value",
            placeholder: "e.g. risk (blank for global)",
          },
          {
            name: "effect",
            label: "Effect",
            type: "select",
            defaultValue: "allow",
            options: EFFECTS,
          },
          {
            name: "requireApprovalRole",
            label: "Approval Role",
            type: "select",
            defaultValue: "admin",
            options: [
              { label: "Admin", value: "admin" },
              { label: "Super Admin", value: "super-admin" },
            ],
          },
          {
            name: "minTrustScore",
            label: "Min Trust Score",
            placeholder: "0-100 (blank = no requirement)",
          },
          {
            name: "priority",
            label: "Priority",
            placeholder: "100",
            defaultValue: "100",
          },
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
          scopeType: r.scopeType,
          scopeValue: r.scopeValue ?? "",
          effect: r.effect,
          requireApprovalRole: r.requireApprovalRole,
          minTrustScore:
            r.conditions?.minTrustScore != null
              ? String(r.conditions.minTrustScore)
              : "",
          priority: String(r.priority),
          enabled: r.enabled ? "true" : "false",
          description: r.description ?? "",
        })}
        onCreate={(v) =>
          create.mutateAsync({
            name: v.name,
            scopeType: (v.scopeType || "global") as never,
            scopeValue: v.scopeValue || null,
            effect: (v.effect || "allow") as never,
            requireApprovalRole: v.requireApprovalRole || "admin",
            conditions: v.minTrustScore
              ? { minTrustScore: Number(v.minTrustScore) }
              : null,
            priority: Number(v.priority) || 100,
            enabled: v.enabled !== "false",
            description: v.description || null,
          })
        }
        onUpdate={(id, v) =>
          update.mutateAsync({
            id,
            name: v.name,
            scopeType: (v.scopeType || "global") as never,
            scopeValue: v.scopeValue || null,
            effect: (v.effect || "allow") as never,
            requireApprovalRole: v.requireApprovalRole || "admin",
            conditions: v.minTrustScore
              ? { minTrustScore: Number(v.minTrustScore) }
              : null,
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
