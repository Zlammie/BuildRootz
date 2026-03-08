import Link from "next/link";
import NavBar from "../../../components/NavBar";
import BuyerWorkspaceSidebar from "../../../components/workspace/BuyerWorkspaceSidebar";
import WorkspaceQueueButton from "../../../components/workspace/WorkspaceQueueButton";
import {
  fetchOfferingsByFloorPlanRef,
  fetchPlanCatalogByIds,
  fetchPlanCatalogByRef,
  fetchPublicCommunityById,
  fetchPublicHomesByFloorPlanRef,
  type CommunityPlanOfferingRecord,
  type PlanCatalogRecord,
} from "../../../lib/publicData";
import type { PublicCommunity, PublicHome } from "../../../types/public";
import SaveFloorPlanButton from "./SaveFloorPlanButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type FloorPlanParams = { floorplanId: string };

type FloorPlanCommunityCard = {
  id: string;
  name: string;
  location: string | null;
  href: string | null;
  imageUrl: string | null;
  priceFrom: number | null;
  quickMoveIns: number;
};

type FloorPlanPageData = {
  floorPlanRef: string;
  planName: string;
  description: string;
  heroImageUrl: string | null;
  planImageUrl: string | null;
  planFileUrl: string | null;
  lotOfferings: string[];
  specs: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    garage: number | null;
    stories: number | null;
  };
  communities: FloorPlanCommunityCard[];
};

const DASH = "-";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPlanNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSpec(value: number | null | undefined, suffix: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DASH;
  if (suffix === "sqft") return `${Math.round(value).toLocaleString()} sqft`;
  return `${formatPlanNumber(value)} ${suffix}`;
}

function toSummaryToken(value: number | null | undefined, label: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (label === "sqft") return `${Math.round(value).toLocaleString()} sqft`;
  return `${formatPlanNumber(value)} ${label}`;
}

function parseGarageSpaces(
  garageSpaces: number | null | undefined,
  garageLabel: string | null | undefined,
): number | null {
  if (typeof garageSpaces === "number" && Number.isFinite(garageSpaces) && garageSpaces > 0) {
    return garageSpaces;
  }
  const label = cleanString(garageLabel);
  if (!label) return null;
  const match = label.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pickMostCommonString(values: Array<string | null | undefined>): string {
  const counts = new Map<string, number>();
  values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });

  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function pickMostCommonNumber(values: Array<number | null | undefined>): number | null {
  const counts = new Map<number, number>();
  values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .forEach((value) => {
      const normalized = Number(value.toFixed(2));
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });

  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function minPositive(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!valid.length) return null;
  return Math.min(...valid);
}

function isQuickMoveIn(status: unknown): boolean {
  const normalized = cleanString(status).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("inventory") ||
    normalized.includes("quick move") ||
    normalized.includes("spec")
  );
}

function normalizeCommunityKey(home: PublicHome): string {
  return (
    cleanString(home.publicCommunityId) ||
    cleanString(home.keepupCommunityId) ||
    cleanString(home.communityId) ||
    cleanString(home.communitySlug)
  );
}

function communityMatchesHome(community: PublicCommunity, home: PublicHome): boolean {
  const communityTokens = new Set(
    [
      cleanString(community.id),
      cleanString(community.keepupCommunityId),
      cleanString(community.slug),
    ].filter(Boolean),
  );

  const homeTokens = [
    cleanString(home.publicCommunityId),
    cleanString(home.keepupCommunityId),
    cleanString(home.communityId),
    cleanString(home.communitySlug),
  ].filter(Boolean);

  return homeTokens.some((token) => communityTokens.has(token));
}

function buildCommunityHref(community: PublicCommunity): string | null {
  const slug = cleanString(community.slug);
  if (slug) return `/community?communitySlug=${encodeURIComponent(slug)}`;
  const id = cleanString(community.id);
  if (id) return `/community?communityId=${encodeURIComponent(id)}`;
  return null;
}

