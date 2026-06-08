import { useState } from "react";
import { Search as SearchIcon, Brain, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch, type KnowledgeNodeType } from "@/hooks/useJarvisApi";

export default function Search() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<KnowledgeNodeType[]>([]);
  const { data, isLoading, isFetching } = useSearch(query, filters);

  function toggle(type: KnowledgeNodeType) {
    setFilters((f) =>
      f.includes(type) ? f.filter((t) => t !== type) : [...f, type],
    );
  }

  const showResults = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Enterprise Search</h1>
        <p className="text-sm text-muted-foreground">
          Full-text search across executive memory and the knowledge repository.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories and knowledge assets…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Scope:</span>
          {(["memory", "asset"] as KnowledgeNodeType[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={filters.includes(t) ? "default" : "outline"}
              className="h-7 capitalize"
              onClick={() => toggle(t)}
            >
              {t === "memory" ? "Memories" : "Assets"}
            </Button>
          ))}
          {filters.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setFilters([])}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {!showResults ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <SearchIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Start typing to search the knowledge base.
          </p>
        </Card>
      ) : isLoading || isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data && data.total > 0 ? (
        <div className="space-y-6">
          {data.memories.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Brain className="h-4 w-4 text-primary" /> Memories
                <Badge variant="secondary">{data.memories.length}</Badge>
              </h2>
              <div className="space-y-2">
                {data.memories.map((m) => (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{m.title}</span>
                      <div className="flex shrink-0 gap-1.5">
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {m.memoryType}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {m.importance}
                        </Badge>
                      </div>
                    </div>
                    {m.content ? (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {m.content}
                      </p>
                    ) : null}
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {data.assets.length > 0 ? (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-primary" /> Knowledge Assets
                <Badge variant="secondary">{data.assets.length}</Badge>
              </h2>
              <div className="space-y-2">
                {data.assets.map((a) => (
                  <Card key={a.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{a.title}</span>
                      <Badge variant="outline" className="shrink-0 capitalize text-[10px]">
                        {a.assetType}
                      </Badge>
                    </div>
                    {a.summary ?? a.content ? (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {a.summary ?? a.content}
                      </p>
                    ) : null}
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No results for “{query}”.
          </p>
        </Card>
      )}
    </div>
  );
}
