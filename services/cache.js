class MemoryTtlCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  getStale(key) {
    return this.store.get(key) || null;
  }

  set(key, value, options = {}) {
    const ttlSeconds = Number(options.ttlSeconds);
    const ttlMs = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds * 1000 : 300000;
    const next = {
      value,
      etag: options.etag || null,
      expiresAt: Date.now() + ttlMs,
    };
    this.store.set(key, next);
    return next;
  }

  touch(key, ttlSeconds) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const ttlMs = Number.isFinite(Number(ttlSeconds)) && Number(ttlSeconds) > 0
      ? Number(ttlSeconds) * 1000
      : 300000;
    entry.expiresAt = Date.now() + ttlMs;
    this.store.set(key, entry);
    return entry;
  }

  clear() {
    this.store.clear();
  }
}

module.exports = {
  MemoryTtlCache,
};
