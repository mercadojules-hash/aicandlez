import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useBusinesses,
  useCreateBusiness,
  useUpdateBusiness,
  useDeleteBusiness,
} from "@/hooks/useJarvisApi";

function parseRevenue(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  const n = Number(s.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatRevenue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString()}`;
}

export default function Businesses() {
  const { data, isLoading, isError } = useBusinesses();
  const create = useCreateBusiness();
  const update = useUpdateBusiness();
  const remove = useDeleteBusiness();

  return (
    <RegistryView
      title="Businesses"
      description="The portfolio of companies under management."
      entityLabel="Business"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "slug", label: "Slug", render: (r) => <span className="text-muted-foreground">{r.slug}</span> },
        {
          key: "description",
          label: "Description",
          render: (r) => (
            <span className="line-clamp-1 text-muted-foreground">{r.description ?? "—"}</span>
          ),
        },
        {
          key: "monthlyRevenue",
          label: "Monthly Rev.",
          render: (r) => (
            <span className="font-mono text-muted-foreground">{formatRevenue(r.monthlyRevenue)}</span>
          ),
        },
        {
          key: "healthStatus",
          label: "Health",
          render: (r) => (
            <span className="font-mono uppercase text-muted-foreground">{r.healthStatus ?? "—"}</span>
          ),
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: "name", label: "Name", required: true, placeholder: "e.g. AICandlez" },
        { name: "description", label: "Description", type: "textarea", placeholder: "What does this business do?" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "Paused", value: "paused" },
            { label: "Archived", value: "archived" },
          ],
        },
        {
          name: "monthlyRevenue",
          label: "Monthly Revenue (USD)",
          placeholder: "e.g. 50000 — leave blank if unknown",
        },
        {
          name: "healthStatus",
          label: "Health",
          type: "select",
          defaultValue: "",
          options: [
            { label: "—", value: "" },
            { label: "Healthy", value: "healthy" },
            { label: "Watch", value: "watch" },
            { label: "Critical", value: "critical" },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        description: r.description ?? "",
        status: r.status,
        monthlyRevenue: r.monthlyRevenue != null ? String(r.monthlyRevenue) : "",
        healthStatus: r.healthStatus ?? "",
      })}
      onCreate={(v) =>
        create.mutateAsync({
          name: v.name,
          description: v.description || null,
          status: v.status,
          monthlyRevenue: parseRevenue(v.monthlyRevenue),
          healthStatus: v.healthStatus || null,
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          name: v.name,
          description: v.description || null,
          status: v.status,
          monthlyRevenue: parseRevenue(v.monthlyRevenue),
          healthStatus: v.healthStatus || null,
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
