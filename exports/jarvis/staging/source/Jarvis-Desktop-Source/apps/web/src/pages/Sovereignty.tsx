import { useState } from "react";
import {
  ShieldCheck,
  FileText,
  Network,
  Server,
  Code2,
  Plus,
  Trash2,
  RefreshCw,
  Search as SearchIcon,
  KeyRound,
  CheckCircle2,
  CircleSlash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSovereigntyDocs,
  useIngestDocs,
  useSovereigntyInfra,
  useUpsertInfra,
  useDeleteInfra,
  useSovereigntyCredentials,
  useUpsertCredential,
  useDeleteCredential,
  useRefreshCredentialPresence,
  useSovereigntyRender,
  useSyncRender,
  useSovereigntyCodeStats,
  useSovereigntyCodeSearch,
  useReindexCode,
  type InfraResourceInput,
  type CredentialInput,
} from "@/hooks/useJarvisApi";

function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function fmtTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

const INFRA_TYPES = [
  "domain",
  "dns",
  "database",
  "hosting",
  "api",
  "external_service",
  "other",
];
const CREDENTIAL_CATEGORIES = [
  "api_key",
  "secret",
  "db_url",
  "oauth",
  "webhook",
  "vault_key",
  "other",
];

function DocsTab() {
  const { data, isLoading } = useSovereigntyDocs();
  const ingest = useIngestDocs();
  const docs = data?.docs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Curated operational documents ingested into the knowledge base and
          made searchable through Executive Query.
        </p>
        <Button
          size="sm"
          disabled={ingest.isPending}
          onClick={() => {
            ingest.mutate(undefined, {
              onSuccess: (s) =>
                toast.success(
                  `Ingested ${s.processed} documents (${s.created} new, ${s.updated} updated)`,
                ),
              onError: () => toast.error("Document ingestion failed"),
            });
          }}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {ingest.isPending ? "Ingesting" : "Ingest documents"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          No documents ingested yet. Run ingestion to ground Jarvis in the
          deployment, runbook, and architecture docs.
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">
                      {dash(doc.title)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {dash(doc.assetType)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {dash(doc.sourcePath)}
                  </div>
                  {doc.summary ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {doc.summary}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                  {fmtTime(doc.updatedAt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_INFRA: InfraResourceInput = {
  resourceType: "other",
  name: "",
  provider: "",
  purpose: "",
  location: "",
};

function InfraTab() {
  const { data, isLoading } = useSovereigntyInfra();
  const upsert = useUpsertInfra();
  const del = useDeleteInfra();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InfraResourceInput>(EMPTY_INFRA);
  const resources = data?.resources ?? [];

  function submit() {
    if (form.name.trim().length === 0) {
      toast.error("Name is required");
      return;
    }
    upsert.mutate(form, {
      onSuccess: () => {
        toast.success("Resource saved");
        setOpen(false);
        setForm(EMPTY_INFRA);
      },
      onError: () => toast.error("Save failed"),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Domains, DNS, databases, hosting, and APIs. Purpose, location, and
          dependencies only — never secret values.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add resource
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : resources.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          No infrastructure resources registered yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {resources.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {dash(r.resourceType)}
                    </Badge>
                    <span className="truncate text-[13px] font-semibold">
                      {dash(r.name)}
                    </span>
                  </div>
                  <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                    <span>Provider: {dash(r.provider)}</span>
                    <span>Purpose: {dash(r.purpose)}</span>
                    <span>Location: {dash(r.location)}</span>
                    {r.dependsOn && r.dependsOn.length > 0 ? (
                      <span>Depends on: {r.dependsOn.join(", ")}</span>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    del.mutate(r.id, {
                      onSuccess: () => toast.success("Resource removed"),
                      onError: () => toast.error("Delete failed"),
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add infrastructure resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Type</Label>
              <Select
                value={form.resourceType}
                onValueChange={(v) => setForm({ ...form, resourceType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INFRA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="aicandlez.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Provider</Label>
              <Input
                value={form.provider ?? ""}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="Render, Cloudflare, Replit"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Purpose</Label>
              <Input
                value={form.purpose ?? ""}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Primary customer portal host"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Location</Label>
              <Input
                value={form.location ?? ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Dashboard URL or endpoint (not a secret)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EMPTY_CRED: CredentialInput = {
  name: "",
  category: "other",
  purpose: "",
  storageLocation: "",
};

function CredentialsTab() {
  const { data, isLoading } = useSovereigntyCredentials();
  const upsert = useUpsertCredential();
  const del = useDeleteCredential();
  const refresh = useRefreshCredentialPresence();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CredentialInput>(EMPTY_CRED);
  const credentials = data?.credentials ?? [];
  const detected = data?.detectedEnvNames ?? [];

  function submit() {
    if (form.name.trim().length === 0) {
      toast.error("Name is required");
      return;
    }
    upsert.mutate(form, {
      onSuccess: () => {
        toast.success("Credential registered");
        setOpen(false);
        setForm(EMPTY_CRED);
      },
      onError: () => toast.error("Save failed"),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Credential awareness — names, purpose, storage location, and
          dependents. Values are never stored or shown.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => {
              refresh.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(`${r.present}/${r.checked} present`),
                onError: () => toast.error("Refresh failed"),
              });
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Verify presence
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : credentials.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          No credentials registered yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {credentials.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate font-mono text-[12px] font-semibold">
                      {dash(c.name)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {dash(c.category)}
                    </Badge>
                    {c.present === true ? (
                      <Badge className="gap-1 bg-emerald-600/20 text-[10px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        present
                      </Badge>
                    ) : c.present === false ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] text-amber-400"
                      >
                        <CircleSlash className="h-3 w-3" />
                        missing
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                    <span>Purpose: {dash(c.purpose)}</span>
                    <span>Stored in: {dash(c.storageLocation)}</span>
                    {c.dependentSystems && c.dependentSystems.length > 0 ? (
                      <span>Used by: {c.dependentSystems.join(", ")}</span>
                    ) : null}
                    <span>Verified: {fmtTime(c.lastVerifiedAt)}</span>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    del.mutate(c.id, {
                      onSuccess: () => toast.success("Credential removed"),
                      onError: () => toast.error("Delete failed"),
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-3">
        <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
          Detected environment variable names ({detected.length}) — names only
        </div>
        <div className="flex flex-wrap gap-1.5">
          {detected.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">—</span>
          ) : (
            detected.map((name) => (
              <Badge
                key={name}
                variant="outline"
                className="font-mono text-[10px]"
              >
                {name}
              </Badge>
            ))
          )}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register credential</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Name (env var / identifier)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="STRIPE_SECRET_KEY"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Purpose</Label>
              <Input
                value={form.purpose ?? ""}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Stripe live payments"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Storage location</Label>
              <Input
                value={form.storageLocation ?? ""}
                onChange={(e) =>
                  setForm({ ...form, storageLocation: e.target.value })
                }
                placeholder="Replit Secrets, Render env group"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenderTab() {
  const { data, isLoading } = useSovereigntyRender();
  const sync = useSyncRender();
  const configured = data?.configured ?? false;
  const services = data?.services ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Read-only Render awareness — services, deploys, and health. No deploy,
          restart, or rollback actions.
        </p>
        <Button
          size="sm"
          disabled={sync.isPending || !configured}
          onClick={() => {
            sync.mutate(undefined, {
              onSuccess: (r) =>
                r.configured
                  ? toast.success(`Synced ${r.synced} services`)
                  : toast.error("RENDER_API_KEY not configured"),
              onError: () => toast.error("Sync failed"),
            });
          }}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {sync.isPending ? "Syncing" : "Sync"}
        </Button>
      </div>

      {!configured ? (
        <Card className="border-amber-600/40 p-4 text-[12px] text-amber-300">
          Render integration is not configured. Add a read-only
          <span className="mx-1 font-mono">RENDER_API_KEY</span>
          to enable service and deploy awareness.
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : services.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          {configured
            ? "No services synced yet. Run a sync to populate Render awareness."
            : "—"}
        </Card>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-[13px] font-semibold">
                      {dash(s.name)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {dash(s.serviceType)}
                    </Badge>
                    {s.lastDeployStatus ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        {s.lastDeployStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                    <span>Branch: {dash(s.branch)}</span>
                    <span>Region: {dash(s.region)}</span>
                    <span>
                      Auto-deploy:{" "}
                      {s.autoDeploy === null ? "—" : s.autoDeploy ? "yes" : "no"}
                    </span>
                    <span>Last commit: {dash(s.lastDeployCommit)}</span>
                    <span>Last deploy: {fmtTime(s.lastDeployFinishedAt)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                  synced {fmtTime(s.lastSyncedAt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeTab() {
  const stats = useSovereigntyCodeStats();
  const reindex = useReindexCode();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const search = useSovereigntyCodeSearch(submitted, "", "");
  const results = search.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Lexical index of repository source, build, config, and schema files —
          where the code lives, with file references.
        </p>
        <Button
          size="sm"
          disabled={reindex.isPending}
          onClick={() => {
            reindex.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(
                  `Indexed ${r.scanned} files (${r.upserted} updated)`,
                ),
              onError: () => toast.error("Reindex failed"),
            });
          }}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {reindex.isPending ? "Indexing" : "Reindex"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">
            Files
          </div>
          <div className="text-lg font-bold">
            {stats.isLoading ? "—" : dash(stats.data?.totalFiles)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">
            Artifacts
          </div>
          <div className="text-lg font-bold">
            {stats.isLoading ? "—" : dash(stats.data?.byArtifact.length)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">
            Kinds
          </div>
          <div className="text-lg font-bold">
            {stats.isLoading ? "—" : dash(stats.data?.byKind.length)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">
            Last indexed
          </div>
          <div className="text-[12px] font-semibold">
            {stats.isLoading ? "—" : fmtTime(stats.data?.lastIndexedAt ?? null)}
          </div>
        </Card>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search paths, summaries, exported symbols"
        />
        <Button type="submit" size="sm">
          <SearchIcon className="mr-2 h-3.5 w-3.5" />
          Search
        </Button>
      </form>

      {submitted.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          Enter a query to locate code across the repository.
        </Card>
      ) : search.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : results.length === 0 ? (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          No matches for "{submitted}".
        </Card>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <Card key={r.path} className="p-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate font-mono text-[12px] font-semibold">
                  {r.path}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {dash(r.kind)}
                </Badge>
                {r.language ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-muted-foreground"
                  >
                    {r.language}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {dash(r.artifact)} · {r.lineCount === null ? "—" : r.lineCount}{" "}
                lines
              </div>
              {r.summary ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {r.summary}
                </p>
              ) : null}
              {r.symbols && r.symbols.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.symbols.slice(0, 12).map((sym) => (
                    <Badge
                      key={sym}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {sym}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sovereignty() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Sovereignty Layer</h1>
          <p className="text-[12px] text-muted-foreground">
            Self-grounding operational authority — docs, infrastructure, hosting,
            and code awareness. Read-only.
          </p>
        </div>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">
            <FileText className="mr-2 h-3.5 w-3.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="infra">
            <Network className="mr-2 h-3.5 w-3.5" />
            Infrastructure
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <KeyRound className="mr-2 h-3.5 w-3.5" />
            Credentials
          </TabsTrigger>
          <TabsTrigger value="render">
            <Server className="mr-2 h-3.5 w-3.5" />
            Render
          </TabsTrigger>
          <TabsTrigger value="code">
            <Code2 className="mr-2 h-3.5 w-3.5" />
            Code
          </TabsTrigger>
        </TabsList>
        <TabsContent value="docs" className="mt-4">
          <DocsTab />
        </TabsContent>
        <TabsContent value="infra" className="mt-4">
          <InfraTab />
        </TabsContent>
        <TabsContent value="credentials" className="mt-4">
          <CredentialsTab />
        </TabsContent>
        <TabsContent value="render" className="mt-4">
          <RenderTab />
        </TabsContent>
        <TabsContent value="code" className="mt-4">
          <CodeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
