import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  useRelationships,
  useCreateRelationship,
  useDeleteRelationship,
  useMemories,
  useAssets,
  useCategories,
  useDecisions,
  useTasks,
  type KnowledgeNodeType,
  type JarvisKnowledgeRelationship,
} from "@/hooks/useJarvisApi";

const NODE_TYPES: { label: string; value: KnowledgeNodeType }[] = [
  { label: "Memory", value: "memory" },
  { label: "Knowledge Asset", value: "asset" },
  { label: "Category", value: "category" },
  { label: "Decision", value: "decision" },
  { label: "Task", value: "task" },
];

const RELATION_TYPES = [
  "relates_to",
  "depends_on",
  "derived_from",
  "supersedes",
  "references",
  "contradicts",
];

interface NodeOption {
  id: string;
  label: string;
}

export default function Relationships() {
  const { data, isLoading, isError } = useRelationships();
  const create = useCreateRelationship();
  const remove = useDeleteRelationship();

  const { data: memories } = useMemories();
  const { data: assets } = useAssets();
  const { data: categories } = useCategories();
  const { data: decisions } = useDecisions();
  const { data: tasks } = useTasks();

  const nodesByType = useMemo<Record<KnowledgeNodeType, NodeOption[]>>(
    () => ({
      memory: (memories ?? []).map((m) => ({ id: m.id, label: m.title })),
      asset: (assets ?? []).map((a) => ({ id: a.id, label: a.title })),
      category: (categories ?? []).map((c) => ({ id: c.id, label: c.name })),
      decision: (decisions ?? []).map((d) => ({ id: d.id, label: d.title })),
      task: (tasks ?? []).map((t) => ({ id: t.id, label: t.title })),
    }),
    [memories, assets, categories, decisions, tasks],
  );

  const labelOf = (type: string, id: string) => {
    const list = nodesByType[type as KnowledgeNodeType] ?? [];
    return list.find((n) => n.id === id)?.label ?? id.slice(0, 8);
  };

  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<KnowledgeNodeType>("memory");
  const [sourceId, setSourceId] = useState("");
  const [targetType, setTargetType] = useState<KnowledgeNodeType>("memory");
  const [targetId, setTargetId] = useState("");
  const [relationType, setRelationType] = useState("relates_to");
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState<JarvisKnowledgeRelationship | null>(null);

  function reset() {
    setSourceType("memory");
    setSourceId("");
    setTargetType("memory");
    setTargetId("");
    setRelationType("relates_to");
    setNote("");
  }

  async function submit() {
    await create.mutateAsync({
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationType,
      note: note || null,
    });
    setOpen(false);
    reset();
  }

  const selfLink = sourceType === targetType && sourceId === targetId;
  const invalid = !sourceId || !targetId || selfLink;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Relationships</h1>
          <p className="text-sm text-muted-foreground">
            Typed edges connecting memories, assets, categories, decisions, and tasks.
          </p>
        </div>
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New Relationship
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            Failed to load relationships.
          </p>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Relation</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {r.sourceType}
                      </Badge>
                      <span className="font-medium">{labelOf(r.sourceType, r.sourceId)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                      <ArrowRight className="h-3.5 w-3.5" />
                      {r.relationType}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {r.targetType}
                      </Badge>
                      <span className="font-medium">{labelOf(r.targetType, r.targetId)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground line-clamp-1">{r.note ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">No relationships yet.</p>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Create your first relationship
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Relationship</DialogTitle>
            <DialogDescription>
              Connect two knowledge nodes with a typed, directional edge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source Type</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) => {
                    setSourceType(v as KnowledgeNodeType);
                    setSourceId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select node" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nodesByType[sourceType] ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Relation Type</Label>
              <Select value={relationType} onValueChange={setRelationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target Type</Label>
                <Select
                  value={targetType}
                  onValueChange={(v) => {
                    setTargetType(v as KnowledgeNodeType);
                    setTargetId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select node" />
                  </SelectTrigger>
                  <SelectContent>
                    {(nodesByType[targetType] ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rel-note">Note</Label>
              <Input
                id="rel-note"
                value={note}
                placeholder="Optional context"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {selfLink ? (
              <p className="text-xs text-destructive">
                A node cannot be linked to itself.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={invalid || create.isPending}>
              Create Relationship
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
            <AlertDialogTitle>Delete relationship?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
