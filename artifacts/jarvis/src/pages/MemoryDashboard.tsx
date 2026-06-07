import { Link } from "wouter";
import { Brain, BookOpen, FolderTree, Network, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMemoryOverview,
  type JarvisMemoryOverview,
} from "@/hooks/useJarvisApi";

function StatCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href}>
      <a className="block">
        <Card className="flex items-start gap-4 p-5 transition-colors hover:bg-muted/40">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        </Card>
      </a>
    </Link>
  );
}

function DistributionPanel({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return (
    <Card className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No data yet.
        </p>
      ) : (
        <div className="space-y-3 p-4">
          {entries.map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{key}</span>
                <span className="font-medium">{value}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ListPanel({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: { id: string; title: string; meta: string }[];
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href}>
          <a className="text-xs text-primary hover:underline">View all</a>
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="ml-auto shrink-0 text-xs capitalize text-muted-foreground">
                {r.meta}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}

function Content({ ov }: { ov: JarvisMemoryOverview }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memory Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A live overview of executive memory, knowledge, and their connections.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Memories"
          value={ov.counts.memories}
          hint={`${ov.counts.pinned} pinned`}
          href="/memories"
          icon={Brain}
        />
        <StatCard
          label="Knowledge Assets"
          value={ov.counts.assets}
          hint="documents, notes, links"
          href="/knowledge"
          icon={BookOpen}
        />
        <StatCard
          label="Categories"
          value={ov.counts.categories}
          hint="taxonomy nodes"
          href="/categories"
          icon={FolderTree}
        />
        <StatCard
          label="Relationships"
          value={ov.counts.relationships}
          hint="graph edges"
          href="/relationships"
          icon={Network}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DistributionPanel title="Memories by Type" data={ov.memories.byType} />
        <DistributionPanel
          title="Memories by Importance"
          data={ov.memories.byImportance}
        />
        <DistributionPanel title="Assets by Type" data={ov.assets.byType} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Pin className="h-4 w-4 text-primary" /> Pinned Memories
            </h2>
            <Link href="/memories">
              <a className="text-xs text-primary hover:underline">View all</a>
            </Link>
          </div>
          {ov.pinnedMemories.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No pinned memories.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {ov.pinnedMemories.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="truncate text-sm font-medium">{m.title}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto shrink-0 capitalize text-[10px]"
                  >
                    {m.memoryType}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <ListPanel
          title="Recent Memories"
          href="/memories"
          rows={ov.recentMemories.map((m) => ({
            id: m.id,
            title: m.title,
            meta: m.importance,
          }))}
        />
      </div>

      <ListPanel
        title="Recent Knowledge Assets"
        href="/knowledge"
        rows={ov.recentAssets.map((a) => ({
          id: a.id,
          title: a.title,
          meta: a.assetType,
        }))}
      />
    </div>
  );
}

export default function MemoryDashboard() {
  const { data, isLoading, isError } = useMemoryOverview();

  if (isLoading) return <LoadingState />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <p className="p-12 text-center text-sm text-destructive">
            Failed to load the memory dashboard.
          </p>
        </Card>
      </div>
    );
  }
  return <Content ov={data} />;
}
