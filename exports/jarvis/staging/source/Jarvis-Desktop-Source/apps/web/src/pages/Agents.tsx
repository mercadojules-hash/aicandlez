import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, Play, Plus, Search, Activity, Cpu, 
  Terminal, Zap, CheckCircle2, XCircle, Clock,
  Grid, List
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useRunAgent,
  useBusinesses,
  useAgentRuns,
  type JarvisAgent
} from "@/hooks/useJarvisApi";

const AGENT_TYPE_OPTIONS = [
  { label: "Custom", value: "custom" },
  { label: "Chief of Staff", value: "chief_of_staff" },
  { label: "Operations", value: "operations" },
  { label: "Risk", value: "risk" },
  { label: "Memory", value: "memory" },
  { label: "QA", value: "qa" },
];

function parseScheduleSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 5 ? Math.floor(n) : null;
}

function parsePriority(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? Math.floor(n) : 100;
}

export default function Agents() {
  const { data: agents = [], isLoading, isError } = useAgents();
  const { data: businesses = [] } = useBusinesses();
  const { data: runs = [] } = useAgentRuns();
  
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const remove = useDeleteAgent();
  const runAgent = useRunAgent();

  const [search, setSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredAgents = useMemo(() => {
    return agents.filter(a => 
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.agentType.toLowerCase().includes(search.toLowerCase())
    );
  }, [agents, search]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;

  const handleRun = async (agent: JarvisAgent) => {
    try {
      const { outcome } = await runAgent.mutateAsync(agent.id);
      if (outcome.ok) {
        toast.success(`${agent.name}: ${outcome.summary ?? "run complete"}`);
      } else {
        toast.error(`${agent.name} failed: ${outcome.error ?? "unknown error"}`);
      }
    } catch {
      toast.error(`Could not run ${agent.name}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "idle": return "text-slate-500 bg-slate-500/10 border-slate-500/20";
      case "running": return "text-primary bg-primary/10 border-primary/20";
      case "failed": return "text-destructive bg-destructive/10 border-destructive/20";
      case "completed": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      default: return "text-slate-500 bg-slate-500/10 border-slate-500/20";
    }
  };

  return (
    <div className="flex flex-col h-full gap-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous operators and orchestration grid
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")}>
            <TabsList className="bg-card/50 border border-border/50">
              <TabsTrigger value="grid" className="gap-2"><Grid className="w-4 h-4" /> Constellation</TabsTrigger>
              <TabsTrigger value="list" className="gap-2"><List className="w-4 h-4" /> Registry</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search agents..." 
                className="pl-8 bg-card/50 border-border/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pb-6 content-start">
              <AnimatePresence mode="popLayout">
                {filteredAgents.map((agent) => (
                  <motion.div
                    layout
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`
                      relative group cursor-pointer rounded-xl border p-4 transition-all duration-300
                      ${selectedAgentId === agent.id 
                        ? 'bg-card border-primary shadow-[0_0_30px_-5px_var(--color-primary)]' 
                        : 'bg-card/30 border-border/50 hover:bg-card/80 hover:border-primary/50'
                      }
                    `}
                  >
                    {agent.runtimeStatus === 'running' && (
                      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                          ${agent.runtimeStatus === 'running' ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}
                        `}>
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground truncate max-w-[120px]">{agent.name}</h3>
                          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                            {agent.agentType.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`capitalize font-mono text-[10px] ${getStatusColor(agent.runtimeStatus)}`}>
                        {agent.runtimeStatus}
                      </Badge>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Activity className="w-3.5 h-3.5" />
                        <span className="truncate">
                          {agent.runtimeStatus === 'running' 
                            ? 'Executing task sequence...' 
                            : agent.lastRunAt 
                              ? `Last run ${new Date(agent.lastRunAt).toLocaleTimeString()}`
                              : 'Standing by'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/30">
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-background/50">
                          PRIORITY {agent.priority}
                        </Badge>
                        {agent.enabled && (
                          <Badge variant="secondary" className="text-[9px] uppercase tracking-wider bg-background/50 text-emerald-400">
                            AUTO
                          </Badge>
                        )}
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={`h-7 w-7 rounded-full transition-colors ${
                          agent.runtimeStatus === 'running' 
                            ? 'opacity-50 cursor-not-allowed' 
                            : 'hover:bg-primary/20 hover:text-primary'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (agent.runtimeStatus !== 'running') handleRun(agent);
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-4 min-h-[400px]">
              {selectedAgent ? (
                <div className="bg-card/50 border border-border/50 rounded-xl p-6 flex flex-col h-full overflow-hidden">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-medium flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-primary" />
                        {selectedAgent.name}
                      </h2>
                      <p className="text-sm text-muted-foreground font-mono mt-1">ID: {selectedAgent.id.split('-')[0]}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleRun(selectedAgent)}>
                      <Zap className="w-4 h-4 mr-2" />
                      Force Run
                    </Button>
                  </div>

                  <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Capabilities</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedAgent.capabilities?.map((cap, i) => (
                          <Badge key={i} variant="secondary" className="bg-secondary/50 text-xs">
                            {cap}
                          </Badge>
                        )) || <span className="text-sm text-muted-foreground italic">No specialized capabilities</span>}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Recent Telemetry</h4>
                      <div className="space-y-2">
                        {runs.filter(r => r.agentId === selectedAgent.id).slice(0, 5).map((run) => (
                          <div key={run.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/50 text-sm">
                            {run.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" /> : 
                             run.status === 'failed' ? <XCircle className="w-4 h-4 text-destructive mt-0.5" /> :
                             run.status === 'running' ? <Activity className="w-4 h-4 text-primary mt-0.5 animate-pulse" /> :
                             <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between">
                                <span className="font-medium truncate">{run.summary || run.trigger || "Task Execution"}</span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                  {new Date(run.startedAt).toLocaleTimeString()}
                                </span>
                              </div>
                              {run.error && <p className="text-xs text-destructive mt-1 line-clamp-2">{run.error}</p>}
                            </div>
                          </div>
                        ))}
                        {runs.filter(r => r.agentId === selectedAgent.id).length === 0 && (
                          <p className="text-sm text-muted-foreground italic">No recent telemetry data.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card/30 border border-border/50 border-dashed rounded-xl p-8 flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                    <Activity className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Awaiting Selection</h3>
                  <p className="text-sm text-muted-foreground max-w-[250px]">
                    Select a node from the swarm constellation to view detailed telemetry and control override.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <RegistryView
          title=""
          description=""
          entityLabel="Agent"
          items={agents}
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
              key: "agentType",
              label: "Type",
              render: (r) => (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {r.agentType}
                </Badge>
              ),
            },
            {
              key: "enabled",
              label: "Scheduler",
              render: (r) =>
                r.enabled ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  >
                    {r.scheduleSeconds ? `every ${r.scheduleSeconds}s` : "enabled"}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">disabled</span>
                ),
            },
            {
              key: "runtimeStatus",
              label: "Runtime",
              render: (r) => <StatusBadge status={r.runtimeStatus} />,
            },
            {
              key: "lastRun",
              label: "Last Run",
              render: (r) =>
                r.lastRunAt ? (
                  <span
                    className={
                      r.lastRunStatus === "failed"
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {new Date(r.lastRunAt).toLocaleString()}
                    {r.lastRunStatus ? ` · ${r.lastRunStatus}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">never</span>
                ),
            },
            {
              key: "run",
              label: "",
              render: (r) => (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={runAgent.isPending || r.runtimeStatus === "running"}
                  onClick={async (e) => {
                    e.stopPropagation();
                    handleRun(r);
                  }}
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Run
                </Button>
              ),
            },
          ]}
          fields={[
            { name: "name", label: "Name", required: true, placeholder: "e.g. Chief of Staff" },
            {
              name: "agentType",
              label: "Agent Type",
              type: "select",
              defaultValue: "custom",
              options: AGENT_TYPE_OPTIONS,
            },
            { name: "role", label: "Role", placeholder: "e.g. Orchestration" },
            { name: "description", label: "Description", type: "textarea" },
            {
              name: "enabled",
              label: "Scheduler Enabled",
              type: "select",
              defaultValue: "false",
              options: [
                { label: "Disabled", value: "false" },
                { label: "Enabled", value: "true" },
              ],
            },
            {
              name: "scheduleSeconds",
              label: "Schedule (seconds, blank = manual only)",
              placeholder: "e.g. 300",
            },
            {
              name: "priority",
              label: "Priority (lower runs first)",
              placeholder: "100",
              defaultValue: "100",
            },
            {
              name: "status",
              label: "Status",
              type: "select",
              defaultValue: "active",
              options: [
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
                { label: "Offline", value: "offline" },
              ],
            },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            agentType: r.agentType,
            role: r.role ?? "",
            description: r.description ?? "",
            enabled: r.enabled ? "true" : "false",
            scheduleSeconds: r.scheduleSeconds != null ? String(r.scheduleSeconds) : "",
            priority: String(r.priority),
            status: r.status,
          })}
          onCreate={(v) =>
            create.mutateAsync({
              name: v.name,
              agentType: v.agentType || "custom",
              role: v.role || null,
              description: v.description || null,
              enabled: v.enabled === "true",
              scheduleSeconds: parseScheduleSeconds(v.scheduleSeconds),
              priority: parsePriority(v.priority),
              status: v.status,
            })
          }
          onUpdate={(id, v) =>
            update.mutateAsync({
              id,
              name: v.name,
              agentType: v.agentType || "custom",
              role: v.role || null,
              description: v.description || null,
              enabled: v.enabled === "true",
              scheduleSeconds: parseScheduleSeconds(v.scheduleSeconds),
              priority: parsePriority(v.priority),
              status: v.status,
            })
          }
          onDelete={(id) => remove.mutateAsync(id)}
        />
      )}
    </div>
  );
}
