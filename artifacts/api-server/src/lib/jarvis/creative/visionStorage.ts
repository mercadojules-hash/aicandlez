import { randomUUID } from "crypto";
import { ObjectStorageService } from "../../objectStorage.js";

/**
 * Server-side object-storage write path for the creative agents' binary assets
 * (Vision images, Phoenix videos).
 *
 * The agents generate binary bytes in the api-server runtime (not the browser),
 * so they upload them here: request a presigned PUT URL, PUT the bytes to GCS,
 * then normalize the URL into the canonical `/objects/...` storage key that the
 * DB persists (the DB NEVER holds binary bytes — only this key + mimeType).
 *
 * Vault-portability: the storage key is a stable, bucket-relative pointer, so a
 * future Vault export can walk jarvis_creative_assets.storage_key and copy each
 * object out of the bucket without touching Postgres bytes.
 *
 * Fail-safe: a storage outage resolves to `null` (never throws) so the agent
 * keeps the grounded TEXT artifact and only the binary degrades.
 */

export interface UploadedBinary {
  /** Canonical `/objects/...` key persisted to jarvis_creative_assets. */
  storageKey: string;
  mimeType: string;
  bytes: number;
}

/**
 * Generic creative-binary upload. `owner` tags the private ACL for diagnostics
 * (e.g. "jarvis-vision", "jarvis-phoenix"). The object is marked private — it is
 * served only through the admin-gated, audited serve route, never publicly.
 */
export async function uploadCreativeBinary(
  bytes: Buffer,
  contentType: string,
  owner: string,
): Promise<UploadedBinary | null> {
  try {
    if (!process.env.PRIVATE_OBJECT_DIR?.trim()) return null;
    const svc = new ObjectStorageService();
    const uploadUrl = await svc.getObjectEntityUploadURL();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(120_000),
    });
    if (!put.ok) return null;
    const storageKey = svc.normalizeObjectEntityPath(uploadUrl);
    if (!storageKey.startsWith("/objects/")) return null;
    try {
      await svc.trySetObjectEntityAclPolicy(storageKey, {
        owner,
        visibility: "private",
      });
    } catch {
      // ACL is best-effort; the serve route is already admin-gated.
    }
    return { storageKey, mimeType: contentType, bytes: bytes.length };
  } catch {
    return null;
  }
}

/** Vision image upload — thin wrapper over the generic binary path. */
export async function uploadCreativeImage(
  bytes: Buffer,
  contentType: string,
): Promise<UploadedBinary | null> {
  return uploadCreativeBinary(bytes, contentType, "jarvis-vision");
}

/** Stable, collision-resistant object id for diagnostics / future Vault naming. */
export function newAssetObjectId(): string {
  return randomUUID();
}