function buildSpecsSubtitle(specs: FloorPlanPageData["specs"]): string {
  const parts = [
    formatSpec(specs.beds, "bd"),
    formatSpec(specs.baths, "ba"),
    formatSpec(specs.sqft, "sqft"),
  ].filter((part) => part !== DASH);
  return parts.join(" | ");
}

function toPlanCommunityCards(
  communities: PublicCommunity[],
  offerings: CommunityPlanOfferingRecord[],
  homes: PublicHome[],
): FloorPlanCommunityCard[] {
  const cards = communities.map((community) => {
    const communityOfferings = offerings.filter(
      (offering) => cleanString(offering.publicCommunityId) === cleanString(community.id),
    );
    const communityHomes = homes.filter((home) => communityMatchesHome(community, home));

    const visibleOfferingPrices = communityOfferings
      .filter((offering) => cleanString(offering.basePriceVisibility).toLowerCase() !== "hidden")
      .map((offering) => offering.basePriceFrom);

    const priceFrom = minPositive([...visibleOfferingPrices, ...communityHomes.map((home) => home.price)]);
    const quickMoveIns = communityHomes.filter((home) => isQuickMoveIn(home.status)).length;
    const location = [cleanString(community.city), cleanString(community.state)].filter(Boolean).join(", ") || null;

    return {
      id: cleanString(community.id),
      name: cleanString(community.name) || "Community",
      location,
      href: buildCommunityHref(community),
      imageUrl: cleanString(community.mapImage) || cleanString(community.heroImageUrl) || null,
      priceFrom,
      quickMoveIns,
    } satisfies FloorPlanCommunityCard;
  });

  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

function extractLotOfferings(
  plan: PlanCatalogRecord | null,
  offerings: CommunityPlanOfferingRecord[],
  communities: PublicCommunity[],
): string[] {
  const values: string[] = [];
  const addValue = (value: unknown) => {
    const next = cleanString(value);
    if (!next) return;
    values.push(next);
  };

  addValue(plan?.productType);
  offerings.forEach((offering) => {
    (offering.badges || []).forEach((badge) => addValue(badge));
  });
  communities.forEach((community) => {
    (community.productTypes || []).forEach((productType) => addValue(productType));
  });

  const deduped = new Map<string, string>();
  values.forEach((value) => {
    const key = value.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, value);
  });

  return Array.from(deduped.values()).slice(0, 6);
}

