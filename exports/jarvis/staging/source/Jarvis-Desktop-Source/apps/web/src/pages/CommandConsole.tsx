import { useState } from "react";
import { Terminal, Send } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useCommands,
  useCommandRegistry,
  useIssueCommand,
  type JarvisCommand,
} from "@/hooks/useJarvisApi";

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "dispatched":
      return "border-sky-500/30 bg-sky-500/10 text-sky-500";
    case "received":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    case "failed":
    case "rejected":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function CommandRow({ cmd }: { cmd: JarvisCommand }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Badge variant="outline" className={cn("shrink-0", statusTone(cmd.status))}>
        {cmd.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          <span className="font-mono">{cmd.verb ?? "?"}</span>
          {cmd.routedAgentType && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              → {cmd.routedAgentType}
            </span>
          )}
        </div>
        {cmd.commandText && (
          <div className="truncate text-xs text-muted-foreground">{cmd.commandText}</div>
        )}
        {cmd.error && <div className="truncate text-xs text-destructive">{cmd.error}</div>}
      </div>
      <div className="shrink-0 text-[11px] text-muted-foreground">
        {new Date(cmd.createdAt).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default function CommandConsole() {
  const { data: registry } = useCommandRegistry();
  const { data: commands, isLoading } = useCommands({ limit: 50 });
  const issue = useIssueCommand();
  const [verb, setVerb] = useState("");
  const [args, setArgs] = useState("");

  const selectedSpec = registry?.find((r) => r.verb === verb) ?? null;

  async function send() {
    let parsedArgs: Record<string, unknown> | null = null;
    if (args.trim()) {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        toast.error("Args must be valid JSON");
        return;
      }
    }
    try {
      await issue.mutateAsync({ verb, args: parsedArgs });
      toast.success(`Command "${verb}" issued`);
      setArgs("");
    } catch {
      toast.error("Could not issue command");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command Console</h1>
        <p className="text-sm text-muted-foreground">
          Issue advisory executive commands; the orchestrator routes and dispatches them.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Issue Command</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] space-y-1.5">
            <Label>Verb</Label>
            <Select value={verb} onValueChange={setVerb}>
              <SelectTrigger>
                <SelectValue placeholder="Select a verb" />
              </SelectTrigger>
              <SelectContent>
                {(registry ?? []).map((r) => (
                  <SelectItem key={r.verb} value={r.verb}>
                    {r.verb} · {r.kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <Label>Args (JSON, optional)</Label>
            <Input
              value={args}
              placeholder={selectedSpec?.argsHint ?? '{ "key": "value" }'}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          <Button onClick={send} disabled={!verb || issue.isPending}>
            <Send className="mr-1.5 h-4 w-4" /> Issue
          </Button>
        </div>
        {selectedSpec && (
          <p className="text-xs text-muted-foreground">{selectedSpec.description}</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="flex flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Verb Registry</h2>
          </div>
          <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
            {(registry ?? []).map((r) => (
              <div key={r.verb} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{r.verb}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {r.kind}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Command Feed</h2>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : commands && commands.length > 0 ? (
              <div className="divide-y divide-border">
                {commands.map((c) => (
                  <CommandRow key={c.id} cmd={c} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No commands issued yet.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
