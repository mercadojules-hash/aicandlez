import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditLogs, type JarvisAuditLog } from "@/hooks/useJarvisApi";

const ALL = "__all__";

function actionTone(action: string): string {
  switch (action) {
    case "create":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
    case "update":
      return "border-blue-500/30 bg-blue-500/10 text-blue-500";
    case "delete":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function detailOf(log: JarvisAuditLog): string {
  if (log.metadata && typeof log.metadata.name === "string") return log.metadata.name;
  if (log.metadata && typeof log.metadata.title === "string") return log.metadata.title;
  if (log.metadata && Array.isArray(log.metadata.keys))
    return (log.metadata.keys as string[]).join(", ");
  return "—";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Timeline() {
  const { data, isLoading, isError } = useAuditLogs(200);
  const [entityType, setEntityType] = useState<string>(ALL);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const log of data ?? []) set.add(log.entityType);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(
    () =>
      (data ?? []).filter((log) => entityType === ALL || log.entityType === entityType),
    [data, entityType],
  );

  const groups = useMemo(() => {
    const map = new Map<string, JarvisAuditLog[]>();
    for (const log of filtered) {
      const key = dayLabel(log.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(log);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity Timeline</h1>
          <p className="text-sm text-muted-foreground">
            A chronological feed of every change across the command center.
          </p>
        </div>
        <div className="w-48">
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {entityTypes.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : isError ? (
        <Card>
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load activity.
          </p>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <p className="p-12 text-center text-sm text-muted-foreground">
            No activity yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(([label, logs]) => (
            <div key={label} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </h2>
              <Card className="divide-y divide-border">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`capitalize ${actionTone(log.action)}`}
                    >
                      {log.action}
                    </Badge>
                    <span className="text-sm capitalize text-muted-foreground">
                      {log.entityType}
                    </span>
                    <span className="truncate text-sm font-medium">{detailOf(log)}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {log.userEmail ?? "system"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
