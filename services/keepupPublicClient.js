const { MemoryTtlCache } = require("./cache");

const snapshotCache = new MemoryTtlCache();

class KeepupPublicFetchError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "KeepupPublicFetchError";
    this.status = status;
    this.body = body;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  return {
    baseUrl: (process.env.KEEPUP_PUBLIC_BASE_URL || "https://app.keepupcrm.com").replace(/\/$/, ""),
    timeoutMs: parsePositiveInt(process.env.KEEPUP_PUBLIC_TIMEOUT_MS, 4000),
    ttlSeconds: parsePositiveInt(process.env.KEEPUP_PUBLIC_CACHE_TTL_SECONDS, 300),
  };
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object") {
    return { version: null, publishedAt: null, payload: {} };
  }
  if (Object.prototype.hasOwnProperty.call(raw, "payload")) {
    return {
      version: raw.version ?? null,
      publishedAt: raw.publishedAt ?? null,
      payload: raw.payload ?? {},
    };
  }
  return {
    version: raw.version ?? null,
    publishedAt: raw.publishedAt ?? null,
    payload: raw,
  };
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        if (typeof json.message === "string") return json.message;
        if (typeof json.error === "string") return json.error;
      }
      return JSON.stringify(json);
    } catch {
      return `HTTP ${response.status}`;
    }
  }
  try {
    const text = await response.text();
    return text || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function logFetch(event, details) {
  const parts = Object.entries(details || {}).map(([k, v]) => `${k}=${v}`);
  console.info(`[keepup-public] ${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

async function fetchBuilderSnapshot(builderSlug) {
  const slug = typeof builderSlug === "string" ? builderSlug.trim() : "";
  if (!slug) throw new Error("builderSlug is required");

  const config = getConfig();
  const cacheKey = slug.toLowerCase();
  const fresh = snapshotCache.get(cacheKey);
  if (fresh) {
    logFetch("cache-hit", { builderSlug: slug });
    return fresh.value;
  }

  const stale = snapshotCache.getStale(cacheKey);
  const headers = { Accept: "application/json" };
  if (stale && stale.etag) {
    headers["If-None-Match"] = stale.etag;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  const url = `${config.baseUrl}/public/brz/builders/${encodeURIComponent(slug)}`;

  try {
    logFetch("cache-miss", { builderSlug: slug, url });
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;

    if (response.status === 304 && stale) {
      snapshotCache.touch(cacheKey, config.ttlSeconds);
      logFetch("not-modified", { builderSlug: slug, durationMs });
      return stale.value;
    }

    if (response.status === 404) {
      snapshotCache.set(cacheKey, null, { ttlSeconds: config.ttlSeconds });
      logFetch("not-found", { builderSlug: slug, durationMs });
      return null;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      logFetch("error", { builderSlug: slug, status: response.status, durationMs });
      throw new KeepupPublicFetchError(
        `Failed to fetch builder snapshot (${response.status}): ${message}`,
        response.status,
        message,
      );
    }

    const json = await response.json();
    const normalized = normalizeSnapshot(json);
    snapshotCache.set(cacheKey, normalized, {
      ttlSeconds: config.ttlSeconds,
      etag: response.headers.get("etag"),
    });
    logFetch("ok", {
      builderSlug: slug,
      status: response.status,
      durationMs,
      etag: response.headers.get("etag") || "none",
    });
    return normalized;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err && err.name === "AbortError") {
      logFetch("timeout", { builderSlug: slug, timeoutMs: config.timeoutMs, durationMs });
      throw new KeepupPublicFetchError(
        `Snapshot request timed out after ${config.timeoutMs}ms`,
        504,
        "timeout",
      );
    }
    if (err instanceof KeepupPublicFetchError) throw err;
    logFetch("network-error", { builderSlug: slug, durationMs, message: err?.message || "unknown" });
    throw new KeepupPublicFetchError(err?.message || "Snapshot request failed", 502, err?.message || "unknown");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function __resetKeepupSnapshotCache() {
  snapshotCache.clear();
}

module.exports = {
  fetchBuilderSnapshot,
  KeepupPublicFetchError,
  __resetKeepupSnapshotCache,
};
