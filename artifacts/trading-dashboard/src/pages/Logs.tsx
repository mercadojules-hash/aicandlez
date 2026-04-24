import { useState } from "react";
import { format } from "date-fns";
import { Terminal, Filter, RefreshCcw, AlertTriangle, CheckCircle2, Info, ArrowRight } from "lucide-react";
import { useGetLogs } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type LogFilter = "all" | "signal" | "trade" | "system" | "error";

export default function Logs() {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [limit, setLimit] = useState(100);

  const { data: logs, isLoading, refetch } = useGetLogs(
    { limit },
    {
      query: {
        refetchInterval: 5000,
      }
    }
  );

  const filteredLogs = logs?.filter(l => filter === "all" || l.type === filter) || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Card className="flex-1 flex flex-col border-border/50 rounded-xl overflow-hidden bg-[#0B0F14]/80 backdrop-blur">
        <CardHeader className="py-3 px-4 border-b border-border/50 bg-card/50 shrink-0 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            System Logs
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-md border border-border/50">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>ALL</FilterButton>
              <FilterButton active={filter === "signal"} onClick={() => setFilter("signal")}>SIGNALS</FilterButton>
              <FilterButton active={filter === "trade"} onClick={() => setFilter("trade")}>TRADES</FilterButton>
              <FilterButton active={filter === "system"} onClick={() => setFilter("system")}>SYSTEM</FilterButton>
              <FilterButton active={filter === "error"} onClick={() => setFilter("error")}>ERRORS</FilterButton>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 p-0 overflow-auto relative">
          <div className="font-mono text-sm w-full">
            <table className="w-full">
              <thead className="sticky top-0 bg-card/95 backdrop-blur z-10 text-xs text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="text-left font-medium p-2 pl-4 w-32">TIMESTAMP</th>
                  <th className="text-left font-medium p-2 w-24">LEVEL</th>
                  <th className="text-left font-medium p-2 w-24">TYPE</th>
                  <th className="text-left font-medium p-2">MESSAGE / DETAILS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="p-2 pl-4 text-xs text-muted-foreground whitespace-nowrap align-top pt-3">
                      {format(new Date(log.timestamp), "HH:mm:ss.SSS")}
                    </td>
                    <td className="p-2 align-top pt-2.5">
                      <LevelBadge level={log.level as any} />
                    </td>
                    <td className="p-2 align-top pt-2.5">
                      <Badge variant="outline" className="bg-background uppercase text-[9px] tracking-wider font-semibold border-border/50 text-muted-foreground">
                        {log.type}
                      </Badge>
                    </td>
                    <td className="p-2 py-3 w-full">
                      <div className={`font-medium mb-1 ${
                        log.level === 'error' ? 'text-destructive' : 
                        log.level === 'warn' ? 'text-yellow-500' : 
                        log.level === 'success' ? 'text-success' : 'text-foreground'
                      }`}>
                        {log.message}
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 text-xs bg-black/40 rounded p-2 border border-border/30 overflow-x-auto text-muted-foreground">
                          {Object.entries(log.details).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-primary/70">{k}:</span>
                              <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-muted-foreground">
                      No logs found matching filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded transition-colors ${
        active 
          ? "bg-primary/20 text-primary border border-primary/30" 
          : "text-muted-foreground hover:bg-muted/50 border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function LevelBadge({ level }: { level: 'info' | 'warn' | 'error' | 'success' }) {
  const styles = {
    info: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    warn: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
    error: "text-destructive border-destructive/30 bg-destructive/10",
    success: "text-success border-success/30 bg-success/10",
  };

  const icons = {
    info: <Info className="w-3 h-3 mr-1" />,
    warn: <AlertTriangle className="w-3 h-3 mr-1" />,
    error: <AlertTriangle className="w-3 h-3 mr-1" />,
    success: <CheckCircle2 className="w-3 h-3 mr-1" />,
  };

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${styles[level]}`}>
      {icons[level]}
      {level}
    </span>
  );
}