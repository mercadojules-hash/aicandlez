import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs } from "@/hooks/useJarvisApi";

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

export default function Audit() {
  const { data, isLoading, isError } = useAuditLogs(200);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          A complete record of every change across the command center.
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load audit log.
          </p>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((log) => {
                const name =
                  log.metadata && typeof log.metadata.name === "string"
                    ? (log.metadata.name as string)
                    : log.metadata && Array.isArray(log.metadata.keys)
                      ? (log.metadata.keys as string[]).join(", ")
                      : "—";
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${actionTone(log.action)}`}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {log.entityType}
                    </TableCell>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.userEmail ?? "system"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="p-12 text-center text-sm text-muted-foreground">
            No audit entries yet.
          </p>
        )}
      </Card>
    </div>
  );
}
