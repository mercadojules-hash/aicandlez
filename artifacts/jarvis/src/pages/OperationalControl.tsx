import { useMemo, useState } from "react";
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  GitBranch,
  BookOpen,
  GitCommit,
  GitPullRequest,
  CircleDot,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/RegistryView";
import {
  useBusinesses,
  useSystems,
  useSystem,
  useCreateSystem,
  useUpdateSystem,
  useDeleteSystem,
  useCreateRepository,
  useDeleteRepository,
  useCreateRunbook,
  useDeleteRunbook,
  type JarvisSystem,
  type JarvisRepository,
  type JarvisRunbook,
} from "@/hooks/useJarvisApi";

const SYSTEM_KINDS = [
  "web",
  "api",
  "mobile",
  "service",
  "infra",
  "data",
  "other",
] as const;

const RUNBOOK_KINDS = [
  "deployment",
  "rollback",
  "update",
  "monitoring",
  "operational",
  "disaster_recovery",
  "other",
] as const;

const DASH = "—";

function dash(v: string | null | undefined): string {
  return v && v.trim() ? v : DASH;
}

function formatTimestamp(v: string | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString();
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : DASH;
}

interface SystemFormValues {
  name: string;
  businessId: string;
  kind: string;
  status: string;
  description: string;
  architecture: string;
  infrastructure: string;
  buildProcess: string;
}

const EMPTY_SYSTEM_FORM: SystemFormValues = {
  name: "",
  businessId: "",
  kind: "service",
  status: "active",
  description: "",
  architecture: "",
  infrastructure: "",
  buildProcess: "",
};

