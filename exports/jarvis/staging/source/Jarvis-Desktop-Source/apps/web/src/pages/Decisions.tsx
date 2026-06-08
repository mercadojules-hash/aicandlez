import { RegistryView, StatusBadge } from "@/components/RegistryView";
import {
  useDecisions,
  useCreateDecision,
  useUpdateDecision,
  useDeleteDecision,
  useBusinesses,
} from "@/hooks/useJarvisApi";

const UNASSIGNED = "__none__";

export default function Decisions() {
  const { data, isLoading, isError } = useDecisions();
  const { data: businesses } = useBusinesses();
  const create = useCreateDecision();
  const update = useUpdateDecision();
  const remove = useDeleteDecision();

  const businessName = (id: string | null) =>
    id ? (businesses?.find((b) => b.id === id)?.name ?? "—") : "—";

  const businessOptions = [
    { label: "Unassigned", value: UNASSIGNED },
    ...(businesses ?? []).map((b) => ({ label: b.name, value: b.id })),
  ];

  const resolveBusinessId = (v: string) => (v && v !== UNASSIGNED ? v : null);

  return (
    <RegistryView
      title="Decisions"
      description="The decision log — proposals, rulings, and their rationale."
      entityLabel="Decision"
      items={data}
      isLoading={isLoading}
      isError={isError}
      isMutating={create.isPending || update.isPending}
      columns={[
        {
          key: "title",
          label: "Title",
          render: (r) => <span className="font-medium">{r.title}</span>,
        },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        {
          key: "business",
          label: "Business",
          render: (r) => (
            <span className="text-muted-foreground">{businessName(r.businessId)}</span>
          ),
        },
        {
          key: "decidedBy",
          label: "Decided By",
          render: (r) => <span className="text-muted-foreground">{r.decidedBy ?? "—"}</span>,
        },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, placeholder: "e.g. Adopt new pricing tier" },
        { name: "context", label: "Context", type: "textarea", placeholder: "What prompted this?" },
        { name: "decision", label: "Decision", type: "textarea", placeholder: "What was decided?" },
        { name: "rationale", label: "Rationale", type: "textarea", placeholder: "Why?" },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: "proposed",
          options: [
            { label: "Proposed", value: "proposed" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
            { label: "Deferred", value: "deferred" },
          ],
        },
        {
          name: "businessId",
          label: "Business",
          type: "select",
          defaultValue: UNASSIGNED,
          options: businessOptions,
        },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        context: r.context ?? "",
        decision: r.decision ?? "",
        rationale: r.rationale ?? "",
        status: r.status,
        businessId: r.businessId ?? UNASSIGNED,
      })}
      onCreate={(v) =>
        create.mutateAsync({
          title: v.title,
          context: v.context || null,
          decision: v.decision || null,
          rationale: v.rationale || null,
          status: v.status,
          businessId: resolveBusinessId(v.businessId),
        })
      }
      onUpdate={(id, v) =>
        update.mutateAsync({
          id,
          title: v.title,
          context: v.context || null,
          decision: v.decision || null,
          rationale: v.rationale || null,
          status: v.status,
          businessId: resolveBusinessId(v.businessId),
        })
      }
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
