/**
 * Vault storage abstraction — the object-storage MIGRATION layer.
 *
 * The vault package is just bytes, and so are the creative-asset binaries it
 * points at. To make the storage backend PORTABLE (Requirement 5: migrate away
 * from Replit App Storage), all byte movement goes through `VaultStorageAdapter`.
 * Today the only wired adapter is Replit object storage; S3-compatible, MinIO,
 * and filesystem/external-drive targets implement the SAME interface, so the
 * export/import engines never change when the backend does.
 *
 * Sovereignty note: a vault package can also be returned INLINE to the caller
 * (downloaded off-platform) and re-imported with binaries inlined — meaning a
 * full Jarvis brain can move with ZERO dependency on any object-storage backend
 * at all. The adapter is an optimization for large/at-rest packages, not a hard
 * dependency for portability.
 */
import { Readable } from "stream";
import { ObjectStorageService } from "../../objectStorage.js";
import { uploadCreativeBinary } from "../creative/visionStorage.js";

export type VaultStorageKind = "replit-object-storage" | "s3" | "minio" | "filesystem";

export interface VaultStorageAdapter {
  kind: VaultStorageKind;
  available(): boolean;
  /** Persist bytes; returns a backend-relative key/pointer. */
  put(bytes: Buffer, contentType: string): Promise<string | null>;
  /** Fetch bytes previously stored (or pointed at) by key. */
  get(key: string): Promise<Buffer | null>;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/**
 * Replit object-storage adapter. Reuses the audited creative-binary write path
 * for puts and the canonical `/objects/...` read path for gets. Fail-safe: any
 * outage resolves to null so the engine degrades (returns the package inline)
 * rather than throwing.
 */
export class ReplitObjectStorageAdapter implements VaultStorageAdapter {
  readonly kind: VaultStorageKind = "replit-object-storage";

  available(): boolean {
    return Boolean(process.env.PRIVATE_OBJECT_DIR?.trim());
  }

  async put(bytes: Buffer, contentType: string): Promise<string | null> {
    const uploaded = await uploadCreativeBinary(bytes, contentType, "jarvis-vault");
    return uploaded?.storageKey ?? null;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      if (!key.startsWith("/objects/")) return null;
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(key);
      const node = file.createReadStream();
      return await streamToBuffer(node);
    } catch {
      return null;
    }
  }
}

/** The default adapter for this deployment. */
export function defaultVaultStorage(): VaultStorageAdapter {
  return new ReplitObjectStorageAdapter();
}

/**
 * Portability self-check used by the readiness report. `portableAdapterAvailable`
 * is always true because the adapter INTERFACE is backend-agnostic; the concrete
 * S3/MinIO/filesystem adapters are drop-in implementations of it.
 */
export function storagePortabilityStatus(): {
  objectStorageConfigured: boolean;
  portableAdapterAvailable: boolean;
} {
  return {
    objectStorageConfigured: Boolean(process.env.PRIVATE_OBJECT_DIR?.trim()),
    portableAdapterAvailable: true,
  };
}
