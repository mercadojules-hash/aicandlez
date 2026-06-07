import { useState } from "react";
import { Plus, Trash2, Play, Workflow as WorkflowIcon, Pencil, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useWorkflowsFull,
  useCreateWorkflowFull,
  useUpdateWorkflowFull,
  useDeleteWorkflow,
  useExecuteWorkflow,
  useWorkflowRuns,
  type JarvisWorkflowFull,
  type JarvisWorkflowStepDef,
  type JarvisWorkflowRun,
} from "@/hooks/useJarvisApi";

const AGENT_TYPES = [
  { label: "Chief of Staff", value: "chief_of_staff" },
  { label: "Operations", value: "operations" },
  { label: "Risk", value: "risk" },
  { label: "QA", value: "qa" },
  { label: "Memory", value: "memory" },
];

function runTone(status: string): string {
  switch (status) {
    case "completed":
    case "succeeded":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "running":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500";
    case "queued":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

interface DraftStep {
  key: string;
  agentType: string;
  action: string;
  dependsOn: string;
}

function StepDagBuilder({
  steps,
  setSteps,
}: {
  steps: DraftStep[];
  setSteps: (s: DraftStep[]) => void;
}) {
  function add() {
    setSteps([
      ...steps,
      {
        key: `step_${steps.length + 1}`,
        agentType: "chief_of_staff",
        action: "status",
        dependsOn: "",
      },
    ]);
  }
  function update(i: number, patch: Partial<DraftStep>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function remove(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Steps (DAG)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Step
        </Button>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No steps. Add steps and reference earlier step keys in "depends on".
        </p>
      ) : (
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 rounded-md border border-border bg-muted/30 p-2"
            >
              <div className="space-y-1">
                <Label className="text-[10px]">Key</Label>
                <Input
                  className="h-8"
                  value={s.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Agent</Label>
                <Select
                  value={s.agentType}
                  onValueChange={(v) => update(i, { agentType: v })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Action</Label>
                <Input
                  className="h-8"
                  value={s.action}
                  onChange={(e) => update(i, { action: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Depends on (csv)</Label>
                <Input
                  className="h-8"
                  value={s.dependsOn}
                  placeholder="step_1,step_2"
                  onChange={(e) => update(i, { dependsOn: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: JarvisWorkflowFull | null;
}) {
  const create = useCreateWorkflowFull();
  const update = useUpdateWorkflowFull();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [enabled, setEnabled] = useState("true");
  const [steps, setSteps] = useState<DraftStep[]>([]);

  function hydrate() {
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setTrigger(editing.trigger);
      setEnabled(editing.enabled ? "true" : "false");
      setSteps(
        (editing.definition?.steps ?? []).map((s) => ({
          key: s.key,
          agentType: s.agentType,
          action: s.action,
          dependsOn: (s.dependsOn ?? []).join(","),
        })),
      );
    } else {
      setName("");
      setDescription("");
      setTrigger("manual");
      setEnabled("true");
      setSteps([]);
    }
  }

  async function submit() {
    const defSteps: JarvisWorkflowStepDef[] = steps.map((s) => ({
      key: s.key.trim(),
      agentType: s.agentType,
      action: s.action.trim(),
      dependsOn: s.dependsOn
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
    }));
    const payload = {
      name,
      description: description || null,
      trigger,
      enabled: enabled !== "false",
      definition: { steps: defSteps },
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      toast.error("Could not save workflow");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) hydrate();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Workflow" : "New Workflow"}</DialogTitle>
          <DialogDescription>
            Define a deterministic multi-agent workflow as a step DAG.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Name<span className="text-destructive"> *</span>
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Enabled</Label>
            <Select value={enabled} onValueChange={setEnabled}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <StepDagBuilder steps={steps} setSteps={setSteps} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || create.isPending || update.isPending}
          >
            {editing ? "Save changes" : "Create Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunRow({ run }: { run: JarvisWorkflowRun }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", runTone(run.status))}>
        {run.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{run.workflowName ?? "—"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {run.stepsCompleted}/{run.stepsTotal} steps · {run.trigger}
          {run.error ? ` · ${run.error}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {new Date(run.startedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

function WorkflowCard({
  wf,
  onEdit,
}: {
  wf: JarvisWorkflowFull;
  onEdit: (wf: JarvisWorkflowFull) => void;
}) {
  const execute = useExecuteWorkflow();
  const remove = useDeleteWorkflow();
  const steps = wf.definition?.steps ?? [];

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <WorkflowIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{wf.name}</span>
            <Badge
              variant="outline"
              className={
                wf.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {wf.enabled ? "enabled" : "disabled"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              v{wf.version}
            </Badge>
          </div>
          {wf.description && (
            <p className="text-sm text-muted-foreground">{wf.description}</p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(wf)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={async () => {
              try {
                await remove.mutateAsync(wf.id);
              } catch {
                toast.error("Could not delete workflow");
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              {i > 0 && <ArrowDown className="h-3 w-3 rotate-[-90deg] text-muted-foreground" />}
              <Badge variant="outline" className="font-mono text-[10px]">
                {s.agentType}:{s.action}
              </Badge>
            </span>
          ))}
        </div>
      )}

      <Button
        size="sm"
        className="h-8"
        disabled={execute.isPending || !wf.enabled || steps.length === 0}
        onClick={async () => {
          try {
            const r = await execute.mutateAsync({ id: wf.id });
            toast.success(`Workflow started · run ${r.runId.slice(0, 8)}`);
          } catch {
            toast.error("Could not execute workflow");
          }
        }}
      >
        <Play className="mr-1 h-3.5 w-3.5" /> Execute
      </Button>
    </Card>
  );
}

export default function Workflows() {
  const { data, isLoading, isError } = useWorkflowsFull();
  const { data: runs } = useWorkflowRuns({ limit: 25 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JarvisWorkflowFull | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic multi-agent workflows orchestrated as step DAGs.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New Workflow
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))
          ) : isError ? (
            <Card>
              <p className="p-8 text-center text-sm text-destructive">
                Failed to load workflows.
              </p>
            </Card>
          ) : data && data.length > 0 ? (
            data.map((wf) => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                onEdit={(w) => {
                  setEditing(w);
                  setFormOpen(true);
                }}
              />
            ))
          ) : (
            <Card>
              <div className="flex flex-col items-center gap-3 p-12 text-center">
                <p className="text-sm text-muted-foreground">No workflows yet.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Create your first workflow
                </Button>
              </div>
            </Card>
          )}
        </div>

        <Card className="flex flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Run Timeline</h2>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {runs && runs.length > 0 ? (
              <div className="divide-y divide-border">
                {runs.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No workflow runs yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      <WorkflowFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
    </div>
  );
}
