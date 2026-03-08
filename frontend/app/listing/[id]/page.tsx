import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import ListingCard from "../../../components/ListingCard";
import NavBar from "../../../components/NavBar";
import { resolveBuilderParam } from "../../../lib/builder";
import {
  formatAddress,
  formatPrice,
  getPrimaryImage,
  getStatusBadge,
  hasValidCoordinates,
  safeLink,
} from "../../../lib/listingFormatters";
import {
  fetchBuilderProfileByRef,
  fetchPlanCatalogById,
  fetchPublicCommunityById,
  fetchPublicHomeById,
  fetchPublicHomesByCommunity,
  type PlanCatalogRecord,
} from "../../../lib/publicData";
import type { PublicHome } from "../../../types/public";
import {
  DEFAULT_SITE_NAME,
  DEFAULT_TWITTER_CARD,
  buildAbsoluteUrl,
  cleanText,
  sanitizeCanonicalPath,
  toAbsoluteUrl,
} from "../../../lib/seo";
import { computeEffectivePromos } from "../../../../shared/promo";
import { buildListingLocationLine } from "../../../../shared/listingLocation";
import ListingGallery from "./ListingGallery";
import SaveHomeButton from "./SaveHomeButton";
import WorkspaceQueueButton from "../../../components/workspace/WorkspaceQueueButton";
import BuyerWorkspaceSidebar from "../../../components/workspace/BuyerWorkspaceSidebar";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "Not provided";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeTaxRate(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value > 100) return null;
  return value > 1 ? value / 100 : value;
}

function formatMonthlyCurrency(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  return `${formatCurrency(value)}/mo`;
}

function formatTaxRateLabel(value?: number | null): string {
  const normalized = normalizeTaxRate(value);
  if (normalized === null) return "-";
  return `${(normalized * 100).toFixed(2)}%`;
}

function formatPercentFromDecimal(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = Number((value * 100).toFixed(2));
  return `${percent}%`;
}

function formatEstimatedCurrency(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  return formatCurrency(value);
}

function normalizeFeeCadence(value?: string | null): "monthly" | "annual" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("year") || normalized.includes("annual")) return "annual";
  return null;
}

function formatFeeWithCadence(amount?: number | null, cadenceValue?: string | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "-";
  const cadence = normalizeFeeCadence(cadenceValue);
  if (cadence === "monthly") return `${formatCurrency(amount)}/mo`;
  if (cadence === "annual") return `${formatCurrency(amount)}/yr`;
  return formatCurrency(amount);
}

