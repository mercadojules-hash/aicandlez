import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, Play, Plus, Search, Activity, Cpu, 
  Terminal, Zap, CheckCircle2, XCircle, Clock,
  Grid, List, ShieldAlert, Fingerprint, CalendarClock, Wifi, Radar
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

const getStatusColor = (status: string) => {
  switch (status) {
    case "idle": return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    case "running": return "text-primary bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(0,255,255,0.15)]";
    case "failed": return "text-destructive bg-destructive/10 border-destructive/20";
    case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "offline": return "text-slate-500 bg-slate-500/5 border-slate-500/10";
    default: return "text-slate-500 bg-slate-500/10 border-slate-500/20";
  }
};

const getAgentTypeIcon = (type: string) => {
  switch (type) {
    case "chief_of_staff": return <Terminal className="w-4 h-4" />;
    case "operations": return <Activity className="w-4 h-4" />;
    case "risk": return <ShieldAlert className="w-4 h-4" />;
    case "memory": return <Fingerprint className="w-4 h-4" />;
    case "qa": return <CheckCircle2 className="w-4 h-4" />;
    default: return <Bot className="w-4 h-4" />;
  }
};

export default function Agents() {
  const { data: agents = [], isLoading, isError } = useAgents();
  const { data: businesses = [] } = useBusinesses(); // Preserving hook from original
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
      a.agentType.toLowerCase().includes(search.toLowerCase()) ||
      (a.role && a.role.toLowerCase().includes(search.toLowerCase()))
    );
  }, [agents, search]);

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || null;

  // Auto-select first agent if none selected and data loads
  useEffect(() => {
    if (!selectedAgentId && filteredAgents.length > 0) {
      setSelectedAgentId(filteredAgents[0].id);
    }
  }, [filteredAgents, selectedAgentId]);

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

  return (
    <div className="flex flex-col h-full gap-6 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-[0_0_15px_rgba(0,255,255,0.1)] text-primary">
              <Cpu className="w-6 h-6" />
            </div>
            Operatives
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-mono tracking-wide uppercase">
            Autonomous Swarm & Orchestration Grid
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")}>
            <TabsList className="bg-card/40 border border-border/50 h-10 p-1">
              <TabsTrigger value="grid" className="gap-2 text-xs font-medium uppercase tracking-wider h-8"><Grid className="w-3.5 h-3.5" /> Grid</TabsTrigger>
              <TabsTrigger value="list" className="gap-2 text-xs font-medium uppercase tracking-wider h-8"><List className="w-3.5 h-3.5" /> Table</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="flex flex-col h-full flex-1 min-h-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative w-72 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input 
                placeholder="Query operative index..." 
                className="pl-9 h-10 bg-card/20 border-border/40 focus-visible:border-primary/50 focus-visible:ring-primary/20 font-mono text-sm placeholder:text-muted-foreground/50 transition-all rounded-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                </div>
              )}
            </div>
            <div className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
              <div className="h-[1px] w-4 bg-border/50" />
              {filteredAgents.length} Operatives Online
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            {/* Agent Grid */}
            <div className="lg:col-span-8 overflow-y-auto custom-scrollbar pr-2 pb-6 content-start h-[calc(100vh-240px)]">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-36 bg-card/10 animate-pulse border border-border/20 rounded-xl" />
                  ))}
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center border border-border/20 border-dashed rounded-xl bg-card/5">
                  <Bot className="w-10 h-10 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">No operatives match query</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredAgents.map((agent, i) => {
                      const isRunning = agent.runtimeStatus === 'running';
                      const isSelected = selectedAgentId === agent.id;
                      
                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={agent.id}
                          onClick={() => setSelectedAgentId(agent.id)}
                          className={`
                            relative group cursor-pointer rounded-xl border p-5 transition-all duration-500 overflow-hidden flex flex-col min-h-[160px]
                            ${isSelected 
                              ? 'bg-card/60 border-primary/50 shadow-[0_0_30px_-10px_var(--color-primary)]' 
                              : 'bg-card/20 border-border/40 hover:bg-card/40 hover:border-primary/30'
                            }
                          `}
                        >
                          {isRunning && (
                            <div className="absolute inset-0 pointer-events-none">
                              <div className="absolute inset-0 bg-primary/[0.03] animate-pulse" />
                              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                            </div>
                          )}

                          <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex items-center gap-3">
                              <div className={`
                                w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-500
                                ${isRunning ? 'bg-primary/10 text-primary border-primary/30 shadow-[inset_0_0_15px_rgba(0,255,255,0.1)]' : 
                                  isSelected ? 'bg-card text-foreground border-primary/20' : 'bg-secondary/50 text-muted-foreground border-border/50'}
                              `}>
                                {getAgentTypeIcon(agent.agentType)}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-semibold text-foreground text-sm tracking-wide truncate">{agent.name}</h3>
                                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                                  <span>{agent.agentType.replace('_', ' ')}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-auto relative z-10 pt-4 flex flex-col gap-3">
                            <Badge variant="outline" className={`w-fit uppercase font-mono text-[9px] tracking-widest px-2 py-0.5 ${getStatusColor(agent.runtimeStatus)}`}>
                              {agent.runtimeStatus}
                            </Badge>

                            <div className="flex items-center justify-between border-t border-border/30 pt-3">
                              <div className="flex gap-2">
                                {agent.enabled && (
                                  <Badge variant="secondary" className="text-[9px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    AUTO
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-[9px] uppercase tracking-widest bg-background/50 border-border/50 text-muted-foreground">
                                  PR-{agent.priority}
                                </Badge>
                              </div>
                              
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className={`h-7 w-7 rounded-full transition-all duration-300 ${
                                  isRunning 
                                    ? 'opacity-30 cursor-not-allowed' 
                                    : 'hover:bg-primary/20 hover:text-primary hover:shadow-[0_0_15px_rgba(0,255,255,0.2)]'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isRunning) handleRun(agent);
                                }}
                              >
                                <Play className="w-3 h-3 ml-0.5" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-4 h-[calc(100vh-240px)]">
              {selectedAgent ? (
                <div className="bg-card/40 border border-border/50 rounded-xl flex flex-col h-full overflow-hidden shadow-2xl relative">
                  {/* Subtle top glow line */}
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                  
                  <div className="p-6 border-b border-border/40 bg-card/20 relative">
                    {selectedAgent.runtimeStatus === 'running' && (
                      <div className="absolute top-4 right-4 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-primary uppercase tracking-widest animate-pulse">Executing</span>
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)] animate-pulse" />
                      </div>
                    )}
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-[inset_0_0_20px_rgba(0,255,255,0.05)]">
                        {getAgentTypeIcon(selectedAgent.agentType)}
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight">{selectedAgent.name}</h2>
                        <p className="text-xs text-muted-foreground font-mono mt-1 uppercase tracking-wider flex items-center gap-2">
                          <Wifi className="w-3 h-3 opacity-50" />
                          ID: {selectedAgent.id.split('-')[0]}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(0,255,255,0.2)] font-mono text-xs uppercase tracking-wider h-9" 
                        onClick={() => handleRun(selectedAgent)}
                        disabled={selectedAgent.runtimeStatus === 'running'}
                      >
                        <Zap className="w-3.5 h-3.5 mr-2" />
                        Init Run
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {/* Status & Config */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-background/40 border border-border/30">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <Activity className="w-3 h-3" /> Status
                        </div>
                        <div className="text-sm font-medium capitalize flex items-center gap-2">
                          {selectedAgent.status}
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedAgent.status === 'active' ? 'bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`} />
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-background/40 border border-border/30">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <CalendarClock className="w-3 h-3" /> Schedule
                        </div>
                        <div className="text-sm font-medium">
                          {selectedAgent.enabled && selectedAgent.scheduleSeconds ? `Every ${selectedAgent.scheduleSeconds}s` : <span className="text-muted-foreground">-</span>}
                        </div>
                      </div>
                    </div>

                    {selectedAgent.description && (
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono mb-3">Directive</h4>
                        <p className="text-sm text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-3">
                          {selectedAgent.description}
                        </p>
                      </div>
                    )}

                    {selectedAgent.capabilities && selectedAgent.capabilities.length > 0 && (
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono mb-3">Capabilities</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAgent.capabilities.map((cap, i) => (
                            <Badge key={i} variant="outline" className="bg-background/40 border-border/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border transition-colors">
                              {cap}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono mb-3 flex items-center justify-between">
                        <span>Telemetry</span>
                        <span className="text-[9px] opacity-50">Last 5 cycles</span>
                      </h4>
                      <div className="space-y-2">
                        {runs.filter(r => r.agentId === selectedAgent.id).slice(0, 5).map((run) => (
                          <div key={run.id} className="group flex items-start gap-3 p-3 rounded-lg bg-background/30 border border-border/30 text-sm hover:border-border/60 transition-colors">
                            <div className="mt-0.5 shrink-0">
                              {run.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : 
                               run.status === 'failed' ? <XCircle className="w-4 h-4 text-destructive" /> :
                               run.status === 'running' ? <Activity className="w-4 h-4 text-primary animate-pulse shadow-[0_0_8px_rgba(0,255,255,0.3)] rounded-full" /> :
                               <Clock className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-medium text-foreground/90 truncate text-xs">{run.summary || run.trigger || "Task Execution"}</span>
                                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap pt-0.5">
                                  {new Date(run.startedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                              {run.error && <p className="text-[10px] text-destructive/90 mt-1 line-clamp-2 bg-destructive/10 p-1.5 rounded border border-destructive/20">{run.error}</p>}
                            </div>
                          </div>
                        ))}
                        {runs.filter(r => r.agentId === selectedAgent.id).length === 0 && (
                          <div className="text-center py-6 border border-dashed border-border/20 rounded-lg">
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">No telemetry data</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card/20 border border-border/30 border-dashed rounded-xl p-8 flex flex-col items-center justify-center h-full text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay pointer-events-none" />
                  <div className="w-16 h-16 rounded-full bg-secondary/30 border border-border/50 flex items-center justify-center mb-6 relative">
                    <div className="absolute inset-0 border border-primary/20 rounded-full animate-[spin_10s_linear_infinite] border-t-transparent" />
                    <Radar className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-sm font-mono text-foreground/70 uppercase tracking-widest mb-3">Awaiting Selection</h3>
                  <p className="text-xs text-muted-foreground/60 max-w-[220px] leading-relaxed">
                    Select a node from the swarm constellation to access detailed telemetry and override controls.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-card/20 border border-border/40 rounded-xl overflow-hidden shadow-xl">
          <RegistryView
            title=""
            description=""
            entityLabel="Operative"
            items={agents}
            isLoading={isLoading}
            isError={isError}
            isMutating={create.isPending || update.isPending}
            columns={[
              {
                key: "name",
                label: "Ident",
                render: (r) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-background/50 border border-border/50 flex items-center justify-center text-muted-foreground shrink-0">
                      {getAgentTypeIcon(r.agentType)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm tracking-wide">{r.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{r.id.split('-')[0]}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: "agentType",
                label: "Class",
                render: (r) => (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider bg-background/40">
                    {r.agentType.replace('_', ' ')}
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
                      className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase tracking-wider"
                    >
                      {r.scheduleSeconds ? `T-${r.scheduleSeconds}s` : "ENABLED"}
                    </Badge>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">-</span>
                  ),
              },
              {
                key: "runtimeStatus",
                label: "Status",
                render: (r) => <StatusBadge status={r.runtimeStatus} />,
              },
              {
                key: "lastRun",
                label: "Last Ping",
                render: (r) =>
                  r.lastRunAt ? (
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        r.lastRunStatus === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {new Date(r.lastRunAt).toLocaleTimeString([], { hour12: false })}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">-</span>
                  ),
              },
              {
                key: "run",
                label: "",
                render: (r) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    disabled={runAgent.isPending || r.runtimeStatus === "running"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      handleRun(r);
                    }}
                  >
                    <Play className="mr-1.5 h-3 w-3" />
                    Exec
                  </Button>
                ),
              },
            ]}
            fields={[
              { name: "name", label: "Designation", required: true, placeholder: "e.g. Chief of Staff" },
              {
                name: "agentType",
                label: "Operative Class",
                type: "select",
                defaultValue: "custom",
                options: AGENT_TYPE_OPTIONS,
              },
              { name: "role", label: "Primary Role", placeholder: "e.g. Orchestration" },
              { name: "description", label: "Operational Directive", type: "textarea" },
              {
                name: "enabled",
                label: "Automated Scheduler",
                type: "select",
                defaultValue: "false",
                options: [
                  { label: "Manual Trigger Only", value: "false" },
                  { label: "Active Interval", value: "true" },
                ],
              },
              {
                name: "scheduleSeconds",
                label: "Execution Interval (seconds)",
                placeholder: "e.g. 300",
              },
              {
                name: "priority",
                label: "Priority Class (lower executes first)",
                placeholder: "100",
                defaultValue: "100",
              },
              {
                name: "status",
                label: "System Status",
                type: "select",
                defaultValue: "active",
                options: [
                  { label: "Active", value: "active" },
                  { label: "Standby", value: "paused" },
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
        </div>
      )}
    </div>
  );
}
