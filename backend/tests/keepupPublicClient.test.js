const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fetchBuilderSnapshot,
  __resetKeepupSnapshotCache,
} = require("../../services/keepupPublicClient");

function mockResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
        return key ? headers[key] : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      if (typeof body === "string") return body;
      return JSON.stringify(body);
    },
  };
}

test("keepup client returns null on 404", async () => {
  __resetKeepupSnapshotCache();
  const originalFetch = global.fetch;
  const originalBase = process.env.KEEPUP_PUBLIC_BASE_URL;
  process.env.KEEPUP_PUBLIC_BASE_URL = "https://example.test";

  global.fetch = async () => mockResponse(404, { error: "not found" });

  try {
    const snapshot = await fetchBuilderSnapshot("builder-a");
    assert.equal(snapshot, null);
  } finally {
    global.fetch = originalFetch;
    process.env.KEEPUP_PUBLIC_BASE_URL = originalBase;
    __resetKeepupSnapshotCache();
  }
});

test("keepup client uses TTL cache", async () => {
  __resetKeepupSnapshotCache();
  const originalFetch = global.fetch;
  const originalBase = process.env.KEEPUP_PUBLIC_BASE_URL;
  const originalTtl = process.env.KEEPUP_PUBLIC_CACHE_TTL_SECONDS;
  process.env.KEEPUP_PUBLIC_BASE_URL = "https://example.test";
  process.env.KEEPUP_PUBLIC_CACHE_TTL_SECONDS = "300";

  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return mockResponse(
      200,
      {
        version: 3,
        publishedAt: "2026-02-24T00:00:00.000Z",
        payload: { builder: { slug: "builder-a" }, communities: [] },
      },
      { ETag: "W/test-etag" },
    );
  };

  try {
    const first = await fetchBuilderSnapshot("builder-a");
    const second = await fetchBuilderSnapshot("builder-a");
    assert.equal(calls, 1);
    assert.equal(first?.version, 3);
    assert.equal(second?.version, 3);
  } finally {
    global.fetch = originalFetch;
    process.env.KEEPUP_PUBLIC_BASE_URL = originalBase;
    process.env.KEEPUP_PUBLIC_CACHE_TTL_SECONDS = originalTtl;
    __resetKeepupSnapshotCache();
  }
});