function formatFlag(value?: boolean): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function formatBathLabel(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} ba`;
}

function buildCommunityHref(listing: PublicHome, communitySlug?: string | null): string | null {
  const slug = safeLink(communitySlug || listing.communitySlug || null);
  if (slug) {
    return `/community?communitySlug=${encodeURIComponent(slug)}`;
  }

  const ref = safeLink(
    listing.publicCommunityId || listing.keepupCommunityId || listing.communityId || null,
  );
  if (!ref) return null;
  return `/community?communityId=${encodeURIComponent(ref)}`;
}

function buildMapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.01;
  const left = (lng - delta).toFixed(6);
  const right = (lng + delta).toFixed(6);
  const top = (lat + delta).toFixed(6);
  const bottom = (lat - delta).toFixed(6);

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

function buildContactHref(
  contact:
    | PublicHome["salesContact"]
    | {
        name?: string | null;
        phone?: string | null;
        email?: string | null;
      }
    | null,
  fallbackBuilderHref: string | null,
  fallbackCommunityHref: string | null,
): string | null {
  const phone = safeLink(contact?.phone || null);
  if (phone) {
    const digits = phone.replace(/[^0-9+]/g, "");
    if (digits) return `tel:${digits}`;
  }

  const email = safeLink(contact?.email || null);
  if (email) {
    return `mailto:${email}`;
  }

  return fallbackBuilderHref || fallbackCommunityHref || null;
}

function formatModelAddress(listing: PublicHome): string | null {
  if (!listing.modelAddress) return null;
  const line = [
    listing.modelAddress.street,
    listing.modelAddress.city,
    [listing.modelAddress.state, listing.modelAddress.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return safeLink(line) || null;
}

function renderActionLink(
  href: string | null,
  label: string,
  className: string,
  external = false,
) {
  if (!href) return null;
  if (external || !href.startsWith("/")) {
    return (
      <a
        href={href}
        className={className}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {label}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

type ListingParams = { id: string };

const getListingPageData = cache(async (id: string) => {
  let listing: PublicHome | null = null;
  let dataError: string | null = null;

  try {
    listing = await fetchPublicHomeById(id);
  } catch (err) {
    dataError = err instanceof Error ? err.message : "Unknown error loading listing";
  }

  if (!listing) {
    return {
      listing,
      dataError,
      builderProfile: null,
      community: null,
      communityHomes: [] as PublicHome[],
      planCatalog: null,
    };
  }

  const builderLookupRef = listing.keepupBuilderId || listing.builderSlug || listing.builder || "";
  const communityLookupRef =
    listing.publicCommunityId ||
    listing.keepupCommunityId ||
    listing.communityId ||
    listing.communitySlug ||
    "";

  const [builderProfile, community, communityHomes, planCatalog] = await Promise.all([
    builderLookupRef ? fetchBuilderProfileByRef(builderLookupRef) : Promise.resolve(null),
    communityLookupRef
      ? fetchPublicCommunityById(communityLookupRef, { companyId: listing.companyId })
      : Promise.resolve(null),
    communityLookupRef ? fetchPublicHomesByCommunity(communityLookupRef, 12) : Promise.resolve([]),
    listing.planCatalogId ? fetchPlanCatalogById(listing.planCatalogId) : Promise.resolve(null),
  ]);

  return {
    listing,
    dataError,
    builderProfile,
    community,
    communityHomes,
    planCatalog,
  };
});

function buildListingTitle(listing: PublicHome, builderName?: string | null): string {
  return (
    cleanText(listing.address) ||
    cleanText(listing.title) ||
    [
      typeof listing.beds === "number" ? `${listing.beds} bed` : null,
      cleanText(listing.communityName),
      "listing",
    ]
      .filter(Boolean)
      .join(" ") ||
    cleanText(builderName) ||
    "Listing"
  );
}

function buildListingDescription(
  listing: PublicHome,
  builderName?: string | null,
  communityName?: string | null,
): string {
  return (
    cleanText(listing.description) ||
    cleanText(listing.highlights) ||
    [
      cleanText(builderName) ? `Published by ${cleanText(builderName)}.` : null,
      cleanText(communityName) ? `Located in ${cleanText(communityName)}.` : null,
      cleanText(formatAddress(listing)) !== "Address coming soon"
        ? `Address: ${formatAddress(listing)}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ") ||
    "Published home details on BuildRootz."
  );
}

function buildListingSchemaName(listing: PublicHome, communityName?: string | null): string {
  const bedrooms = typeof listing.beds === "number" ? `${listing.beds} bed` : null;
  const communityLabel = cleanText(communityName);
  if (bedrooms && communityLabel) {
    return `${bedrooms} home in ${communityLabel}`;
  }
  return buildListingTitle(listing, listing.builder);
}

function resolveFloorPlanPreviewUrl(
  listing: PublicHome,
  planCatalog: PlanCatalogRecord | null,
): string | null {
  const firstPlanImage = Array.isArray(planCatalog?.images)
    ? planCatalog.images.find((image) => typeof image?.url === "string" && image.url)?.url
    : null;
  return (
    cleanText(planCatalog?.asset?.previewUrl) ||
    cleanText(planCatalog?.previewUrl) ||
    cleanText(firstPlanImage) ||
    cleanText(listing.floorPlanImage) ||
    null
  );
}

function resolveFloorPlanPdfUrl(
  listing: PublicHome,
  planCatalog: PlanCatalogRecord | null,
): string | null {
  return (
    cleanText(planCatalog?.asset?.fileUrl) ||
    cleanText(planCatalog?.fileUrl) ||
    cleanText(listing.floorPlanUrl) ||
    null
  );
}

