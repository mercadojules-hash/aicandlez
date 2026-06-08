import { useMemo, useState } from "react";
import {
  FolderTree,
  BookOpen,
  Brain,
  ArrowRight,
  Compass,
  GitBranch,
  CheckSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useKnowledgeGraph,
  type JarvisGraphNode,
} from "@/hooks/useJarvisApi";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  category: FolderTree,
  asset: BookOpen,
  memory: Brain,
  decision: GitBranch,
  task: CheckSquare,
};

export default function Navigation() {
  const { data, isLoading, isError } = useKnowledgeGraph();
  const [selected, setSelected] = useState<string | null>(null);

  const labelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of data?.nodes ?? []) map.set(`${n.type}:${n.id}`, n.label);
    return (type: string, id: string) =>
      map.get(`${type}:${id}`) ?? id.slice(0, 8);
  }, [data]);

  const selectedNode = useMemo<JarvisGraphNode | null>(
    () => data?.nodes.find((n) => n.id === selected) ?? null,
    [data, selected],
  );

  const connections = useMemo(() => {
    if (!data || !selectedNode) return [];
    return data.edges.filter(
      (e) =>
        e.source.id === selectedNode.id || e.target.id === selectedNode.id,
    );
  }, [data, selectedNode]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load the knowledge graph.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memory Navigation</h1>
        <p className="text-sm text-muted-foreground">
          Traverse the knowledge graph — select a node to inspect its connections.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.counts.memories}</div>
          <div className="text-xs text-muted-foreground">Memories</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.counts.assets}</div>
          <div className="text-xs text-muted-foreground">Assets</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.counts.categories}</div>
          <div className="text-xs text-muted-foreground">Categories</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-semibold">{data.counts.relationships}</div>
          <div className="text-xs text-muted-foreground">Relationships</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="flex max-h-[32rem] flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Nodes</h2>
          </div>
          {data.nodes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No nodes yet.
            </p>
          ) : (
            <div className="divide-y divide-border overflow-y-auto">
              {data.nodes.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Compass;
                const active = n.id === selected;
                return (
                  <button
                    key={`${n.type}:${n.id}`}
                    onClick={() => setSelected(n.id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span className="truncate text-sm font-medium">{n.label}</span>
                    <Badge variant="outline" className="ml-auto shrink-0 capitalize text-[10px]">
                      {n.type}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="flex max-h-[32rem] flex-col">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">
              {selectedNode ? `Connections — ${selectedNode.label}` : "Connections"}
            </h2>
          </div>
          {!selectedNode ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
              <Compass className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select a node to view its relationships.
              </p>
            </div>
          ) : connections.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No connections for this node.
            </p>
          ) : (
            <div className="divide-y divide-border overflow-y-auto">
              {connections.map((e) => {
                const outgoing = e.source.id === selectedNode.id;
                const other = outgoing ? e.target : e.source;
                return (
                  <div key={e.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                        {outgoing ? "" : "← "}
                        {e.relationType}
                        {outgoing ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                      </span>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {other.type}
                      </Badge>
                      <span className="truncate font-medium">
                        {labelOf(other.type, other.id)}
                      </span>
                    </div>
                    {e.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