export default function OperationalControl() {
  const { data: businesses } = useBusinesses();
  const { data: systems, isLoading, isError } = useSystems();
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const deleteSystem = useDeleteSystem();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [systemFormOpen, setSystemFormOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<JarvisSystem | null>(null);
  const [systemForm, setSystemForm] = useState<SystemFormValues>(EMPTY_SYSTEM_FORM);
  const [deletingSystem, setDeletingSystem] = useState<JarvisSystem | null>(null);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && systems?.some((s) => s.id === selectedId)) return selectedId;
    return systems && systems.length > 0 ? systems[0].id : null;
  }, [selectedId, systems]);

  const businessName = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of businesses ?? []) map.set(b.id, b.name);
    return (id: string | null) => (id ? (map.get(id) ?? DASH) : DASH);
  }, [businesses]);

  function openCreateSystem() {
    setEditingSystem(null);
    setSystemForm(EMPTY_SYSTEM_FORM);
    setSystemFormOpen(true);
  }

  function openEditSystem(s: JarvisSystem) {
    setEditingSystem(s);
    setSystemForm({
      name: s.name,
      businessId: s.businessId ?? "",
      kind: s.kind,
      status: s.status,
      description: s.description ?? "",
      architecture: s.architecture ?? "",
      infrastructure: s.infrastructure ?? "",
      buildProcess: s.buildProcess ?? "",
    });
    setSystemFormOpen(true);
  }

  async function submitSystem() {
    const payload = {
      name: systemForm.name,
      businessId: systemForm.businessId || null,
      kind: systemForm.kind,
      status: systemForm.status,
      description: systemForm.description || null,
      architecture: systemForm.architecture || null,
      infrastructure: systemForm.infrastructure || null,
      buildProcess: systemForm.buildProcess || null,
    };
    if (editingSystem) {
      await updateSystem.mutateAsync({ id: editingSystem.id, ...payload });
    } else {
      const created = await createSystem.mutateAsync(payload);
      setSelectedId(created.system.id);
    }
    setSystemFormOpen(false);
  }

  const systemMutating = createSystem.isPending || updateSystem.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Operational Control
          </h1>
          <p className="text-sm text-muted-foreground">
            How every managed system is built, deployed, run, monitored, and
            recovered — with live repository awareness.
          </p>
        </div>
        <Button onClick={openCreateSystem}>
          <Plus className="mr-1.5 h-4 w-4" /> New System
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Systems
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="p-8 text-center text-sm text-destructive">
              Failed to load systems.
            </p>
          ) : systems && systems.length > 0 ? (
            <ul className="divide-y divide-border">
              {systems.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
                      s.id === effectiveSelectedId
                        ? "bg-primary/10"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <Server className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.name}
                      </span>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {s.kind}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {businessName(s.businessId)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">No systems yet.</p>
              <Button variant="outline" onClick={openCreateSystem}>
                <Plus className="mr-1.5 h-4 w-4" /> Create your first system
              </Button>
            </div>
          )}
        </Card>

        {effectiveSelectedId ? (
          <SystemDetail
            systemId={effectiveSelectedId}
            businessName={businessName}
            onEdit={openEditSystem}
            onDelete={setDeletingSystem}
          />
        ) : (
          <Card className="flex items-center justify-center p-16 text-sm text-muted-foreground">
            Select a system to view its operational dossier.
          </Card>
        )}
      </div>

      <Dialog open={systemFormOpen} onOpenChange={setSystemFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSystem ? "Edit System" : "New System"}
            </DialogTitle>
            <DialogDescription>
              Capture how this system is built, hosted, and operated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sys-name">
                Name<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="sys-name"
                value={systemForm.name}
                placeholder="e.g. AICandlez API"
                onChange={(e) =>
                  setSystemForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sys-business">Business</Label>
                <Select
                  value={systemForm.businessId || "none"}
                  onValueChange={(val) =>
                    setSystemForm((f) => ({
                      ...f,
                      businessId: val === "none" ? "" : val,
                    }))
                  }
                >
                  <SelectTrigger id="sys-business">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(businesses ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sys-kind">Kind</Label>
                <Select
                  value={systemForm.kind}
                  onValueChange={(val) =>
                    setSystemForm((f) => ({ ...f, kind: val }))
                  }
                >
                  <SelectTrigger id="sys-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_KINDS.map((k) => (
                      <SelectItem key={k} value={k} className="capitalize">
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sys-status">Status</Label>
              <Select
                value={systemForm.status}
                onValueChange={(val) =>
                  setSystemForm((f) => ({ ...f, status: val }))
                }
              >
                <SelectTrigger id="sys-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sys-description">Description</Label>
              <Textarea
                id="sys-description"
                value={systemForm.description}
                placeholder="What this system does."
                onChange={(e) =>
                  setSystemForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sys-architecture">Architecture</Label>
              <Textarea
                id="sys-architecture"
                value={systemForm.architecture}
                placeholder="Components, services, data flow."
                onChange={(e) =>
                  setSystemForm((f) => ({ ...f, architecture: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sys-infrastructure">Infrastructure</Label>
              <Textarea
                id="sys-infrastructure"
                value={systemForm.infrastructure}
                placeholder="Hosting, regions, databases, networking."
                onChange={(e) =>
                  setSystemForm((f) => ({
                    ...f,
                    infrastructure: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sys-build">Build &amp; Deploy Process</Label>
              <Textarea
                id="sys-build"
                value={systemForm.buildProcess}
                placeholder="How it is built, tested, and shipped."
                onChange={(e) =>
                  setSystemForm((f) => ({ ...f, buildProcess: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSystemFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitSystem}
              disabled={!systemForm.name.trim() || systemMutating}
            >
              {editingSystem ? "Save changes" : "Create System"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingSystem !== null}
        onOpenChange={(open) => !open && setDeletingSystem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete system?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the system along with its repositories and runbooks.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletingSystem) {
                  await deleteSystem.mutateAsync(deletingSystem.id);
                  if (selectedId === deletingSystem.id) setSelectedId(null);
                }
                setDeletingSystem(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SystemDetail({
  systemId,
  businessName,
  onEdit,
  onDelete,
}: {
  systemId: string;
  businessName: (id: string | null) => string;
  onEdit: (s: JarvisSystem) => void;
  onDelete: (s: JarvisSystem) => void;
}) {
  const { data, isLoading, isError } = useSystem(systemId);

  if (isLoading) {
    return (
      <Card className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-12 text-center text-sm text-destructive">
        Failed to load system dossier.
      </Card>
    );
  }

  const { system, repositories, runbooks } = data;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {system.name}
            </h2>
            <Badge variant="outline" className="uppercase text-[10px]">
              {system.kind}
            </Badge>
            <StatusBadge status={system.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {businessName(system.businessId)} · {dash(system.description)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(system)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(system)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dossier" className="p-5">
        <TabsList>
          <TabsTrigger value="dossier">Dossier</TabsTrigger>
          <TabsTrigger value="repositories">
            Repositories ({repositories.length})
          </TabsTrigger>
          <TabsTrigger value="runbooks">
            Runbooks ({runbooks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dossier" className="mt-5 space-y-5">
          <DossierField label="Architecture" value={system.architecture} />
          <DossierField label="Infrastructure" value={system.infrastructure} />
          <DossierField
            label="Build & Deploy Process"
            value={system.buildProcess}
          />
        </TabsContent>

        <TabsContent value="repositories" className="mt-5">
          <RepositoriesTab systemId={system.id} repositories={repositories} />
        </TabsContent>

        <TabsContent value="runbooks" className="mt-5">
          <RunbooksTab systemId={system.id} runbooks={runbooks} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function DossierField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      {value && value.trim() ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{DASH}</p>
      )}
    </div>
  );
}

function RepositoriesTab({
  systemId,
  repositories,
}: {
  systemId: string;
  repositories: JarvisRepository[];
}) {
  const create = useCreateRepository();
  const remove = useDeleteRepository();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [url, setUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [deleting, setDeleting] = useState<JarvisRepository | null>(null);

  async function submit() {
    await create.mutateAsync({
      systemId,
      fullName,
      url: url || null,
      defaultBranch: defaultBranch || null,
    });
    setFullName("");
    setUrl("");
    setDefaultBranch("");
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Repository
        </Button>
      </div>

      {repositories.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No repositories linked yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {repositories.map((r) => (
            <li key={r.id}>
              <Card className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="flex items-center gap-2 font-medium">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.fullName}
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.provider}
                      </Badge>
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Default branch: {dash(r.defaultBranch)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric
                    icon={<GitCommit className="h-3.5 w-3.5" />}
                    label="Last commit"
                    value={shortSha(r.lastCommitSha)}
                  />
                  <Metric
                    icon={<GitPullRequest className="h-3.5 w-3.5" />}
                    label="Open PRs"
                    value={r.openPrCount == null ? DASH : String(r.openPrCount)}
                  />
                  <Metric
                    icon={<CircleDot className="h-3.5 w-3.5" />}
                    label="CI status"
                    value={dash(r.lastWorkflowConclusion ?? r.lastWorkflowStatus)}
                  />
                  <Metric
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label="Synced"
                    value={formatTimestamp(r.lastSyncedAt)}
                  />
                </div>

                {r.lastCommitMessage ? (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {r.lastCommitMessage}
                    {r.lastCommitAuthor ? ` — ${r.lastCommitAuthor}` : ""}
                  </p>
                ) : null}
                {r.syncError ? (
                  <p className="text-xs text-destructive">
                    Sync error: {r.syncError}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Link a source repository. GitHub awareness fills in live commit, PR,
              and CI data once connected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="repo-fullname">
                Full name<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="repo-fullname"
                value={fullName}
                placeholder="owner/repo"
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repo-url">URL</Label>
              <Input
                id="repo-url"
                value={url}
                placeholder="https://github.com/owner/repo"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repo-branch">Default branch</Label>
              <Input
                id="repo-branch"
                value={defaultBranch}
                placeholder="main"
                onChange={(e) => setDefaultBranch(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!fullName.trim() || create.isPending}
            >
              Add Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove repository?</AlertDialogTitle>
            <AlertDialogDescription>
              This unlinks the repository from this system. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) await remove.mutateAsync(deleting.id);
                setDeleting(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-0.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="block truncate font-mono text-sm">{value}</span>
    </div>
  );
}

function RunbooksTab({
  systemId,
  runbooks,
}: {
  systemId: string;
  runbooks: JarvisRunbook[];
}) {
  const create = useCreateRunbook();
  const remove = useDeleteRunbook();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("operational");
  const [content, setContent] = useState("");
  const [deleting, setDeleting] = useState<JarvisRunbook | null>(null);

  async function submit() {
    await create.mutateAsync({
      systemId,
      title,
      kind,
      content: content || null,
    });
    setTitle("");
    setKind("operational");
    setContent("");
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Runbook
        </Button>
      </div>

      {runbooks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No runbooks documented yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {runbooks.map((rb) => (
            <li key={rb.id}>
              <Card className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    {rb.title}
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {rb.kind.replace(/_/g, " ")}
                    </Badge>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(rb)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {rb.content ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {rb.content}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{DASH}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Runbook</DialogTitle>
            <DialogDescription>
              Document an operational procedure for this system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rb-title">
                Title<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="rb-title"
                value={title}
                placeholder="e.g. Production deploy"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-kind">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="rb-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUNBOOK_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-content">Procedure</Label>
              <Textarea
                id="rb-content"
                value={content}
                placeholder="Step-by-step procedure."
                className="min-h-40"
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!title.trim() || create.isPending}>
              Add Runbook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete runbook?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) await remove.mutateAsync(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