function buildListingJsonLd({
  listing,
  builderName,
  builderLogoUrl,
  canonicalUrl,
  imageUrls,
  communityName,
}: {
  listing: PublicHome;
  builderName?: string | null;
  builderLogoUrl?: string | null;
  canonicalUrl: string;
  imageUrls: string[];
  communityName?: string | null;
}): Record<string, unknown> {
  const origin = new URL(canonicalUrl).origin;
  const images = imageUrls
    .filter((url) => Boolean(url) && !url.startsWith("data:"))
    .map((url) => toAbsoluteUrl(url, origin));
  const streetAddress = cleanText(listing.address);
  const addressLocality = cleanText(listing.city);
  const addressRegion = cleanText(listing.state);
  const postalCode = cleanText(listing.postalCode);
  const hasAddressFields = Boolean(
    streetAddress || addressLocality || addressRegion || postalCode,
  );

  const address = {
    "@type": "PostalAddress",
    ...(streetAddress ? { streetAddress } : {}),
    ...(addressLocality ? { addressLocality } : {}),
    ...(addressRegion ? { addressRegion } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(hasAddressFields ? { addressCountry: "US" } : {}),
  };

  const sellerName = cleanText(builderName);
  const sellerLogo = cleanText(builderLogoUrl);

  return {
    "@context": "https://schema.org",
    "@type": "House",
    name: buildListingSchemaName(listing, communityName),
    url: canonicalUrl,
    ...(images.length ? { image: images } : {}),
    ...(hasAddressFields ? { address } : {}),
    ...(typeof listing.lat === "number" && typeof listing.lng === "number"
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: listing.lat,
            longitude: listing.lng,
          },
        }
      : {}),
    ...(typeof listing.sqft === "number"
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: listing.sqft,
            unitText: "sqft",
          },
        }
      : {}),
    ...(typeof listing.beds === "number" ? { numberOfBedrooms: listing.beds } : {}),
    ...(typeof listing.baths === "number" ? { numberOfBathroomsTotal: listing.baths } : {}),
    ...(typeof listing.price === "number"
      ? {
          offers: {
            "@type": "Offer",
            price: listing.price,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: canonicalUrl,
          },
        }
      : {}),
    ...(sellerName
      ? {
          seller: {
            "@type": "Organization",
            name: sellerName,
            ...(sellerLogo ? { logo: toAbsoluteUrl(sellerLogo, origin) } : {}),
          },
        }
      : {}),
  };
}

export async function generateMetadata({
  params,
}: {
  params: ListingParams | Promise<ListingParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const canonicalPath = sanitizeCanonicalPath(`/listing/${encodeURIComponent(id)}`);
  const { listing, builderProfile, community } = await getListingPageData(id);

  if (!listing) {
    return {
      title: "Listing",
      alternates: {
        canonical: canonicalPath,
      },
    };
  }

  const builderName = cleanText(builderProfile?.builderName) || cleanText(listing.builder);
  const communityName = cleanText(community?.name) || cleanText(listing.communityName);
  const title = buildListingTitle(listing, builderName);
  const description = buildListingDescription(listing, builderName, communityName);
  const primaryImage = getPrimaryImage(listing, builderProfile, community);
  const image =
    primaryImage.url && !primaryImage.isPlaceholder
      ? [{ url: primaryImage.url, alt: primaryImage.alt }]
      : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: DEFAULT_SITE_NAME,
      images: image,
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title,
      description,
      images: image?.map((item) => item.url),
    },
  };
}