async function resolveFloorPlanData(floorPlanRef: string): Promise<FloorPlanPageData> {
  const normalizedRef = cleanString(safeDecode(floorPlanRef));

  let planCatalog = await fetchPlanCatalogByRef(normalizedRef);
  let planCatalogId = cleanString(planCatalog?.id);
  let keepupFloorPlanId = cleanString(planCatalog?.keepupFloorPlanId);

  let offerings = await fetchOfferingsByFloorPlanRef(normalizedRef, {
    planCatalogId,
    keepupFloorPlanId: keepupFloorPlanId || normalizedRef,
  });

  if (!planCatalog && offerings.length) {
    const offeringCatalogIds = Array.from(
      new Set(offerings.map((offering) => cleanString(offering.planCatalogId)).filter(Boolean)),
    );
    if (offeringCatalogIds.length) {
      const catalogs = await fetchPlanCatalogByIds(offeringCatalogIds);
      planCatalog = catalogs[0] || null;
      planCatalogId = cleanString(planCatalog?.id);
      keepupFloorPlanId = cleanString(planCatalog?.keepupFloorPlanId);
    }
  }

  if (planCatalogId || keepupFloorPlanId) {
    offerings = await fetchOfferingsByFloorPlanRef(normalizedRef, {
      planCatalogId,
      keepupFloorPlanId,
    });
  }

  const homes = await fetchPublicHomesByFloorPlanRef(
    normalizedRef,
    {
      planCatalogId,
      keepupFloorPlanId,
    },
    300,
  );

  const communityRefs = Array.from(
    new Set(
      [
        ...offerings.map((offering) => cleanString(offering.publicCommunityId)),
        ...homes.map((home) => normalizeCommunityKey(home)),
      ].filter(Boolean),
    ),
  );

  const communitiesFetched = await Promise.all(
    communityRefs.map((communityRef) => fetchPublicCommunityById(communityRef)),
  );
  const communities = communitiesFetched.filter((community): community is PublicCommunity => Boolean(community));

  const planName =
    cleanString(planCatalog?.name) ||
    pickMostCommonString(homes.map((home) => home.planName)) ||
    "Floor Plan";

  const description =
    cleanString(planCatalog?.description) ||
    firstNonEmpty(offerings.map((offering) => offering.descriptionOverride)) ||
    firstNonEmpty(homes.map((home) => home.description || home.highlights)) ||
    "Explore this floor plan across available communities and inventory.";

  const offeringImage = firstNonEmpty(offerings.map((offering) => offering.primaryImageOverrideUrl));
  const planCatalogImage = firstNonEmpty([
    cleanString(planCatalog?.primaryImageUrl),
    cleanString(planCatalog?.images?.[0]?.url),
    cleanString(planCatalog?.asset?.previewUrl),
    cleanString(planCatalog?.previewUrl),
  ]);
  const homeImage = firstNonEmpty([
    ...homes.map((home) => home.floorPlanImage),
    ...homes.map((home) => home.heroImage),
  ]);

  const heroImageUrl = offeringImage || planCatalogImage || homeImage;
  const planImageUrl =
    firstNonEmpty([
      cleanString(planCatalog?.asset?.previewUrl),
      cleanString(planCatalog?.previewUrl),
      cleanString(planCatalog?.images?.[0]?.url),
      ...homes.map((home) => home.floorPlanImage),
      offeringImage,
    ]) || heroImageUrl;

  const planFileUrl = firstNonEmpty([
    cleanString(planCatalog?.asset?.fileUrl),
    cleanString(planCatalog?.fileUrl),
    ...homes.map((home) => home.floorPlanUrl),
  ]);

  const specs = {
    beds: (typeof planCatalog?.beds === "number" && planCatalog.beds > 0
      ? planCatalog.beds
      : pickMostCommonNumber(homes.map((home) => home.beds))) || null,
    baths: (typeof planCatalog?.baths === "number" && planCatalog.baths > 0
      ? planCatalog.baths
      : pickMostCommonNumber(homes.map((home) => home.baths))) || null,
    sqft: (typeof planCatalog?.sqft === "number" && planCatalog.sqft > 0
      ? planCatalog.sqft
      : pickMostCommonNumber(homes.map((home) => home.sqft))) || null,
    garage:
      parseGarageSpaces(planCatalog?.garageSpaces, planCatalog?.garage) ||
      pickMostCommonNumber(homes.map((home) => home.garage)),
    stories:
      (typeof planCatalog?.stories === "number" && planCatalog.stories > 0 ? planCatalog.stories : null) ||
      null,
  };

  const communitiesCards = toPlanCommunityCards(communities, offerings, homes);

  return {
    floorPlanRef: normalizedRef,
    planName,
    description,
    heroImageUrl,
    planImageUrl,
    planFileUrl,
    lotOfferings: extractLotOfferings(planCatalog, offerings, communities),
    specs,
    communities: communitiesCards,
  };
}

