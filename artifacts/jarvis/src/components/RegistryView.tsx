import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

export interface FieldConfig {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

export interface ColumnConfig<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
}

interface RegistryViewProps<T extends { id: string }> {
  title: string;
  description: string;
  entityLabel: string;
  items: T[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  columns: ColumnConfig<T>[];
  fields: FieldConfig[];
  toFormValues: (row: T) => Record<string, string>;
  onCreate: (values: Record<string, string>) => Promise<unknown>;
  onUpdate: (id: string, values: Record<string, string>) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isMutating?: boolean;
}

function emptyValues(fields: FieldConfig[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fields) v[f.name] = f.defaultValue ?? "";
  return v;
}

export function RegistryView<T extends { id: string }>({
  title,
  description,
  entityLabel,
  items,
  isLoading,
  isError,
  columns,
  fields,
  toFormValues,
  onCreate,
  onUpdate,
  onDelete,
  isMutating,
}: RegistryViewProps<T>) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string>>(emptyValues(fields));
  const [deleting, setDeleting] = useState<T | null>(null);

  function openCreate() {
    setEditing(null);
    setValues(emptyValues(fields));
    setFormOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setValues({ ...emptyValues(fields), ...toFormValues(row) });
    setFormOpen(true);
  }

  async function submit() {
    if (editing) await onUpdate(editing.id, values);
    else await onCreate(values);
    setFormOpen(false);
  }

  const requiredMissing = fields.some(
    (f) => f.required && !values[f.name]?.trim(),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> New {entityLabel}
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
            Failed to load {title.toLowerCase()}.
          </p>
        ) : items && items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>{c.render(row)}</TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No {title.toLowerCase()} yet.
            </p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Create your first {entityLabel}
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${entityLabel}` : `New ${entityLabel}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update this ${entityLabel.toLowerCase()}.`
                : `Add a new ${entityLabel.toLowerCase()} to the registry.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                  />
                ) : f.type === "select" ? (
                  <Select
                    value={values[f.name] ?? ""}
                    onValueChange={(val) =>
                      setValues((v) => ({ ...v, [f.name]: val }))
                    }
                  >
                    <SelectTrigger id={f.name}>
                      <SelectValue placeholder={f.placeholder ?? "Select"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={requiredMissing || isMutating}>
              {editing ? "Save changes" : `Create ${entityLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entityLabel.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) await onDelete(deleting.id);
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

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      : status === "paused" || status === "idle"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
        : "border-border bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`capitalize ${tone}`}>
      {status}
    </Badge>
  );
}