export default async function ListingPage({
  params,
}: {
  params: ListingParams | Promise<ListingParams>;
}) {
  const { id } = await params;
  const { listing, dataError, builderProfile, community, communityHomes, planCatalog } =
    await getListingPageData(id);

  if (!listing && dataError) {
    return (
      <div className={styles.page}>
        <NavBar />
        <div className={styles.layout}>
          <div className={styles.panel}>
            <h3>Listing unavailable</h3>
            <p className={styles.muted}>
              Could not load this PublicHome from MongoDB. Check BUILDROOTZ_MONGODB_URI /
              BUILDROOTZ_DB_NAME and try again. Error: {dataError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    notFound();
  }

  const builderLabel = builderProfile?.builderName || listing.builder || null;
  const builderHref = safeLink(
    (() => {
      const builderParam =
        builderProfile?.builderSlug ||
        resolveBuilderParam({
          builderSlug: listing.builderSlug,
          keepupBuilderId: listing.keepupBuilderId,
          builder: builderLabel || undefined,
        });
      return builderParam ? `/builder/${builderParam}` : null;
    })(),
  );
  const communityHref = safeLink(buildCommunityHref(listing, community?.slug));
  const listingSalesContact =
    listing.salesContact && Object.values(listing.salesContact).some(Boolean)
      ? listing.salesContact
      : null;
  const communitySalesContact =
    community?.primaryContact && Object.values(community.primaryContact).some(Boolean)
      ? {
          name: community.primaryContact.name ?? undefined,
          phone: community.primaryContact.phone ?? undefined,
          email: community.primaryContact.email ?? undefined,
        }
      : null;
  const effectiveSalesContact = listingSalesContact || communitySalesContact;
  const effectiveSchools =
    listing.schools && Object.values(listing.schools).some(Boolean)
      ? listing.schools
      : community?.schools && Object.values(community.schools).some(Boolean)
        ? {
            isd: community.schools.isd ?? undefined,
            elementary: community.schools.elementary ?? undefined,
            middle: community.schools.middle ?? undefined,
            high: community.schools.high ?? undefined,
          }
        : null;
  const contactHref = safeLink(
    buildContactHref(effectiveSalesContact, builderHref, communityHref),
  );
  const floorPlanPreviewUrl = safeLink(resolveFloorPlanPreviewUrl(listing, planCatalog));
  const floorPlanHref = safeLink(resolveFloorPlanPdfUrl(listing, planCatalog));
  const showFloorPlanSection = Boolean(floorPlanPreviewUrl || floorPlanHref);
  const communityLabel = community?.name || listing.communityName || null;
  const effectivePrice =
    typeof listing.price === "number" && Number.isFinite(listing.price) && listing.price > 0
      ? listing.price
      : null;
  const communityHoaMonthly =
    typeof community?.hoaMonthly === "number" && Number.isFinite(community.hoaMonthly)
      ? community.hoaMonthly
      : null;
  const communityTaxRate = normalizeTaxRate(community?.taxRate);
  const communityPidFee =
    typeof community?.pidFee === "number" && Number.isFinite(community.pidFee) && community.pidFee > 0
      ? community.pidFee
      : null;
  const communityPidFeeLabel = formatFeeWithCadence(communityPidFee, community?.pidFeeFrequency ?? null);
  const communityMudTaxRateLabel = formatPercentFromDecimal(community?.mudTaxRate);
  const communityLegacyMudAmount =
    typeof community?.mudFeeAmount === "number" &&
    Number.isFinite(community.mudFeeAmount) &&
    community.mudFeeAmount > 0
      ? community.mudFeeAmount
      : null;
  const estimatedAnnualTaxes =
    effectivePrice !== null && communityTaxRate !== null
      ? effectivePrice * communityTaxRate
      : null;
  const estimatedMonthlyTaxes =
    estimatedAnnualTaxes !== null ? estimatedAnnualTaxes / 12 : null;
  const communityAmenities = Array.isArray(community?.amenities)
    ? community.amenities.filter(Boolean)
    : [];
  const communityProductTypes = Array.isArray(community?.productTypes)
    ? community.productTypes.filter(Boolean)
    : [];
  const effectivePromos = computeEffectivePromos({
    communityPromo: community?.promo,
    listingPromo: listing.promo,
    promoMode: listing.promoMode,
  });
  const promoEntries = effectivePromos.filter(Boolean) as Array<
    NonNullable<(typeof effectivePromos)[number]>
  >;

  const listingTitleAddress =
    cleanText(listing.address) || cleanText(listing.title) || "Address coming soon";
  const listingLocationLine = buildListingLocationLine({
    city: cleanText(listing.city) || "",
    state: cleanText(listing.state) || "",
    postalCode: cleanText(listing.postalCode) || "",
    formattedAddress: cleanText(listing.formattedAddress) || "",
  });
  const hasConcreteLocation = listingLocationLine !== "Location coming soon";
  const price = formatPrice(listing);
  const badge = getStatusBadge(listing);
  const address = formatAddress(listing);
  const summaryItems: string[] = [];
  if (typeof listing.beds === "number" && Number.isFinite(listing.beds) && listing.beds > 0) {
    summaryItems.push(`${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(listing.beds)} bd`);
  }
  const bathLabel = formatBathLabel(listing.baths);
  if (bathLabel) summaryItems.push(bathLabel);
  if (typeof listing.sqft === "number" && Number.isFinite(listing.sqft) && listing.sqft > 0) {
    summaryItems.push(`${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(listing.sqft))} sqft`);
  }
  if (typeof listing.garage === "number" && Number.isFinite(listing.garage) && listing.garage > 0) {
    summaryItems.push(`${listing.garage} car garage`);
  }
  if (
    typeof planCatalog?.stories === "number" &&
    Number.isFinite(planCatalog.stories) &&
    planCatalog.stories > 0
  ) {
    summaryItems.push(`${planCatalog.stories} ${planCatalog.stories === 1 ? "story" : "stories"}`);
  }
  if (builderLabel) {
    summaryItems.push(`Builder: ${builderLabel}`);
  }
  const planName = cleanText(listing.planName) || cleanText(planCatalog?.name);
  if (planName) {
    summaryItems.push(`Plan Name: ${planName}`);
  }
  const lotSize =
    cleanText(listing.lotSize) ||
    (communityProductTypes.length ? communityProductTypes.join(", ") : null);
  if (lotSize) {
    summaryItems.push(`Lot size: ${lotSize}`);
  }
  const primaryImage = getPrimaryImage(listing, builderProfile, community);
  const galleryUrls = Array.from(
    new Set(
      [primaryImage.url, ...(listing.heroImages ?? []), ...(listing.images ?? [])].filter(Boolean),
    ),
  );
  const galleryImages = galleryUrls.map((url, index) => ({
    url,
    alt: index === 0 ? primaryImage.alt : `${listing.title || "Home"} photo ${index + 1}`,
    isPlaceholder: index === 0 ? primaryImage.isPlaceholder : false,
  }));
  const modelAddressLine = formatModelAddress(listing);
  const hasMap = hasValidCoordinates(listing);
  const relatedHomes = communityHomes
    .filter((home) => home.id !== listing.id)
    .slice(0, 6);
  const canonicalPath = sanitizeCanonicalPath(`/listing/${encodeURIComponent(id)}`);
  const canonicalUrl = await buildAbsoluteUrl(canonicalPath);
  const listingJsonLd = buildListingJsonLd({
    listing,
    builderName: builderLabel,
    builderLogoUrl: builderProfile?.logoUrl || null,
    canonicalUrl,
    imageUrls: galleryUrls,
    communityName: communityLabel,
  });

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingJsonLd) }}
      />
      <NavBar />
      <div className={styles.pageShell}>
        <div className={styles.layout}>
          <div className={styles.headerRow}>
          <div className={styles.headerCopy}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{listingTitleAddress}</h1>
              <div className={styles.badges}>
                <span className={`${styles.status} ${styles[`status_${badge.variant}`]}`}>
                  {badge.text}
                </span>
                {listing.tag ? <span className={styles.tag}>{listing.tag}</span> : null}
              </div>
            </div>
            <div>
              {(communityLabel || hasConcreteLocation) ? (
                <div className={styles.communityLocationRow}>
                  {communityHref && communityLabel ? (
                    <Link className={styles.communityLink} href={communityHref}>
                      {communityLabel}
                    </Link>
                  ) : communityLabel ? (
                    <span className={styles.communityText}>{communityLabel}</span>
                  ) : null}
                  {communityLabel && hasConcreteLocation ? (
                    <span className={styles.locationSep}>-</span>
                  ) : null}
                  {hasConcreteLocation ? (
                    <span className={styles.address}>{listingLocationLine}</span>
                  ) : null}
                </div>
              ) : (
                <p className={styles.address}>Location coming soon</p>
              )}
            </div>
            <div className={styles.linkRow}>
              {builderHref && builderLabel ? (
                <Link className={styles.inlineLink} href={builderHref}>
                  {builderLabel}
                </Link>
              ) : builderLabel ? (
                <span className={styles.inlineMuted}>{builderLabel}</span>
              ) : null}
            </div>
          </div>
          <div className={styles.headerActions}>
            <div className={`${styles.price} ${price.isFallback ? styles.priceFallback : ""}`}>
              {price.label}
            </div>
            <WorkspaceQueueButton
              subjectType="listing"
              subjectId={listing.id}
              title={listingTitleAddress}
              subtitle={[price.label, communityLabel].filter(Boolean).join(" | ") || undefined}
              contextRefs={{ listingId: listing.id }}
              className={styles.queueAction}
              activeClassName={styles.queueActionActive}
              queuedLabel="In Queue"
              idleLabel="Queue"
            />
            <SaveHomeButton listingId={listing.id} />
          </div>
          </div>

          <div className={styles.hero}>
          <div className={styles.heroGrid}>
            <ListingGallery images={galleryImages} />
            {showFloorPlanSection ? (
              <div className={styles.floorPlan}>
                {floorPlanHref ? (
                  <a
                    href={floorPlanHref}
                    target="_blank"
                    rel="noopener"
                    className={styles.floorPlanThumbLink}
                    aria-label="Open floor plan PDF in a new tab"
                  >
                    {floorPlanPreviewUrl ? (
                      <div
                        className={styles.floorPlanImage}
                        style={{ backgroundImage: `url(${floorPlanPreviewUrl})` }}
                        role="img"
                        aria-label="Floor plan preview"
                      />
                    ) : (
                      <div className={styles.floorPlanLabel}>Floor plan PDF available</div>
                    )}
                  </a>
                ) : floorPlanPreviewUrl ? (
                  <div
                    className={styles.floorPlanImage}
                    style={{ backgroundImage: `url(${floorPlanPreviewUrl})` }}
                    role="img"
                    aria-label="Floor plan preview"
                  />
                ) : null}
                {floorPlanHref ? (
                  <a
                    href={floorPlanHref}
                    target="_blank"
                    rel="noopener"
                    className={styles.floorPlanLink}
                  >
                    View Floor Plan
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {summaryItems.length ? (
            <div className={styles.metaBar}>
              <p className={styles.summaryText}>{summaryItems.join(" | ")}</p>
            </div>
          ) : null}
          </div>

          <div className={styles.bodyGrid}>
          <div className={styles.panel}>
            <h3>Overview</h3>
            <p>
              {listing.description ||
                listing.highlights ||
                (listing.communityName
                  ? `A published home in ${listing.communityName}.`
                  : "Published home details pulled from KeepUP.")}
            </p>
            {promoEntries.length ? (
              <div className={styles.overviewIncentives}>
                <h4>Incentives</h4>
                <div className={styles.communityGrid}>
                  {promoEntries.map((promo, index) => (
                    <div key={`${promo.headline || "promo"}-${index}`}>
                      {promoEntries.length === 2 ? (
                        <div className={styles.specLabel}>
                          {index === 0 ? "Community incentive" : "This home"}
                        </div>
                      ) : null}
                      {promo.headline ? (
                        <div className={styles.specValue}>{promo.headline}</div>
                      ) : null}
                      {promo.description ? (
                        <p className={styles.muted}>{promo.description}</p>
                      ) : null}
                      {promo.disclaimer ? (
                        <p className={styles.muted}>{promo.disclaimer}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className={styles.panel}>
            <h3>Sales contact</h3>
            {effectiveSalesContact ? (
              <ul className={styles.list}>
                {effectiveSalesContact.name ? (
                  <li>
                    <strong>Name:</strong> {effectiveSalesContact.name}
                  </li>
                ) : null}
                {effectiveSalesContact.phone ? (
                  <li>
                    <strong>Phone:</strong> {effectiveSalesContact.phone}
                  </li>
                ) : null}
                {effectiveSalesContact.email ? (
                  <li>
                    <strong>Email:</strong> {effectiveSalesContact.email}
                  </li>
                ) : null}
                {modelAddressLine ? (
                  <li>
                    <strong>Model address:</strong> {modelAddressLine}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className={styles.muted}>No sales contact info provided.</p>
            )}
            <div className={styles.salesActions}>
              <div className={styles.ctaRow}>
                {contactHref ? (
                  renderActionLink(contactHref, "Contact Builder", styles.ctaPrimary)
                ) : (
                  <button type="button" className={styles.ctaPrimary} disabled>
                    Contact Builder
                  </button>
                )}
                {communityHref
                  ? renderActionLink(communityHref, "View Community", styles.ctaGhost)
                  : null}
              </div>
            </div>
          </div>
          </div>

          <div className={styles.bodyGrid}>
          <div className={styles.panel}>
            <h3>Location</h3>
            <p className={styles.muted}>{address}</p>
            {hasMap ? (
              <div className={styles.mapBox}>
                <iframe
                  title="Listing map"
                  src={buildMapEmbedUrl(listing.lat as number, listing.lng as number)}
                  className={styles.mapFrame}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <p className={styles.muted}>Map location coming soon.</p>
            )}
            {communityAmenities.length ? (
              <div className={styles.groupSection}>
                <h4 className={styles.groupHeading}>Community amenities</h4>
                <div className={styles.communityGrid}>
                  {communityAmenities.map((item) => (
                    <div key={item} className={styles.specValue}>{item}</div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.groupSection}>
              <h4 className={styles.groupHeading}>Schools</h4>
              {effectiveSchools ? (
                <ul className={styles.list}>
                  {effectiveSchools.isd ? (
                    <li>
                      <strong>ISD:</strong> {effectiveSchools.isd}
                    </li>
                  ) : null}
                  {effectiveSchools.elementary ? (
                    <li>
                      <strong>Elementary:</strong> {effectiveSchools.elementary}
                    </li>
                  ) : null}
                  {effectiveSchools.middle ? (
                    <li>
                      <strong>Middle:</strong> {effectiveSchools.middle}
                    </li>
                  ) : null}
                  {effectiveSchools.high ? (
                    <li>
                      <strong>High:</strong> {effectiveSchools.high}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className={styles.muted}>School information not provided.</p>
              )}
            </div>
          </div>
          <div className={styles.panel}>
            <h3>Fees & taxes</h3>
            <div className={styles.communityGrid}>
              <div>
                <div className={styles.specLabel}>HOA</div>
                <div className={styles.specValue}>{formatMonthlyCurrency(communityHoaMonthly)}</div>
              </div>
              <div>
                <div className={styles.specLabel}>Tax rate</div>
                <div className={styles.specValue}>{formatTaxRateLabel(community?.taxRate)}</div>
              </div>
              <div>
                <div className={styles.specLabel}>Est. annual taxes</div>
                <div className={styles.specValue}>{formatEstimatedCurrency(estimatedAnnualTaxes)}</div>
              </div>
              <div>
                <div className={styles.specLabel}>Est. monthly taxes</div>
                <div className={styles.specValue}>{formatEstimatedCurrency(estimatedMonthlyTaxes)}</div>
              </div>
              <div>
                <div className={styles.specLabel}>PID</div>
                <div className={styles.specValue}>{formatFlag(community?.pid)}</div>
              </div>
              <div>
                <div className={styles.specLabel}>PID fee</div>
                <div className={styles.specValue}>{communityPidFeeLabel}</div>
              </div>
              <div>
                <div className={styles.specLabel}>
                  {communityMudTaxRateLabel ? "MUD" : communityLegacyMudAmount !== null ? "MUD (legacy)" : "MUD"}
                </div>
                <div className={styles.specValue}>
                  {communityMudTaxRateLabel ?? formatEstimatedCurrency(communityLegacyMudAmount)}
                </div>
              </div>
              <div>
                <div className={styles.specLabel}>MUD district</div>
                <div className={styles.specValue}>{formatFlag(community?.mud)}</div>
              </div>
            </div>
          </div>
          </div>

          {relatedHomes.length ? (
            <div className={styles.panel}>
              <div className={styles.relatedHeader}>
                <div>
                  <h3>More homes in this community</h3>
                  <p className={styles.muted}>
                    Browse more published homes near this address.
                  </p>
                </div>
                {communityHref ? renderActionLink(communityHref, "See community", styles.ctaGhost) : null}
              </div>
              <div className={styles.relatedGrid}>
                {relatedHomes.map((home) => (
                  <ListingCard
                    key={home.id}
                    home={home}
                    community={
                      community
                        ? {
                            name: community.name,
                            slug: community.slug,
                            mapImage: community.mapImage,
                            city: community.city,
                            state: community.state,
                          }
                        : null
                    }
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <BuyerWorkspaceSidebar
          subjectType="listing"
          subjectId={listing.id}
          title={listingTitleAddress}
          subtitle={[price.label, communityLabel].filter(Boolean).join(" | ") || undefined}
        />
      </div>

      <div className={styles.mobileCtaBar}>
        <div className={styles.mobileCtaInner}>
          {contactHref ? (
            renderActionLink(contactHref, "Contact Builder", styles.ctaPrimary)
          ) : (
            <button type="button" className={styles.ctaPrimary} disabled>
              Contact Builder
            </button>
          )}
          <SaveHomeButton listingId={listing.id} />
        </div>
      </div>
    </div>
  );
}

