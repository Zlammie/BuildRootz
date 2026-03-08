import { ObjectId, type Collection, type Db, type Document, type WithId } from "mongodb";
import { getDb } from "./mongodb";

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "publiccommunities",
  "publiccommunity",
];

const BUILDER_COLLECTION_CANDIDATES = [
  "BuilderProfile",
  "BuilderProfiles",
  "builderprofile",
  "builderprofiles",
  "Builder",
  "Builders",
  "builder",
  "builders",
  "Company",
  "Companies",
  "company",
  "companies",
  "Organization",
  "Organizations",
  "organization",
  "organizations",
  "PublicBuilder",
  "PublicBuilders",
  "publicbuilders",
  "publicbuilder",
];

const assetBase = (
  process.env.BUILDROOTZ_ASSET_BASE ||
  process.env.BUILDROOTZ_UPLOAD_BASE_URL ||
  process.env.ASSET_BASE ||
  process.env.UPLOAD_BASE_URL ||
  ""
).replace(/\/$/, "");

const KEEPUP_TIMEOUT_MS = parsePositiveInt(process.env.KEEPUP_TIMEOUT_MS, 2500);
const BRANDING_CACHE_TTL_MS = clamp(
  parsePositiveInt(process.env.KEEPUP_BRANDING_CACHE_TTL_MS, 10 * 60 * 1000),
  5 * 60 * 1000,
  15 * 60 * 1000,
);

type BuilderBranding = {
  logoUrl: string | null;
  description: string;
  websiteUrl: string | null;
  primaryColor?: string;
  secondaryColor?: string;
};

type BuilderIdentity = {
  keepupBuilderId?: string;
  keepupCompanyId?: string;
  builderSlug?: string;
  builderName?: string;
};

type CacheEntry = {
  value: BuilderBranding;
  expiresAt: number;
};

const brandingCache = new Map<string, CacheEntry>();
let collectionNamesCache: string[] | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cacheKey(builderRef: string): string {
  return builderRef.trim().toLowerCase();
}

function resolveAssetUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Keep uploads same-origin so Next rewrite/proxy can serve them without CORP issues.
  if (trimmed.startsWith("/uploads/")) {
    return trimmed;
  }
  if (trimmed.startsWith("uploads/")) {
    return `/${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/uploads/")) {
        return `/uploads${parsed.pathname.replace("/uploads", "")}${parsed.search ?? ""}`;
      }
      if (assetBase) {
        return `${assetBase}${parsed.pathname}${parsed.search ?? ""}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  if (!assetBase) return trimmed;
  return `${assetBase}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function resolveWebsiteUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`KeepUp branding request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

async function getCollectionNames(db: Db): Promise<string[]> {
  if (collectionNamesCache) return collectionNamesCache;
  const collections = await db.listCollections().toArray();
  collectionNamesCache = collections.map((c) => c.name);
  return collectionNamesCache;
}

async function resolveCollectionIfExists(
  db: Db,
  candidates: string[],
): Promise<Collection<Document> | null> {
  const names = await getCollectionNames(db);
  const found = candidates.find((name) => names.includes(name));
  return found ? db.collection(found) : null;
}

function buildBuilderMatchClauses(builderRef: string): Document[] {
  const clauses: Document[] = [
    { keepupBuilderId: builderRef },
    { builderId: builderRef },
    { builder_id: builderRef },
    { keepupCompanyId: builderRef },
    { companyId: builderRef },
    { company_id: builderRef },
    { builderSlug: builderRef },
    { slug: builderRef },
    { "builder.id": builderRef },
    { "builder.slug": builderRef },
    { "builder.keepupBuilderId": builderRef },
    { "builder.keepupCompanyId": builderRef },
    { "company.id": builderRef },
  ];

  const nameGuess = builderRef.replace(/[-_]+/g, " ").trim();
  if (nameGuess) {
    const regex = new RegExp(`^${escapeRegExp(nameGuess)}$`, "i");
    clauses.push(
      { builder: regex },
      { builderName: regex },
      { orgName: regex },
      { name: regex },
      { "builder.name": regex },
      { "company.name": regex },
    );
  }

  if (ObjectId.isValid(builderRef)) {
    const oid = new ObjectId(builderRef);
    clauses.push(
      { _id: oid },
      { keepupBuilderId: oid },
      { builderId: oid },
      { builder_id: oid },
      { keepupCompanyId: oid },
      { companyId: oid },
      { company_id: oid },
      { "builder.id": oid },
      { "company.id": oid },
    );
  }

  return clauses;
}

function fromDocString(doc: Document | null, key: string): string | undefined {
  if (!doc) return undefined;
  const value = doc[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fromNestedString(doc: Document | null, objKey: string, fieldKey: string): string | undefined {
  if (!doc) return undefined;
  const nested = doc[objKey];
  if (!nested || typeof nested !== "object") return undefined;
  const value = (nested as Record<string, unknown>)[fieldKey];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function pickBranding(doc: Document | null): BuilderBranding {
  const logoCandidate =
    fromDocString(doc, "logoUrl") ||
    fromDocString(doc, "logo") ||
    fromDocString(doc, "builderLogo") ||
    fromDocString(doc, "companyLogo") ||
    fromNestedString(doc, "branding", "logoUrl") ||
    fromNestedString(doc, "branding", "logo") ||
    fromNestedString(doc, "builder", "logoUrl") ||
    fromNestedString(doc, "builder", "logo") ||
    fromNestedString(doc, "company", "logoUrl") ||
    fromNestedString(doc, "company", "logo");

  const description =
    fromDocString(doc, "description") ||
    fromDocString(doc, "overview") ||
    fromDocString(doc, "summary") ||
    fromDocString(doc, "about") ||
    fromNestedString(doc, "branding", "description") ||
    fromNestedString(doc, "branding", "about") ||
    fromNestedString(doc, "builder", "description") ||
    fromNestedString(doc, "company", "description") ||
    "";

  const websiteCandidate =
    fromDocString(doc, "websiteUrl") ||
    fromDocString(doc, "website") ||
    fromDocString(doc, "url") ||
    fromNestedString(doc, "branding", "websiteUrl") ||
    fromNestedString(doc, "branding", "website") ||
    fromNestedString(doc, "company", "websiteUrl") ||
    fromNestedString(doc, "company", "website") ||
    fromNestedString(doc, "profile", "websiteUrl") ||
    fromNestedString(doc, "profile", "website");

  const primaryColor =
    fromDocString(doc, "primaryColor") ||
    fromNestedString(doc, "branding", "primaryColor") ||
    fromNestedString(doc, "company", "primaryColor");

  const secondaryColor =
    fromDocString(doc, "secondaryColor") ||
    fromNestedString(doc, "branding", "secondaryColor") ||
    fromNestedString(doc, "company", "secondaryColor");

  return {
    logoUrl: resolveAssetUrl(logoCandidate) ?? null,
    description,
    websiteUrl: resolveWebsiteUrl(websiteCandidate),
    ...(primaryColor ? { primaryColor } : {}),
    ...(secondaryColor ? { secondaryColor } : {}),
  };
}

function mergeBranding(primary: BuilderBranding, fallback: BuilderBranding): BuilderBranding {
  return {
    logoUrl: primary.logoUrl ?? fallback.logoUrl ?? null,
    description: primary.description || fallback.description || "",
    websiteUrl: primary.websiteUrl ?? fallback.websiteUrl ?? null,
    ...(primary.primaryColor ? { primaryColor: primary.primaryColor } : fallback.primaryColor ? { primaryColor: fallback.primaryColor } : {}),
    ...(primary.secondaryColor
      ? { secondaryColor: primary.secondaryColor }
      : fallback.secondaryColor
        ? { secondaryColor: fallback.secondaryColor }
        : {}),
  };
}

async function findBuilderSeedDoc(
  collection: Collection<Document> | null,
  builderRef: string,
): Promise<WithId<Document> | null> {
  if (!collection) return null;
  const or = buildBuilderMatchClauses(builderRef);
  return collection
    .findOne(
      { $or: or },
      {
        sort: { updatedAt: -1, createdAt: -1, _id: -1 },
      },
    )
    .catch(() => null);
}

function resolveIdentity(
  builderRef: string,
  homeDoc: Document | null,
  communityDoc: Document | null,
): BuilderIdentity {
  return {
    keepupBuilderId: firstDefined(
      fromDocString(homeDoc, "keepupBuilderId"),
      fromDocString(homeDoc, "builderId"),
      fromNestedString(homeDoc, "builder", "id"),
      fromDocString(communityDoc, "keepupBuilderId"),
      fromDocString(communityDoc, "builderId"),
      fromNestedString(communityDoc, "builder", "id"),
    ),
    keepupCompanyId: firstDefined(
      fromDocString(homeDoc, "keepupCompanyId"),
      fromDocString(homeDoc, "companyId"),
      fromNestedString(homeDoc, "builder", "keepupCompanyId"),
      fromNestedString(homeDoc, "company", "id"),
      fromDocString(communityDoc, "keepupCompanyId"),
      fromDocString(communityDoc, "companyId"),
      fromNestedString(communityDoc, "company", "id"),
    ),
    builderSlug: firstDefined(
      fromDocString(homeDoc, "builderSlug"),
      fromNestedString(homeDoc, "builder", "slug"),
      fromDocString(communityDoc, "builderSlug"),
      fromNestedString(communityDoc, "builder", "slug"),
      builderRef.includes(" ") ? undefined : builderRef,
    ),
    builderName: firstDefined(
      fromDocString(homeDoc, "builderName"),
      fromDocString(homeDoc, "builder"),
      fromNestedString(homeDoc, "builder", "name"),
      fromDocString(homeDoc, "orgName"),
      fromDocString(communityDoc, "builderName"),
      fromNestedString(communityDoc, "builder", "name"),
      fromDocString(communityDoc, "name"),
    ),
  };
}

function buildIdentityMatchClauses(builderRef: string, identity: BuilderIdentity): Document[] {
  const clauses = buildBuilderMatchClauses(builderRef);
  if (identity.keepupBuilderId) {
    clauses.push(
      { keepupBuilderId: identity.keepupBuilderId },
      { builderId: identity.keepupBuilderId },
      { "builder.id": identity.keepupBuilderId },
    );
  }
  if (identity.keepupCompanyId) {
    clauses.push(
      { keepupCompanyId: identity.keepupCompanyId },
      { companyId: identity.keepupCompanyId },
      { "company.id": identity.keepupCompanyId },
    );
  }
  if (identity.builderSlug) {
    clauses.push({ builderSlug: identity.builderSlug }, { slug: identity.builderSlug }, { "builder.slug": identity.builderSlug });
  }
  if (identity.builderName) {
    const regex = new RegExp(`^${escapeRegExp(identity.builderName)}$`, "i");
    clauses.push({ name: regex }, { builderName: regex }, { "builder.name": regex }, { "company.name": regex });
  }
  return clauses;
}

async function fetchBrandingFromBuilderCollection(
  db: Db,
  builderRef: string,
  identity: BuilderIdentity,
): Promise<BuilderBranding> {
  const collection = await resolveCollectionIfExists(db, BUILDER_COLLECTION_CANDIDATES);
  if (!collection) {
    return { logoUrl: null, description: "", websiteUrl: null };
  }
  const or = buildIdentityMatchClauses(builderRef, identity);
  const doc = await collection
    .findOne(
      { $or: or },
      {
        sort: { updatedAt: -1, createdAt: -1, _id: -1 },
      },
    )
    .catch(() => null);
  return pickBranding(doc);
}

async function fetchBuilderBrandingUncached(builderRef: string): Promise<BuilderBranding> {
  const db = await getDb();
  const homeCollection = await resolveCollectionIfExists(db, HOME_COLLECTION_CANDIDATES);
  const communityCollection = await resolveCollectionIfExists(db, COMMUNITY_COLLECTION_CANDIDATES);

  const [homeDoc, communityDoc] = await Promise.all([
    findBuilderSeedDoc(homeCollection, builderRef),
    findBuilderSeedDoc(communityCollection, builderRef),
  ]);

  const identity = resolveIdentity(builderRef, homeDoc, communityDoc);
  const fallbackBranding = mergeBranding(
    pickBranding(homeDoc),
    pickBranding(communityDoc),
  );
  const builderDocBranding = await fetchBrandingFromBuilderCollection(db, builderRef, identity);

  return mergeBranding(builderDocBranding, fallbackBranding);
}

function setCache(key: string, value: BuilderBranding) {
  const expiresAt = Date.now() + BRANDING_CACHE_TTL_MS;
  brandingCache.set(key, { value, expiresAt });

  if (brandingCache.size > 200) {
    const now = Date.now();
    for (const [entryKey, entryValue] of brandingCache.entries()) {
      if (entryValue.expiresAt <= now) {
        brandingCache.delete(entryKey);
      }
    }
  }
}

export async function fetchBuilderBranding(
  builderRef: string,
  options?: { requestId?: string | null },
): Promise<BuilderBranding> {
  const normalized = nonEmptyString(builderRef);
  if (!normalized) {
    return { logoUrl: null, description: "", websiteUrl: null };
  }

  const key = cacheKey(normalized);
  const cached = brandingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const branding = await withTimeout(fetchBuilderBrandingUncached(normalized), KEEPUP_TIMEOUT_MS);
    setCache(key, branding);
    return branding;
  } catch (err) {
    const requestMeta = options?.requestId ? ` requestId=${options.requestId}` : "";
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[keepup-client] builder branding lookup failed for "${normalized}"${requestMeta}: ${message}`);
    const fallback = { logoUrl: null, description: "", websiteUrl: null };
    setCache(key, fallback);
    return fallback;
  }
}
