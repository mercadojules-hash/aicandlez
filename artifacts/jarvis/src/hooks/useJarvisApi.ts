import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { authFetchJson } from "@/lib/authFetch";

// ─────────────────────────────────────────────────────────────────────────────
// Typed react-query hooks for the Jarvis `/api/jarvis/*` surface. Every call
// routes through authFetch (locked transport invariant). No codegen — Jarvis
// owns its own contract types here.
// ─────────────────────────────────────────────────────────────────────────────

export interface JarvisBusiness {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisProject {
  id: string;
  businessId: string | null;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisAgent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisWorkflow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisAuditLog {
  id: string;
  userId: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface JarvisTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  businessId: string | null;
  projectId: string | null;
  assigneeAgentId: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisDecision {
  id: string;
  title: string;
  context: string | null;
  decision: string | null;
  rationale: string | null;
  status: string;
  businessId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisEscalation {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  businessId: string | null;
  assigneeAgentId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisApproval {
  id: string;
  title: string;
  description: string | null;
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  businessId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisOperations {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
  };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
  };
  escalations: {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    open: number;
    criticalOpen: number;
  };
  approvals: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
  };
  queues: {
    openTasks: JarvisTask[];
    openEscalations: JarvisEscalation[];
    pendingApprovals: JarvisApproval[];
    recentDecisions: JarvisDecision[];
  };
  generatedAt: number;
}

export interface JarvisDashboard {
  counts: {
    businesses: number;
    projects: number;
    agents: number;
    workflows: number;
  };
  recentActivity: JarvisAuditLog[];
  systemHealth: {
    apiStatus: string;
    databaseStatus: string;
    uptimeSeconds: number;
    activeAgents: number;
    activeWorkflows: number;
    timestamp: number;
  };
  generatedAt: number;
}

export type JarvisSettings = Record<string, unknown>;

const API = "/api/jarvis";

export const jarvisKeys = {
  dashboard: ["jarvis", "dashboard"] as const,
  businesses: ["jarvis", "businesses"] as const,
  projects: ["jarvis", "projects"] as const,
  agents: ["jarvis", "agents"] as const,
  workflows: ["jarvis", "workflows"] as const,
  auditLogs: ["jarvis", "audit-logs"] as const,
  settings: ["jarvis", "settings"] as const,
  tasks: ["jarvis", "tasks"] as const,
  decisions: ["jarvis", "decisions"] as const,
  escalations: ["jarvis", "escalations"] as const,
  approvals: ["jarvis", "approvals"] as const,
  operations: ["jarvis", "operations"] as const,
};

// ── dashboard ────────────────────────────────────────────────────────────────

export function useJarvisDashboard(): UseQueryResult<JarvisDashboard> {
  return useQuery({
    queryKey: jarvisKeys.dashboard,
    queryFn: () => authFetchJson<JarvisDashboard>(`${API}/dashboard`),
    refetchInterval: 15000,
  });
}

// ── generic CRUD factory ─────────────────────────────────────────────────────

interface EntityConfig<T> {
  path: string;
  listKey: readonly unknown[];
  listField: string;
  itemField: string;
}

function makeListHook<T>(cfg: EntityConfig<T>) {
  return (): UseQueryResult<T[]> =>
    useQuery({
      queryKey: cfg.listKey,
      queryFn: async () => {
        const data = await authFetchJson<Record<string, T[]>>(`${API}/${cfg.path}`);
        return data[cfg.listField] ?? [];
      },
    });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["jarvis"] });
  };
}

// ── businesses ───────────────────────────────────────────────────────────────

export interface BusinessInput {
  name: string;
  description?: string | null;
  status?: string;
}

export const useBusinesses = makeListHook<JarvisBusiness>({
  path: "businesses",
  listKey: jarvisKeys.businesses,
  listField: "businesses",
  itemField: "business",
});

