"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ListingCard from "../../../components/ListingCard";
import WorkspaceQueueButton from "../../../components/workspace/WorkspaceQueueButton";
import type { PublicCommunity, PublicFloorPlan, PublicHome } from "../../../types/public";
import styles from "./page.module.css";
import { buildListingsUrl } from "../../../lib/listingsUrl";

type BuilderFloorPlan = PublicFloorPlan & {
  stories?: number | null;
  heroImageUrl?: string | null;
  previewUrl?: string | null;
  fileUrl?: string | null;
  communityRefs?: Array<{
    id: string;
    name?: string | null;
    slug?: string | null;
  }>;
};

type Props = {
  homes: PublicHome[];
  communities: PublicCommunity[];
  builderSlug?: string;
  builderCompanyId?: string;
  floorPlans?: BuilderFloorPlan[];
};

type PreviewState = {
  url: string;
  planName: string;
  kind: "pdf" | "image";
};

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DASH = "-";

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function renderValue(value: unknown): string {
  if (!hasValue(value)) return DASH;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeHoaFrequency(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("month") || normalized === "mo" || normalized === "/mo") return "/mo";
  if (normalized.includes("year") || normalized.includes("annual") || normalized === "yr" || normalized === "/yr") {
    return "/yr";
  }
  return ` ${value.trim()}`;
}

function formatMoney(value: number | string | null | undefined): string {
  if (!hasValue(value)) return DASH;
  if (typeof value === "number") return priceFormatter.format(value);
  if (typeof value === "string") return value.trim();
  return DASH;
}

function formatHoa(
  amount: number | string | null | undefined,
  frequency: string | null | undefined,
  fallback?: string,
): string {
  if (hasValue(amount)) {
    if (typeof amount === "number") {
      return `${priceFormatter.format(amount)}${normalizeHoaFrequency(frequency) || ""}`;
    }
    if (typeof amount === "string") return amount.trim();
  }
  if (hasValue(fallback)) return String(fallback).trim();
  return DASH;
}

function pidMudChipLabel(
  pidMud?: { hasPid?: boolean | null; hasMud?: boolean | null } | null,
): string | null {
  const hasPid = pidMud?.hasPid;
  const hasMud = pidMud?.hasMud;
  if (hasPid === true && hasMud === true) return "PID + MUD";
  if (hasPid === true) return "PID";
  if (hasMud === true) return "MUD";
  if (hasPid === false || hasMud === false) return "None";
  return null;
}

function schoolsChipLabel(
  schools?: { district?: string | null; elementary?: string | null; middle?: string | null; high?: string | null; text?: string | null } | null,
): string | null {
  if (!schools) return null;
  if (hasValue(schools.district)) return String(schools.district).trim();
  if (hasValue(schools.text) || hasValue(schools.elementary) || hasValue(schools.middle) || hasValue(schools.high)) {
    return "Schools available";
  }
  return null;
}

function floorPlanPrice(plan: BuilderFloorPlan): string {
  if (typeof plan.basePriceFrom === "number") {
    return `From ${priceFormatter.format(plan.basePriceFrom)}`;
  }
  return "From -";
}

function floorPlanSpecs(plan: BuilderFloorPlan): string {
  const segments: string[] = [];
  if (typeof plan.beds === "number") segments.push(`${plan.beds} bd`);
  if (typeof plan.baths === "number") segments.push(`${plan.baths} ba`);
  if (typeof plan.sqft === "number") segments.push(`${Math.round(plan.sqft).toLocaleString()} sqft`);
  if (typeof plan.garage === "number" && plan.garage > 0) segments.push(`${plan.garage} car`);
  if (typeof plan.stories === "number" && plan.stories > 0) {
    segments.push(`${plan.stories} ${plan.stories === 1 ? "story" : "stories"}`);
  }
  return segments.join(" | ") || "Specs coming soon";
}

function displayCommunityCity(community: PublicCommunity) {
  const cityState = [community.city, community.state].filter(Boolean).join(", ");
  return cityState || "Location";
}

function displayCommunityModelAddress(community: PublicCommunity) {
  const modelAddress = community.modelAddress;
  if (!modelAddress) return null;
  const addressLine = [modelAddress.street, modelAddress.city, modelAddress.state, modelAddress.zip]
    .filter(Boolean)
    .join(", ");
  return addressLine || null;
}

