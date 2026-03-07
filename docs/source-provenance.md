# Source Provenance

## PublicHome source fields

`PublicHome` records now support a structured `source` object:

```js
source: {
  type: "keepup" | "scraper" | "manual",
  provider?: string,
  externalId?: string,
  ingestedAt?: Date,
  updatedAt?: Date,
  updatedBy?: string
}
```

Related identity fields:

- `stableId`: primary cross-source identity for a public home.
- `sourceHomeId`: legacy per-source identifier retained for backward compatibility.

## StableId namespaces

- KeepUp homes keep their existing stable IDs unchanged.
  In the current pipeline this is the same value as `keepupListingId` or `keepupLotId`.
- Scraper homes must use a namespaced stable ID:
  `scraper:<provider>:<externalId>`
- Manual homes may use any non-empty stable ID that does not collide with an existing record.

The `PublicHome` model enforces a unique partial index on `stableId`, and it validates that scraper-owned records use the `scraper:` prefix.

## Overwrite rules

KeepUp publish on the `/internal/publish/keepup/bundle` endpoint applies these ownership rules:

1. Upsert by `stableId` first.
2. If no `stableId` match exists, fall back to the legacy `companyId + sourceHomeId` match so old KeepUp rows can be upgraded in place.
3. If the existing record is scraper-owned, the KeepUp update is skipped and a warning is logged.
4. If the existing record is KeepUp-owned, the update proceeds normally.
5. If the existing record has no `source` but is best-effort identifiable as legacy KeepUp data, the update proceeds and the row is upgraded to `source.type = "keepup"`.
6. If the existing record has no `source` and ownership cannot be inferred, the update is skipped.

## Reconcile deactivate rules

When `meta.unpublishMissingHomes = true` is used during KeepUp publish:

- Only KeepUp-owned homes are eligible for deactivation.
- Legacy no-source rows are only eligible when they can be best-effort identified as old KeepUp rows.
- Scraper-owned homes are never deactivated by KeepUp reconciliation.

## Community content and photos

`PublicCommunity` is the source of truth for community-level marketing content in BuildRootz.
Inventory publish remains home-only; package/community publish should write these fields on the `PublicCommunity` document:

```js
{
  overview: string | null,
  highlights: string[],
  heroImageUrl: string | null,
  imageUrls: string[]
}
```

Operational rules:

- Store curated community content on `PublicCommunity`, not on `PublicHome`.
- Omitted fields are treated as "no change" during publish updates.
- Explicit `null` clears `overview` and `heroImageUrl`.
- Explicit empty arrays clear `highlights` and `imageUrls`.
- For backward compatibility, `heroImageUrl` is also mirrored to `mapImage`, and `imageUrls` is mirrored to `images`.

Asset URLs:

- If a community media URL is relative (for example `/uploads/...` or `uploads/...`), it is absolutized with `KEEPUP_PUBLIC_BASE_URL`.
- If `KEEPUP_PUBLIC_BASE_URL` is unset, `BASE_URL` is used as the fallback origin.
- Absolute `http://` and `https://` URLs are preserved as-is.

For good BRZ display quality, publish at minimum:

- `overview`
- 2 to 6 meaningful `highlights`
- `heroImageUrl`
- at least 1 image in `imageUrls`

## Migration / index steps

If production does not rely on Mongoose `syncIndexes()`, run these Mongo commands against the BuildRootz database:

```javascript
db.PublicHome.createIndex(
  { stableId: 1 },
  {
    unique: true,
    name: "stableId_unique",
    partialFilterExpression: {
      stableId: { $exists: true, $type: "string" }
    }
  }
);

db.PublicHome.dropIndex("company_source_sourceHomeId_unique");

db.PublicHome.createIndex(
  { companyId: 1, "source.type": 1, sourceHomeId: 1 },
  {
    unique: true,
    name: "company_sourceType_sourceHomeId_unique",
    partialFilterExpression: {
      companyId: { $exists: true },
      "source.type": { $exists: true, $type: "string" },
      sourceHomeId: { $exists: true, $type: "string" }
    }
  }
);

db.PublicHome.dropIndex("company_community_source_active_idx");

db.PublicHome.createIndex(
  { companyId: 1, publicCommunityId: 1, "source.type": 1, isActive: 1 },
  { name: "company_community_sourceType_active_idx" }
);
```

If there are legacy rows without `stableId`, they can remain in place. They are upgraded automatically the next time a matching KeepUp publish updates them.