export function useCreateBusiness() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: BusinessInput) =>
      authFetchJson<{ business: JarvisBusiness }>(`${API}/businesses`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateBusiness() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: BusinessInput & { id: string }) =>
      authFetchJson<{ business: JarvisBusiness }>(`${API}/businesses/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteBusiness() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/businesses/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── projects ─────────────────────────────────────────────────────────────────

export interface ProjectInput {
  name: string;
  businessId?: string | null;
  description?: string | null;
  status?: string;
}

export const useProjects = makeListHook<JarvisProject>({
  path: "projects",
  listKey: jarvisKeys.projects,
  listField: "projects",
  itemField: "project",
});

export function useCreateProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      authFetchJson<{ project: JarvisProject }>(`${API}/projects`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: ProjectInput & { id: string }) =>
      authFetchJson<{ project: JarvisProject }>(`${API}/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/projects/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── agents ───────────────────────────────────────────────────────────────────

export interface AgentInput {
  name: string;
  role?: string | null;
  description?: string | null;
  status?: string;
}

export const useAgents = makeListHook<JarvisAgent>({
  path: "agents",
  listKey: jarvisKeys.agents,
  listField: "agents",
  itemField: "agent",
});

export function useCreateAgent() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: AgentInput) =>
      authFetchJson<{ agent: JarvisAgent }>(`${API}/agents`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateAgent() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: AgentInput & { id: string }) =>
      authFetchJson<{ agent: JarvisAgent }>(`${API}/agents/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteAgent() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/agents/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── workflows ────────────────────────────────────────────────────────────────

export interface WorkflowInput {
  name: string;
  description?: string | null;
  trigger?: string | null;
  status?: string;
}

export const useWorkflows = makeListHook<JarvisWorkflow>({
  path: "workflows",
  listKey: jarvisKeys.workflows,
  listField: "workflows",
  itemField: "workflow",
});

export function useCreateWorkflow() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: WorkflowInput) =>
      authFetchJson<{ workflow: JarvisWorkflow }>(`${API}/workflows`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkflow() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: WorkflowInput & { id: string }) =>
      authFetchJson<{ workflow: JarvisWorkflow }>(`${API}/workflows/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkflow() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/workflows/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── audit logs ───────────────────────────────────────────────────────────────

export function useAuditLogs(limit = 100): UseQueryResult<JarvisAuditLog[]> {
  return useQuery({
    queryKey: [...jarvisKeys.auditLogs, limit],
    queryFn: async () => {
      const data = await authFetchJson<{ auditLogs: JarvisAuditLog[] }>(
        `${API}/audit-logs?limit=${limit}`,
      );
      return data.auditLogs ?? [];
    },
  });
}

// ── settings ─────────────────────────────────────────────────────────────────

export function useSettings(): UseQueryResult<JarvisSettings> {
  return useQuery({
    queryKey: jarvisKeys.settings,
    queryFn: async () => {
      const data = await authFetchJson<{ settings: JarvisSettings }>(`${API}/settings`);
      return data.settings ?? {};
    },
  });
}

export function useUpdateSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (patch: JarvisSettings) =>
      authFetchJson<{ settings: JarvisSettings }>(`${API}/settings`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  });
}

// ── tasks ────────────────────────────────────────────────────────────────────

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  businessId?: string | null;
  projectId?: string | null;
  assigneeAgentId?: string | null;
  dueAt?: string | null;
}

export const useTasks = makeListHook<JarvisTask>({
  path: "tasks",
  listKey: jarvisKeys.tasks,
  listField: "tasks",
  itemField: "task",
});

export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: TaskInput) =>
      authFetchJson<{ task: JarvisTask }>(`${API}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: TaskInput & { id: string }) =>
      authFetchJson<{ task: JarvisTask }>(`${API}/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── decisions ────────────────────────────────────────────────────────────────

export interface DecisionInput {
  title: string;
  context?: string | null;
  decision?: string | null;
  rationale?: string | null;
  status?: string;
  businessId?: string | null;
}

export const useDecisions = makeListHook<JarvisDecision>({
  path: "decisions",
  listKey: jarvisKeys.decisions,
  listField: "decisions",
  itemField: "decision",
});

export function useCreateDecision() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: DecisionInput) =>
      authFetchJson<{ decision: JarvisDecision }>(`${API}/decisions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateDecision() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: DecisionInput & { id: string }) =>
      authFetchJson<{ decision: JarvisDecision }>(`${API}/decisions/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteDecision() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/decisions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── escalations ──────────────────────────────────────────────────────────────

export interface EscalationInput {
  title: string;
  description?: string | null;
  severity?: string;
  status?: string;
  businessId?: string | null;
  assigneeAgentId?: string | null;
}

export const useEscalations = makeListHook<JarvisEscalation>({
  path: "escalations",
  listKey: jarvisKeys.escalations,
  listField: "escalations",
  itemField: "escalation",
});

export function useCreateEscalation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: EscalationInput) =>
      authFetchJson<{ escalation: JarvisEscalation }>(`${API}/escalations`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateEscalation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: EscalationInput & { id: string }) =>
      authFetchJson<{ escalation: JarvisEscalation }>(`${API}/escalations/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteEscalation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/escalations/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── approvals ────────────────────────────────────────────────────────────────

export interface ApprovalInput {
  title: string;
  description?: string | null;
  status?: string;
  businessId?: string | null;
}

export const useApprovals = makeListHook<JarvisApproval>({
  path: "approvals",
  listKey: jarvisKeys.approvals,
  listField: "approvals",
  itemField: "approval",
});

export function useCreateApproval() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ApprovalInput) =>
      authFetchJson<{ approval: JarvisApproval }>(`${API}/approvals`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateApproval() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...input }: ApprovalInput & { id: string }) =>
      authFetchJson<{ approval: JarvisApproval }>(`${API}/approvals/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteApproval() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      authFetchJson<{ ok: boolean }>(`${API}/approvals/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── operations dashboard ─────────────────────────────────────────────────────

export function useOperations(): UseQueryResult<JarvisOperations> {
  return useQuery({
    queryKey: jarvisKeys.operations,
    queryFn: () => authFetchJson<JarvisOperations>(`${API}/operations`),
    refetchInterval: 15000,
  });
}