function buildCommunityHref(community: PublicCommunity, builderSlug?: string): string {
  const query = new URLSearchParams();
  const communitySlugOrId = community.slug || community.keepupCommunityId || community.id;
  if (community.id) query.set("communityId", community.id);
  if (communitySlugOrId) query.set("communitySlug", communitySlugOrId);
  if (builderSlug) query.set("builder", builderSlug);
  return `/community?${query.toString()}`;
}

function planMatchesHome(plan: BuilderFloorPlan, home: PublicHome): boolean {
  const planTokens = new Set(
    [
      plan.id,
      plan.planCatalogId,
      plan.keepupFloorPlanId,
      cleanString(plan.name),
    ]
      .map((token) => normalizeToken(token))
      .filter(Boolean),
  );

  const homeTokens = [
    home.planCatalogId,
    home.keepupFloorPlanId,
    home.planNumber,
    home.planName,
  ]
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  if (homeTokens.some((token) => planTokens.has(token))) return true;

  const normalizedHomePlanName = normalizeToken(home.planName);
  const normalizedPlanName = normalizeToken(plan.name);
  if (normalizedHomePlanName && normalizedPlanName) {
    return (
      normalizedHomePlanName === normalizedPlanName ||
      normalizedHomePlanName.includes(normalizedPlanName) ||
      normalizedPlanName.includes(normalizedHomePlanName)
    );
  }

  return false;
}

function planPreviewUrl(plan: BuilderFloorPlan): string | null {
  return cleanString(plan.previewUrl) || cleanString(plan.fileUrl) || null;
}

function planHeroImageUrl(plan: BuilderFloorPlan): string | null {
  return cleanString(plan.heroImageUrl) || cleanString(plan.previewUrl) || null;
}

function planCommunityCount(plan: BuilderFloorPlan): number {
  const refs = Array.isArray(plan.communityRefs) ? plan.communityRefs : [];
  const unique = new Set(refs.map((ref) => cleanString(ref.id)).filter(Boolean));
  return unique.size;
}

function isPdfUrl(url: string): boolean {
  const cleaned = cleanString(url);
  if (!cleaned) return false;
  try {
    const parsed = new URL(cleaned, "https://buildrootz.local");
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return cleaned.toLowerCase().split("?")[0].endsWith(".pdf");
  }
}

