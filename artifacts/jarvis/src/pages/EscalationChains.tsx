import { useState } from "react";
import { Plus, Trash2, AlertTriangle, ArrowDown } from "lucide-react";
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
import {
  useEscalationChains,
  useCreateEscalationChain,
  useDeleteEscalationChain,
  useAddEscalationChainStep,
  useDeleteEscalationChainStep,
  type JarvisEscalationChain,
} from "@/hooks/useJarvisApi";

const AGENT_TYPES = [
  { label: "Chief of Staff", value: "chief_of_staff" },
  { label: "Operations", value: "operations" },
  { label: "Risk", value: "risk" },
  { label: "QA", value: "qa" },
  { label: "Memory", value: "memory" },
];

function StepEditor({ chain }: { chain: JarvisEscalationChain }) {
  const addStep = useAddEscalationChainStep();
  const delStep = useDeleteEscalationChainStep();
  const [agentType, setAgentType] = useState("chief_of_staff");
  const [sla, setSla] = useState("3600");
  const [instruction, setInstruction] = useState("");

  async function add() {
    try {
      await addStep.mutateAsync({
        chainId: chain.id,
        agentType,
        slaSeconds: Number(sla) || 3600,
        instruction: instruction || null,
      });
      setInstruction("");
      toast.success("Step added");
    } catch {
      toast.error("Could not add step");
    }
  }

  return (
    <div className="space-y-3">
      {chain.steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No steps yet.</p>
      ) : (
        <ol className="space-y-2">
          {chain.steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              {i > 0 && <ArrowDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <Badge variant="outline" className="text-[10px]">
                  L{s.level}
                </Badge>
                <span className="font-mono text-xs">{s.agentType ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  SLA {Math.round(s.slaSeconds / 60)}m
                </span>
                {s.instruction && (
                  <span className="truncate text-xs text-muted-foreground">
                    · {s.instruction}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 text-destructive hover:text-destructive"
                  onClick={async () => {
                    try {
                      await delStep.mutateAsync({ chainId: chain.id, stepId: s.id });
                    } catch {
                      toast.error("Could not delete step");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Agent</Label>
          <Select value={agentType} onValueChange={setAgentType}>
            <SelectTrigger className="w-40">
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
        <div className="w-28 space-y-1.5">
          <Label className="text-xs">SLA (s)</Label>
          <Input value={sla} onChange={(e) => setSla(e.target.value)} />
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label className="text-xs">Instruction</Label>
          <Input
            value={instruction}
            placeholder="optional"
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={add} disabled={addStep.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add Step
        </Button>
      </div>
    </div>
  );
}

function ChainCard({ chain }: { chain: JarvisEscalationChain }) {
  const remove = useDeleteEscalationChain();
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{chain.name}</span>
            <Badge
              variant="outline"
              className={
                chain.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {chain.enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
          {chain.description && (
            <p className="text-sm text-muted-foreground">{chain.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={async () => {
            try {
              await remove.mutateAsync(chain.id);
            } catch {
              toast.error("Could not delete chain");
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <StepEditor chain={chain} />
    </Card>
  );
}

export default function EscalationChains() {
  const { data, isLoading, isError } = useEscalationChains();
  const create = useCreateEscalationChain();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit() {
    try {
      await create.mutateAsync({ name, description: description || null });
      setName("");
      setDescription("");
      setOpen(false);
    } catch {
      toast.error("Could not create chain");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Escalation Chains</h1>
          <p className="text-sm text-muted-foreground">
            SLA-driven multi-level escalation paths advanced by the orchestrator.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Chain
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load escalation chains.
          </p>
        </Card>
      ) : data && data.length > 0 ? (
        <div className="space-y-4">
          {data.map((c) => (
            <ChainCard key={c.id} chain={c} />
          ))}
        </div>
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">No escalation chains yet.</p>
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create your first chain
            </Button>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Escalation Chain</DialogTitle>
            <DialogDescription>
              Create a chain, then add escalation steps to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="chain-name">
                Name<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="chain-name"
                value={name}
                placeholder="e.g. Risk breach escalation"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chain-desc">Description</Label>
              <Textarea
                id="chain-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || create.isPending}>
              Create Chain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
