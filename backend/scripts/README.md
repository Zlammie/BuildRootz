# Dev seeds

## Seed model listings for builders endpoint

Dev-only helper to seed model listings tied to a community and two builders.

Guardrails: requires `NODE_ENV=development` or `SEED_ALLOW=1`.

Run:
```bash
NODE_ENV=development node backend/scripts/seed-model-builders.js
# or
SEED_ALLOW=1 node backend/scripts/seed-model-builders.js
```

This seeds:
- communityId: `66aaaaaa0000000000000001`
- builder A: published model (newer) + unpublished model (older)
- builder B: published model

Test curl (replace origin if needed):
```bash
# 1) happy path
curl -s http://localhost:3000/api/public/communities/66aaaaaa0000000000000001/builders | jq
# expect: builder A pick is the published newer listing; builder B has its published model

# 2) bad communityId
curl -s -w "\n%{http_code}\n" http://localhost:3000/api/public/communities/notanid/builders
# expect: 400 with { success: false, error: "communityId must be a valid ObjectId" }

# 3) cache headers
curl -I http://localhost:3000/api/public/communities/66aaaaaa0000000000000001/builders
# expect: Cache-Control: public, max-age=60
```

## Migrate cross-system ids

Backfills canonical ids for communities/homes/saved communities (keepup/public ids).

Guarded: requires `MIGRATE_CONFIRM=true`.

Run:
```bash
MIGRATE_CONFIRM=true node scripts/migrate-cross-ids.js
```

Outputs summary counts (communities updated, homes updated, saved communities updated/unresolved).

## Check saved community duplicates

Reports duplicate SavedCommunity docs for the same user + `publicCommunityId`. Read-only helper.

Run:
```bash
node scripts/check-saved-community-duplicates.js
```

## Find duplicate public communities

Detects PublicCommunity docs that normalize to the same name/city/state (and coordinates when present).

Run:
```bash
node scripts/find-duplicate-public-communities.js
```
