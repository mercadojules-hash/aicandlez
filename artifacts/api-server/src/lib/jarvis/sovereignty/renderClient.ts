import { db, jarvisRenderServicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";

/**
 * Jarvis Render read-only awareness (Sovereignty Pillar 3).
 *
 * STRICTLY READ-ONLY: every call here is a GET against the Render API. There is
 * deliberately NO method to create, deploy, restart, suspend, or roll back a
 * service. Auth is a Bearer `RENDER_API_KEY`. When the key is absent the whole
 * pillar degrades to "not configured" (everything dashes) — it never throws.
 *
 * No environment values are persisted: only service/deploy metadata is cached
 * into `jarvis_render_services`.
 */

const RENDER_BASE = "https://api.render.com/v1";

export function isRenderConfigured(): boolean {
  return typeof process.env.RENDER_API_KEY === "string" &&
    process.env.RENDER_API_KEY.length > 0;
}

async function renderGet(path: string): Promise<unknown> {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error("render_not_configured");
  const res = await fetch(`${RENDER_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`render_${res.status}`);
  return res.json();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function asDate(v: unknown): Date | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RenderServiceAwareness {
  renderServiceId: string;
  name: string | null;
  serviceType: string | null;
  env: string | null;
  region: string | null;
  repo: string | null;
  branch: string | null;
  autoDeploy: boolean | null;
  suspended: string | null;
  dashboardUrl: string | null;
  serviceUrl: string | null;
  lastDeployId: string | null;
  lastDeployStatus: string | null;
  lastDeployCommit: string | null;
  lastDeployCreatedAt: Date | null;
  lastDeployFinishedAt: Date | null;
}

function projectService(svc: Record<string, unknown>): RenderServiceAwareness | null {
  const id = asString(svc.id);
  if (!id) return null;
  const details = asRecord(svc.serviceDetails);
  return {
    renderServiceId: id,
    name: asString(svc.name),
    serviceType: asString(svc.type),
    env: asString(svc.env) ?? asString(details?.env),
    region: asString(details?.region),
    repo: asString(svc.repo),
    branch: asString(svc.branch),
    autoDeploy:
      asString(svc.autoDeploy) === "yes"
        ? true
        : asString(svc.autoDeploy) === "no"
          ? false
          : asBool(svc.autoDeploy),
    suspended: asString(svc.suspended),
    dashboardUrl: asString(svc.dashboardUrl),
    serviceUrl: asString(details?.url),
    lastDeployId: null,
    lastDeployStatus: null,
    lastDeployCommit: null,
    lastDeployCreatedAt: null,
    lastDeployFinishedAt: null,
  };
}

/** Fetch the latest deploy for a service (soft-fail to nulls). */
async function fetchLatestDeploy(
  serviceId: string,
): Promise<Partial<RenderServiceAwareness>> {
  try {
    const list = await renderGet(
      `/services/${encodeURIComponent(serviceId)}/deploys?limit=1`,
    );
    const first = Array.isArray(list) ? asRecord(list[0]) : null;
    const deploy = asRecord(first?.deploy) ?? first;
    if (!deploy) return {};
    const commit = asRecord(deploy.commit);
    return {
      lastDeployId: asString(deploy.id),
      lastDeployStatus: asString(deploy.status),
      lastDeployCommit: asString(commit?.id),
      lastDeployCreatedAt: asDate(deploy.createdAt),
      lastDeployFinishedAt: asDate(deploy.finishedAt),
    };
  } catch {
    return {};
  }
}

/** Read-only fetch of all Render services + their latest deploy. */
export async function fetchRenderAwareness(): Promise<RenderServiceAwareness[]> {
  const list = await renderGet("/services?limit=100");
  const arr = Array.isArray(list) ? list : [];
  const out: RenderServiceAwareness[] = [];
  for (const item of arr) {
    const wrapper = asRecord(item);
    const svc = asRecord(wrapper?.service) ?? wrapper;
    if (!svc) continue;
    const projected = projectService(svc);
    if (!projected) continue;
    const deploy = await fetchLatestDeploy(projected.renderServiceId);
    out.push({ ...projected, ...deploy });
  }
  return out;
}

export interface RenderSyncResult {
  configured: boolean;
  synced: number;
  error: string | null;
  syncedAt: number;
}

/**
 * Sync Render awareness into `jarvis_render_services` (upsert by service id).
 * Fail-safe: returns {configured:false} when no key, {error} on API failure —
 * never throws.
 */
export async function syncRenderServices(): Promise<RenderSyncResult> {
  if (!isRenderConfigured()) {
    return { configured: false, synced: 0, error: null, syncedAt: Date.now() };
  }
  try {
    const services = await fetchRenderAwareness();
    const now = new Date();
    for (const s of services) {
      await db
        .insert(jarvisRenderServicesTable)
        .values({
          renderServiceId: s.renderServiceId,
          name: s.name,
          serviceType: s.serviceType,
          env: s.env,
          region: s.region,
          repo: s.repo,
          branch: s.branch,
          autoDeploy: s.autoDeploy,
          suspended: s.suspended,
          dashboardUrl: s.dashboardUrl,
          serviceUrl: s.serviceUrl,
          lastDeployId: s.lastDeployId,
          lastDeployStatus: s.lastDeployStatus,
          lastDeployCommit: s.lastDeployCommit,
          lastDeployCreatedAt: s.lastDeployCreatedAt,
          lastDeployFinishedAt: s.lastDeployFinishedAt,
          lastSyncedAt: now,
          syncError: null,
        })
        .onConflictDoUpdate({
          target: jarvisRenderServicesTable.renderServiceId,
          set: {
            name: s.name,
            serviceType: s.serviceType,
            env: s.env,
            region: s.region,
            repo: s.repo,
            branch: s.branch,
            autoDeploy: s.autoDeploy,
            suspended: s.suspended,
            dashboardUrl: s.dashboardUrl,
            serviceUrl: s.serviceUrl,
            lastDeployId: s.lastDeployId,
            lastDeployStatus: s.lastDeployStatus,
            lastDeployCommit: s.lastDeployCommit,
            lastDeployCreatedAt: s.lastDeployCreatedAt,
            lastDeployFinishedAt: s.lastDeployFinishedAt,
            lastSyncedAt: now,
            syncError: null,
            updatedAt: now,
          },
        });
    }
    return {
      configured: true,
      synced: services.length,
      error: null,
      syncedAt: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "render_sync_failed";
    logger.warn({ err }, "jarvis: syncRenderServices failed");
    return { configured: true, synced: 0, error: message, syncedAt: Date.now() };
  }
}

/** List the cached Render service awareness rows (fail-safe to []). */
export async function listRenderServices() {
  try {
    return await db
      .select()
      .from(jarvisRenderServicesTable)
      .orderBy(jarvisRenderServicesTable.name);
  } catch (err) {
    logger.warn({ err }, "jarvis: listRenderServices failed");
    return [];
  }
}
