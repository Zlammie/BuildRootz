# BRZ Public Data Contract (Phase 1)

## Goals

- BuildRootz (BRZ) is the self-contained source of truth for public data.
- KeepUp publishes builder-provided data into BRZ through an internal API key.
- Scrapers and manual workflows can write to BRZ in parallel.
- BRZ page rendering has no runtime dependency on KeepUp.

## Canonical IDs

- `canonicalCommunityId = publicCommunityId = String(PublicCommunity._id)`
- `communityId` is legacy KeepUp/general external ID (`keepupCommunityId`) and is deprecated for canonical usage.

## Entities

### 1) PublicCommunity (canonical market identity)

- Key: `_id` (`publicCommunityId`)
- Ownership: scraper/manual/KeepUp mapping creation for identity fields
- Must not store builder-scoped fields

### 2) BuilderProfile (public builder identity)

- Key: `companyId` (unique)
- Ownership:
  - KeepUp for KeepUp builders
  - scraper/manual for non-KeepUp builders

### 3) BuilderInCommunity (join entity)

- Key: unique(`companyId`, `publicCommunityId`)
- Ownership:
  - KeepUp for KeepUp builders
  - manual for non-KeepUp builders
- Stores builder-specific community web profile, visibility flags, and presentation

### 4) PlanCatalog (future)

- Key: unique(`companyId`, `keepupFloorPlanId`) or `planSlug` for scraped plans

### 5) CommunityPlanOffering (future)

- Key: unique(`companyId`, `publicCommunityId`, `planCatalogId`)

### 6) PublicHome (listings)

- Existing entity
- Must reference canonical `companyId` + `publicCommunityId`

## Ownership Rules

- KeepUp can upsert only KeepUp-owned fields.
- KeepUp must not overwrite scraper-owned community identity fields.
- PublicCommunity remains canonical for identity (`name`, `city`, `state`, `slug`, geo, aliases, etc.).
- Builder-scoped community fields must move to/use `BuilderInCommunity` going forward.

## Page Read Models

- Community Page: `PublicCommunity` + `BuilderInCommunity[]` + offerings + listing summaries
- Builder Page: `BuilderProfile` + `BuilderInCommunity[]` + offerings + listing summaries
- Listings: `PublicHome` index

## Field Groups (KeepUp publish scope now)

### BuilderProfile

- `builderName`
- `builderSlug`
- `description`
- links (`website`)
- branding (`logoUrl`, `primaryColor`, `secondaryColor`)
- `pricingDisclaimer`

### BuilderInCommunity

- Contact + contact visibility
- Schools
- HOA
- PID/MUD flags
- Earnest money + visibility
- Realtor commission + visibility/unit
- Publish visibility flags
- Promotion/hero/description presentation fields
- Model-address safe summary (`modelsSummary`) if provided

### Offerings/Pricing

- Planned for next phase (accepted in bundle payload, not persisted in Phase 1)
