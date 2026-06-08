import { useState } from "react";
import {
  Sparkles,
  Send,
  Brain,
  FileText,
  FolderTree,
  Scale,
  ListTodo,
  CornerDownRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useExecutiveQuery,
  type ExecutiveQueryReference,
  type ExecutiveQueryReferenceType,
} from "@/hooks/useJarvisApi";

const EXAMPLE_QUERIES = [
  "What businesses do I own?",
  "Summarize AICandlez.",
  "Explain Natura AI.",
  "What projects are active?",
  "What agents exist?",
  "Give me my executive briefing.",
];

const REFERENCE_ICONS: Record<
  ExecutiveQueryReferenceType,
  React.ComponentType<{ className?: string }>
> = {
  memory: Brain,
  asset: FileText,
  category: FolderTree,
  decision: Scale,
  task: ListTodo,
};

function ReferenceCard({ reference }: { reference: ExecutiveQueryReference }) {
  const Icon = REFERENCE_ICONS[reference.type] ?? FileText;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          {reference.title}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="capitalize text-[10px]">
            {reference.type}
          </Badge>
          {reference.hop === 1 ? (
            <Badge variant="secondary" className="text-[10px]">
              related
            </Badge>
          ) : null}
        </div>
      </div>
      {reference.snippet ? (
        <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">
          {reference.snippet}
        </p>
      ) : null}
    </Card>
  );
}

export default function ExecutiveQuery() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, isLoading, isFetching, isError } = useExecutiveQuery(submitted);

  function ask(term: string) {
    const t = term.trim();
    setInput(t);
    setSubmitted(t);
  }

  const showResults = submitted.trim().length > 0;
  const busy = showResults && (isLoading || isFetching);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" /> Executive Query
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask a question in plain language. Answers are grounded in your
          activated executive memory, with references to the source records.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your businesses, agents, projects…"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={input.trim().length === 0}>
            <Send className="h-4 w-4" /> Ask
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_QUERIES.map((q) => (
            <Button
              key={q}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => ask(q)}
            >
              {q}
            </Button>
          ))}
        </div>
      </form>

      {!showResults ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ask a question to query your executive memory.
          </p>
        </Card>
      ) : busy ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            The query could not be completed. Please try again.
          </p>
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="uppercase tracking-wide">
                {data.answerSource === "synthesized"
                  ? "AI answer"
                  : data.answerSource === "extractive"
                    ? "Memory extract"
                    : "No answer"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {data.retrievalMode} retrieval
              </Badge>
              <Badge variant="outline">
                grounding{" "}
                {data.groundingScore === null ? "—" : `${data.groundingScore}%`}
              </Badge>
            </div>

            {data.answer ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {data.answer}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No grounded answer is available for this question yet. Try
                rephrasing, or add the underlying information to memory.
              </p>
            )}

            {data.degradedReason ? (
              <p className="text-xs text-muted-foreground/70">
                Note: {data.degradedReason}
              </p>
            ) : null}
          </Card>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CornerDownRight className="h-4 w-4 text-primary" /> References
              <Badge variant="secondary">{data.references.length}</Badge>
            </h2>
            {data.references.length > 0 ? (
              <div className="space-y-2">
                {data.references.map((ref) => (
                  <ReferenceCard key={`${ref.type}:${ref.id}`} reference={ref} />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No memory records matched this question.
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