export default async function FloorPlanPage({
  params,
}: {
  params: FloorPlanParams | Promise<FloorPlanParams>;
}) {
  const resolved = await params;
  const floorplanId = cleanString(resolved?.floorplanId) || "floor-plan";

  const data = await resolveFloorPlanData(floorplanId);
  const specsSubtitle = buildSpecsSubtitle(data.specs);
  const lotSummary =
    data.lotOfferings.length > 0
      ? `Lot offering: ${data.lotOfferings.slice(0, 3).join(", ")}`
      : null;
  const summaryItems = [
    toSummaryToken(data.specs.beds, "bd"),
    toSummaryToken(data.specs.baths, "ba"),
    toSummaryToken(data.specs.sqft, "sqft"),
    toSummaryToken(data.specs.garage, "car garage"),
    toSummaryToken(data.specs.stories, "stories"),
    lotSummary,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.pageShell}>
        <div className={styles.layout}>
          <header className={styles.header}>
            <div>
              <p className={styles.kicker}>Floor Plan</p>
              <h1 className={styles.title}>{data.planName}</h1>
              <p className={styles.subtitle}>{data.description}</p>
            </div>
            <div className={styles.actions}>
              <WorkspaceQueueButton
                subjectType="floorPlan"
                subjectId={floorplanId}
                title={data.planName}
                subtitle={specsSubtitle || undefined}
                contextRefs={{ floorPlanId: floorplanId }}
                className={styles.queueAction}
                activeClassName={styles.queueActionActive}
                queuedLabel="In Queue"
                idleLabel="Queue"
              />
              <SaveFloorPlanButton floorPlanId={floorplanId} floorPlanName={data.planName} />
            </div>
          </header>

          <section className={styles.hero}>
            <div className={styles.heroGrid}>
              <div className={styles.heroImageWrap}>
                {data.heroImageUrl ? (
                  <div
                    className={styles.heroImage}
                    style={{ backgroundImage: `url(${data.heroImageUrl})` }}
                    role="img"
                    aria-label={`${data.planName} exterior`}
                  />
                ) : (
                  <div className={styles.heroFallback}>Image coming soon</div>
                )}
              </div>

              <div className={styles.floorPlanPreview}>
                {data.planImageUrl ? (
                  <div
                    className={styles.floorPlanImage}
                    style={{ backgroundImage: `url(${data.planImageUrl})` }}
                    role="img"
                    aria-label={`${data.planName} floor plan`}
                  />
                ) : (
                  <div className={styles.floorPlanFallback}>Floor plan preview coming soon</div>
                )}
                {data.planFileUrl ? (
                  <a
                    href={data.planFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.floorPlanLink}
                  >
                    View Floor Plan
                  </a>
                ) : null}
              </div>
            </div>
            {summaryItems.length ? (
              <div className={styles.metaBar}>
                <p className={styles.summaryText}>{summaryItems.join(" | ")}</p>
              </div>
            ) : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Available Communities</h2>
              <p className={styles.panelHint}>Where this floor plan is currently offered.</p>
            </div>

            {data.communities.length ? (
              <div className={styles.communityGrid}>
                {data.communities.map((community) => {
                  const cardBody = (
                    <>
                      <div
                        className={styles.communityMedia}
                        style={community.imageUrl ? { backgroundImage: `url(${community.imageUrl})` } : undefined}
                      />
                      <div className={styles.communityBody}>
                        <p className={styles.communityName}>{community.name}</p>
                        <p className={styles.communityMeta}>{community.location || "Location coming soon"}</p>
                        <div className={styles.communityStats}>
                          <span className={styles.communityBadge}>
                            {community.priceFrom ? `From ${formatCurrency(community.priceFrom)}` : "Price available on request"}
                          </span>
                          <span className={styles.communityBadge}>
                            {community.quickMoveIns.toLocaleString()} {community.quickMoveIns === 1 ? "quick move-in" : "quick move-ins"}
                          </span>
                        </div>
                      </div>
                    </>
                  );

                  return community.href ? (
                    <Link key={community.id} href={community.href} className={styles.communityCardLink}>
                      {cardBody}
                    </Link>
                  ) : (
                    <article key={community.id} className={styles.communityCard}>
                      {cardBody}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyState}>
                No published community availability was found for this floor plan yet.
              </p>
            )}
          </section>
        </div>
        <BuyerWorkspaceSidebar
          subjectType="floorPlan"
          subjectId={floorplanId}
          title={data.planName}
          subtitle={specsSubtitle || undefined}
          contextRefs={{ floorPlanId: floorplanId }}
        />
      </div>
    </div>
  );
}
