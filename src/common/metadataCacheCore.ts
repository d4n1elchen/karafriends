export const METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedMetadata<T> {
  fresh: boolean;
  metadata: T;
}

export function parseMetadataCache<T>(
  raw: string,
  isMetadata: (value: unknown) => value is T,
  nowMs: number = Date.now(),
  ttlMs: number = METADATA_CACHE_TTL_MS,
): CachedMetadata<T> | null {
  try {
    const cached = JSON.parse(raw) as {
      cachedAt?: unknown;
      metadata?: unknown;
      version?: unknown;
    };
    if (
      cached.version !== 1 ||
      typeof cached.cachedAt !== "number" ||
      !Number.isFinite(cached.cachedAt) ||
      !isMetadata(cached.metadata)
    ) {
      return null;
    }

    return {
      fresh: nowMs - cached.cachedAt <= ttlMs,
      metadata: cached.metadata,
    };
  } catch {
    return null;
  }
}

export function serializeMetadataCache<T>(
  metadata: T,
  cachedAt: number = Date.now(),
): string {
  return JSON.stringify({ version: 1, cachedAt, metadata });
}