export default function BuilderTabs({
  homes,
  communities,
  builderSlug,
  builderCompanyId,
  floorPlans = [],
}: Props) {
  const defaultTab = useMemo(() => {
    if (homes.length === 0 && communities.length > 0) return "communities";
    if (homes.length === 0 && communities.length === 0 && floorPlans.length > 0) return "floorplans";
    return "listings";
  }, [homes.length, communities.length, floorPlans.length]);

  const [activeTab, setActiveTab] = useState<"listings" | "communities" | "floorplans">(defaultTab);
  const [expandedCommunity, setExpandedCommunity] = useState<Record<string, boolean>>({});
  const [homePlanFilter, setHomePlanFilter] = useState<BuilderFloorPlan | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!preview || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  const communityLookup = useMemo(() => {
    const map = new Map<string, PublicCommunity>();
    communities.forEach((community) => {
      [
        cleanString(community.id),
        cleanString(community.keepupCommunityId),
        cleanString(community.slug),
      ]
        .filter(Boolean)
        .forEach((key) => map.set(key, community));
    });
    return map;
  }, [communities]);

  const filteredHomes = useMemo(() => {
    if (!homePlanFilter) return homes;
    return homes.filter((home) => planMatchesHome(homePlanFilter, home));
  }, [homes, homePlanFilter]);

  const builderName = useMemo(
    () => cleanString(homes.find((home) => home.builder)?.builder) || "Builder",
    [homes],
  );

  return (
    <section className={styles.tabsSection}>
      <div className={styles.tabsHeader}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "listings" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("listings")}
          >
            Listings <span className={styles.tabCount}>{filteredHomes.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "communities" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("communities")}
          >
            Communities <span className={styles.tabCount}>{communities.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "floorplans" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("floorplans")}
          >
            Floor plans <span className={styles.tabCount}>{floorPlans.length}</span>
          </button>
        </div>
        <Link href="/listings" className={styles.ghostLink}>
          Back to listings
        </Link>
      </div>

      {activeTab === "listings" && (
        <>
          {homes.length === 0 ? (
            <div className={styles.panel}>
              <h3>No active listings available right now.</h3>
            </div>
          ) : (
            <>
              {homePlanFilter ? (
                <div className={styles.planFilterChip}>
                  <span>Filtered by floor plan: {homePlanFilter.name}</span>
                  <button type="button" onClick={() => setHomePlanFilter(null)} aria-label="Clear floor plan filter">
                    x
                  </button>
                </div>
              ) : null}

              {filteredHomes.length === 0 ? (
                <div className={styles.panel}>
                  <h3>No active listings match this floor plan.</h3>
                </div>
              ) : (
                <div className={styles.cardGrid}>
                  {filteredHomes.map((home) => {
                    const community = [
                      cleanString(home.publicCommunityId),
                      cleanString(home.keepupCommunityId),
                      cleanString(home.communityId),
                      cleanString(home.communitySlug),
                    ]
                      .map((key) => communityLookup.get(key))
                      .find(Boolean);

                    return (
                      <ListingCard
                        key={home.id}
                        home={home}
                        variant="compact"
                        showSaveButton
                        community={
                          community
                            ? {
                                name: cleanString(community.name) || undefined,
                                slug: cleanString(community.slug) || undefined,
                                city: cleanString(community.city) || undefined,
                                state: cleanString(community.state) || undefined,
                                mapImage: cleanString(community.mapImage) || undefined,
                              }
                            : null
                        }
                        builder={{
                          builderName: builderName || home.builder || null,
                          builderSlug: cleanString(builderSlug) || null,
                          logoUrl: null,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === "communities" && (
        <>
          {communities.length === 0 ? (
            <div className={styles.panel}>
              <h3>No published communities available yet.</h3>
            </div>
          ) : (
            <div className={styles.communityGrid}>
              {communities.map((community) => {
                const modelAddress = displayCommunityModelAddress(community);
                const details = community.communityDetails;
                const communityId = community.id;
                const isExpanded = Boolean(expandedCommunity[communityId]);
                const summaryTotalLots =
                  typeof details?.totalLots === "number" ? `${details.totalLots.toLocaleString()} lots` : null;
                const summaryHoa = hasValue(details?.hoaAmount) || hasValue(community.hoa)
                  ? formatHoa(details?.hoaAmount, details?.hoaFrequency, community.hoa)
                  : null;
                const summaryPidMud = pidMudChipLabel(details?.pidMud);
                const summarySchools = schoolsChipLabel(details?.schools);
                const showRealtorIncentives = Boolean(details?.realtorIncentives?.enabled);
                const communityHref = buildCommunityHref(community, builderSlug);

                return (
                  <article key={community.id} className={styles.communityCard}>
                    <Link href={communityHref} className={styles.cardLink}>
                      <div
                        className={styles.communityMedia}
                        style={community.mapImage ? { backgroundImage: `url(${community.mapImage})` } : undefined}
                      />
                      <div className={styles.cardBody}>
                        <div className={styles.communityTitleRow}>
                          <p className={styles.cardTitle}>{community.name || "Community"}</p>
                          <span className={styles.communityLike} aria-hidden="true">
                            <svg className={styles.communityLikeIcon} viewBox="0 0 24 24" focusable="false">
                              <circle className={styles.saveCircle} cx="12" cy="12" r="9" />
                              <path
                                className={styles.saveRoots}
                                d="M12 14.5c-.6.9-1.3 1.7-2.2 2.2M12 14.5c.6.7 1.3 1.4 2.2 1.8M12 14.5c0 1-.2 2-.4 3M12 14.5c.3.8.5 1.5.8 2.3"
                                fill="none"
                              />
                              <path
                                className={styles.saveSprout}
                                d="M12 14.5V10.8m0 0c.4-1.3 1.1-2.6 2.8-3m-2.8 3c-.5-1.2-1.3-2.3-2.8-2.6"
                                fill="none"
                              />
                            </svg>
                          </span>
                        </div>
                        <p className={styles.cardMeta}>{displayCommunityCity(community)}</p>
                        {modelAddress && (
                          <p className={styles.cardMeta}>
                            Model home: {modelAddress}
                          </p>
                        )}
                        <p className={styles.cardMeta}>
                          {(community.floorPlans?.length ?? 0).toLocaleString()} floor plans published
                        </p>
                        <div className={styles.communityChipRow}>
                          {summaryTotalLots && <span className={styles.communityChip}>{summaryTotalLots}</span>}
                          {summaryHoa && <span className={styles.communityChip}>HOA {summaryHoa}</span>}
                          {summaryPidMud && <span className={styles.communityChip}>{summaryPidMud}</span>}
                          {summarySchools && <span className={styles.communityChip}>{summarySchools}</span>}
                        </div>
                      </div>
                    </Link>
                    <div className={styles.communityCardFooter}>
                      <Link href={communityHref} className={styles.viewDetailsLink}>
                        View details
                      </Link>
                      <Link
                        href={buildListingsUrl({
                          publicCommunityId: cleanString(community.id) || undefined,
                          companyId: cleanString(builderCompanyId) || undefined,
                        })}
                        className={styles.viewListingsLink}
                      >
                        View listings
                      </Link>
                      <button
                        type="button"
                        className={styles.communityDetailsBtn}
                        onClick={() =>
                          setExpandedCommunity((prev) => ({
                            ...prev,
                            [communityId]: !prev[communityId],
                          }))
                        }
                      >
                        {isExpanded ? "Hide info" : "More info"}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className={styles.communityDetails}>
                        <section className={styles.detailsSection}>
                          <h4 className={styles.detailsHeading}>Community Overview</h4>
                          <div className={styles.detailsGrid}>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Total lots</span>
                              <span className={styles.detailValue}>
                                {typeof details?.totalLots === "number" ? details.totalLots.toLocaleString() : DASH}
                              </span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>HOA</span>
                              <span className={styles.detailValue}>
                                {formatHoa(details?.hoaAmount, details?.hoaFrequency, community.hoa)}
                              </span>
                            </div>
                            {hasValue(details?.earnestMoney) && (
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Earnest</span>
                                <span className={styles.detailValue}>{formatMoney(details?.earnestMoney)}</span>
                              </div>
                            )}
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>PID / MUD</span>
                              <span className={styles.detailValue}>{pidMudChipLabel(details?.pidMud) || DASH}</span>
                            </div>
                          </div>
                          {hasValue(details?.pidMud?.notes) && (
                            <p className={styles.detailNote}>Notes: {renderValue(details?.pidMud?.notes)}</p>
                          )}
                        </section>

                        {(community.floorPlans?.length ?? 0) > 0 && (
                          <section className={styles.detailsSection}>
                            <h4 className={styles.detailsHeading}>Plans & Pricing</h4>
                            <div className={styles.detailsGrid}>
                              {(community.floorPlans ?? []).map((plan) => (
                                <div className={styles.detailItem} key={`${community.id}-${plan.id}`}>
                                  <span className={styles.detailLabel}>{plan.name}</span>
                                  <span className={styles.detailValue}>
                                    {typeof plan.basePriceFrom === "number" ? `From ${priceFormatter.format(plan.basePriceFrom)}` : "From -"}
                                  </span>
                                  <span className={styles.detailNote}>
                                    {plan.beds ?? "N/A"} bd | {plan.baths ?? "N/A"} ba |{" "}
                                    {typeof plan.sqft === "number" ? plan.sqft.toLocaleString() : "N/A"} sqft
                                  </span>
                                  <Link
                                    href={buildListingsUrl({
                                      publicCommunityId: cleanString(community.id) || undefined,
                                      companyId: cleanString(builderCompanyId) || undefined,
                                      keepupFloorPlanId: cleanString(plan.keepupFloorPlanId) || undefined,
                                      planCatalogId: cleanString(plan.planCatalogId) || undefined,
                                    })}
                                    className={styles.viewPlanListingsLink}
                                  >
                                    View listings for this plan
                                  </Link>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        <section className={styles.detailsSection}>
                          <h4 className={styles.detailsHeading}>Primary Contact</h4>
                          {(() => {
                            const contactRows = [
                              { label: "Name", value: details?.primaryContact?.name },
                              { label: "Role", value: details?.primaryContact?.role },
                              { label: "Phone", value: details?.primaryContact?.phone },
                              { label: "Email", value: details?.primaryContact?.email },
                            ].filter((row) => hasValue(row.value));
                            if (!contactRows.length) {
                              return <p className={styles.detailNote}>No public contact details published.</p>;
                            }
                            return (
                              <div className={styles.contactCard}>
                                {contactRows.map((row) => (
                                  <div className={styles.detailItem} key={row.label}>
                                    <span className={styles.detailLabel}>{row.label}</span>
                                    <span className={styles.detailValue}>{renderValue(row.value)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </section>

                        <section className={styles.detailsSection}>
                          <h4 className={styles.detailsHeading}>Schools</h4>
                          <div className={styles.detailsGrid}>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>District</span>
                              <span className={styles.detailValue}>{renderValue(details?.schools?.district)}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Elementary</span>
                              <span className={styles.detailValue}>{renderValue(details?.schools?.elementary)}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>Middle</span>
                              <span className={styles.detailValue}>{renderValue(details?.schools?.middle)}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <span className={styles.detailLabel}>High</span>
                              <span className={styles.detailValue}>{renderValue(details?.schools?.high)}</span>
                            </div>
                          </div>
                          {hasValue(details?.schools?.text) && (
                            <p className={styles.detailNote}>Details: {renderValue(details?.schools?.text)}</p>
                          )}
                        </section>

                        {showRealtorIncentives && (
                          <section className={styles.detailsSection}>
                            <h4 className={styles.detailsHeading}>Realtor Incentives</h4>
                            <div className={styles.detailsGrid}>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Amount</span>
                                <span className={styles.detailValue}>
                                  {formatMoney(details?.realtorIncentives?.amount)}
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Notes</span>
                                <span className={styles.detailValue}>
                                  {renderValue(details?.realtorIncentives?.notes)}
                                </span>
                              </div>
                            </div>
                          </section>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "floorplans" && (
        <>
          {floorPlans.length === 0 ? (
            <div className={styles.panel}>
              <h3>No floor plans published yet.</h3>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {floorPlans.map((plan) => {
                const previewUrl = planPreviewUrl(plan);
                const heroImageUrl = planHeroImageUrl(plan);
                const communityCount = planCommunityCount(plan);
                const floorPlanSubjectId =
                  cleanString(plan.id) ||
                  cleanString(plan.planCatalogId) ||
                  cleanString(plan.keepupFloorPlanId);
                const floorPlanTitle = cleanString(plan.name) || "Floor plan";
                const floorPlanSubtitle = floorPlanPrice(plan);
                return (
                  <article key={plan.id} className={styles.card}>
                    <div
                      className={styles.cardMedia}
                      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
                    >
                      {!heroImageUrl ? (
                        <span className={styles.cardMediaBadge}>No preview</span>
                      ) : null}
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{plan.name || "Floor plan"}</p>
                      <p className={styles.cardPrice}>{floorPlanPrice(plan)}</p>
                      <p className={styles.cardMeta}>{floorPlanSpecs(plan)}</p>
                      <p className={styles.cardMeta}>
                        {communityCount > 0 ? `${communityCount} ${communityCount === 1 ? "community" : "communities"}` : "Community assignments pending"}
                      </p>
                      <div className={styles.planActions}>
                        <button
                          type="button"
                          className={styles.planActionBtn}
                          onClick={() => {
                            if (!previewUrl) return;
                            setPreview({
                              url: previewUrl,
                              planName: plan.name || "Floor plan",
                              kind: isPdfUrl(previewUrl) ? "pdf" : "image",
                            });
                          }}
                          disabled={!previewUrl}
                          title={previewUrl ? "Preview floor plan" : "Preview not available"}
                        >
                          Preview floor plan
                        </button>
                        <button
                          type="button"
                          className={styles.planActionBtnSecondary}
                          onClick={() => {
                            setHomePlanFilter(plan);
                            setActiveTab("listings");
                          }}
                        >
                          View homes
                        </button>
                      </div>
                      {floorPlanSubjectId ? (
                        <div className={styles.planQueueRow}>
                          <WorkspaceQueueButton
                            subjectType="floorPlan"
                            subjectId={floorPlanSubjectId}
                            title={floorPlanTitle}
                            subtitle={floorPlanSubtitle}
                            contextRefs={{
                              floorPlanId: floorPlanSubjectId,
                              ...(cleanString(builderCompanyId)
                                ? { builderId: cleanString(builderCompanyId) }
                                : {}),
                            }}
                            className={styles.planQueueBtn}
                            activeClassName={styles.planQueueBtnActive}
                            queuedLabel="In Queue"
                            idleLabel="Queue"
                          />
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {preview ? (
        <div className={styles.previewModalBackdrop} onClick={() => setPreview(null)} role="presentation">
          <div className={styles.previewModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.previewModalHeader}>
              <p className={styles.previewModalTitle}>{preview.planName}</p>
              <button type="button" onClick={() => setPreview(null)} className={styles.previewModalClose}>
                Close
              </button>
            </div>
            {preview.kind === "pdf" ? (
              <iframe title={`${preview.planName} preview`} src={preview.url} className={styles.previewFrame} />
            ) : (
              <img src={preview.url} alt={`${preview.planName} preview`} className={styles.previewImage} />
            )}
            <a href={preview.url} target="_blank" rel="noreferrer" className={styles.previewExternalLink}>
              Open in new tab
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
