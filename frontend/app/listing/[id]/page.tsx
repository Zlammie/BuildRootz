import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, cache } from "react";
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
import ListingLocationMap from "./ListingLocationMap";
import SaveHomeButton from "./SaveHomeButton";
import WorkspaceQueueButton from "../../../components/workspace/WorkspaceQueueButton";
import BuyerWorkspaceSidebar from "../../../components/workspace/BuyerWorkspaceSidebar";
import FeesTaxesSection, { type FeesTaxesColumn, type FeesTaxesItem } from "./FeesTaxesSection";
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

function formatYearlyCurrency(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  return `${formatCurrency(value)}/yr`;
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

function convertFeeForMode(
  amount: number | null,
  cadenceValue: string | null | undefined,
  mode: "monthly" | "yearly",
): { amount: number | null; estimated: boolean; cadenceKnown: boolean } {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { amount: null, estimated: false, cadenceKnown: false };
  }

  const cadence = normalizeFeeCadence(cadenceValue);
  if (cadence === "monthly") {
    return {
      amount: mode === "monthly" ? amount : amount * 12,
      estimated: mode === "yearly",
      cadenceKnown: true,
    };
  }
  if (cadence === "annual") {
    return {
      amount: mode === "yearly" ? amount : amount / 12,
      estimated: mode === "monthly",
      cadenceKnown: true,
    };
  }
  return { amount, estimated: false, cadenceKnown: false };
}

function buildPidFeeItem(
  amount: number | null,
  cadenceValue: string | null | undefined,
  mode: "monthly" | "yearly",
): FeesTaxesItem {
  const converted = convertFeeForMode(amount, cadenceValue, mode);
  if (!converted.cadenceKnown) {
    return {
      label: "PID fee",
      value: formatFeeWithCadence(amount, cadenceValue ?? null),
    };
  }

  return {
    label: "PID fee",
    value:
      mode === "monthly"
        ? formatMonthlyCurrency(converted.amount)
        : formatYearlyCurrency(converted.amount),
  };
}

function buildMudFeeItem(
  amount: number | null,
  rate: number | null,
  price: number | null,
  mode: "monthly" | "yearly",
  fallbackRateLabel: string | null,
): FeesTaxesItem {
  if (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate > 0 &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0
  ) {
    const annualAmount = price * rate;
    return {
      label: "MUD fee",
      value: mode === "monthly" ? formatMonthlyCurrency(annualAmount / 12) : formatYearlyCurrency(annualAmount),
    };
  }

  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
    return {
      label: "MUD fee",
      value: formatEstimatedCurrency(amount),
    };
  }

  return {
    label: "MUD fee",
    value: fallbackRateLabel ?? "-",
  };
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

function normalizeExternalUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  const withProtocol =
    /^https?:\/\//i.test(raw)
      ? raw
      : raw.startsWith("//")
        ? `https:${raw}`
        : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildPhoneHref(phone?: string | null): string | null {
  const value = safeLink(phone || null);
  if (!value) return null;
  const digits = value.replace(/[^0-9+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function buildEmailHref(email?: string | null): string | null {
  const value = safeLink(email || null);
  return value ? `mailto:${value}` : null;
}

function getBuilderMonogram(name?: string | null): string {
  const words = (name || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!words.length) return "BR";
  return words
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function ContactInfoIcon({ kind }: { kind: "name" | "phone" | "email" | "location" }) {
  if (kind === "name") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (kind === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 4.5h3l1.5 4-2 1.5a14 14 0 0 0 4 4l1.5-2 4 1.5v3A2 2 0 0 1 17.5 19 13 13 0 0 1 5 6.5 2 2 0 0 1 7.5 4.5Z" />
      </svg>
    );
  }

  if (kind === "email") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5Z" />
        <path d="m5 7 7 5 7-5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20s6-5.33 6-10a6 6 0 1 0-12 0c0 4.67 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
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

  const builderLookupRef =
    listing.keepupBuilderId || listing.builderSlug || listing.companyId || listing.builder || "";
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
  const builderLogoUrl = safeLink(builderProfile?.logoUrl || null);
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
  const contactHref = safeLink(builderHref || communityHref);
  const builderWebsiteHref = normalizeExternalUrl(
    builderProfile?.websiteUrl || builderProfile?.website || null,
  );
  const contactPhoneHref = buildPhoneHref(effectiveSalesContact?.phone ?? null);
  const contactEmailHref = buildEmailHref(effectiveSalesContact?.email ?? null);
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
  const communityMudTaxRate = normalizeTaxRate(community?.mudTaxRate);
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
  const monthlyPidFeeItem = buildPidFeeItem(
    communityPidFee,
    community?.pidFeeFrequency ?? null,
    "monthly",
  );
  const yearlyPidFeeItem = buildPidFeeItem(
    communityPidFee,
    community?.pidFeeFrequency ?? null,
    "yearly",
  );
  const monthlyMudFeeItem = buildMudFeeItem(
    communityLegacyMudAmount,
    communityMudTaxRate,
    effectivePrice,
    "monthly",
    communityMudTaxRateLabel,
  );
  const yearlyMudFeeItem = buildMudFeeItem(
    communityLegacyMudAmount,
    communityMudTaxRate,
    effectivePrice,
    "yearly",
    communityMudTaxRateLabel,
  );
  const hasPidColumn = community?.pid === true || communityPidFee !== null;
  const hasMudColumn =
    community?.mud === true || communityMudTaxRateLabel !== null || communityLegacyMudAmount !== null;
  const pidFlagValue = hasPidColumn ? "Yes" : formatFlag(community?.pid);
  const mudFlagValue =
    community?.mud === true && communityMudTaxRateLabel
      ? `Yes (${communityMudTaxRateLabel})`
      : community?.mud === true
        ? "Yes"
        : communityMudTaxRateLabel ?? formatFlag(community?.mud);
  const monthlyFeeColumns: FeesTaxesColumn[] = [
    {
      key: "hoa",
      top: {
        label: "HOA",
        value: formatMonthlyCurrency(communityHoaMonthly),
      },
      bottom: null,
    },
    {
      key: "taxes",
      top: {
        label: "Tax rate",
        value: formatTaxRateLabel(community?.taxRate),
      },
      bottom: {
        label: "Est. taxes",
        value: formatEstimatedCurrency(estimatedMonthlyTaxes),
      },
    },
    ...(hasPidColumn
      ? [
          {
            key: "pid",
            top: {
              label: "PID",
              value: pidFlagValue,
            },
            bottom: {
              label: monthlyPidFeeItem.label,
              value: monthlyPidFeeItem.value,
            },
          } satisfies FeesTaxesColumn,
        ]
      : []),
    ...(hasMudColumn
      ? [
          {
            key: "mud",
            top: {
              label: "MUD",
              value: mudFlagValue,
            },
            bottom: {
              label: monthlyMudFeeItem.label,
              value: monthlyMudFeeItem.value,
            },
          } satisfies FeesTaxesColumn,
        ]
      : []),
  ];
  const yearlyFeeColumns: FeesTaxesColumn[] = [
    {
      key: "hoa",
      top: {
        label: "HOA",
        value:
          typeof communityHoaMonthly === "number" && Number.isFinite(communityHoaMonthly)
            ? formatYearlyCurrency(communityHoaMonthly * 12)
            : "-",
      },
      bottom: null,
    },
    {
      key: "taxes",
      top: {
        label: "Tax rate",
        value: formatTaxRateLabel(community?.taxRate),
      },
      bottom: {
        label: "Est. annual taxes",
        value: formatEstimatedCurrency(estimatedAnnualTaxes),
      },
    },
    ...(hasPidColumn
      ? [
          {
            key: "pid",
            top: {
              label: "PID",
              value: pidFlagValue,
            },
            bottom: {
              label: yearlyPidFeeItem.label,
              value: yearlyPidFeeItem.value,
            },
          } satisfies FeesTaxesColumn,
        ]
      : []),
    ...(hasMudColumn
      ? [
          {
            key: "mud",
            top: {
              label: "MUD",
              value: mudFlagValue,
            },
            bottom: {
              label: yearlyMudFeeItem.label,
              value: yearlyMudFeeItem.value,
            },
          } satisfies FeesTaxesColumn,
        ]
      : []),
  ];
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
  const summaryItems: Array<{ key: string; label: string; href?: string | null }> = [];
  if (typeof listing.beds === "number" && Number.isFinite(listing.beds) && listing.beds > 0) {
    summaryItems.push({
      key: "beds",
      label: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(listing.beds)} bd`,
    });
  }
  const bathLabel = formatBathLabel(listing.baths);
  if (bathLabel) summaryItems.push({ key: "baths", label: bathLabel });
  if (typeof listing.sqft === "number" && Number.isFinite(listing.sqft) && listing.sqft > 0) {
    summaryItems.push({
      key: "sqft",
      label: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(listing.sqft))} sqft`,
    });
  }
  if (typeof listing.garage === "number" && Number.isFinite(listing.garage) && listing.garage > 0) {
    summaryItems.push({ key: "garage", label: `${listing.garage} car garage` });
  }
  if (
    typeof planCatalog?.stories === "number" &&
    Number.isFinite(planCatalog.stories) &&
    planCatalog.stories > 0
  ) {
    summaryItems.push({
      key: "stories",
      label: `${planCatalog.stories} ${planCatalog.stories === 1 ? "story" : "stories"}`,
    });
  }
  if (builderLabel) {
    summaryItems.push({
      key: "builder",
      label: `Builder: ${builderLabel}`,
      href: builderHref,
    });
  }
  const planName = cleanText(listing.planName) || cleanText(planCatalog?.name);
  if (planName) {
    summaryItems.push({ key: "plan", label: `Plan Name: ${planName}` });
  }
  const lotSize =
    cleanText(listing.lotSize) ||
    (communityProductTypes.length ? communityProductTypes.join(", ") : null);
  if (lotSize) {
    summaryItems.push({ key: "lot", label: `Lot size: ${lotSize}` });
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
  const listingMapLocation = hasValidCoordinates(listing)
    ? {
        lat: listing.lat as number,
        lng: listing.lng as number,
      }
    : typeof community?.location?.lat === "number" &&
        typeof community?.location?.lng === "number" &&
        Number.isFinite(community.location.lat) &&
        Number.isFinite(community.location.lng)
      ? {
          lat: community.location.lat,
          lng: community.location.lng,
        }
      : null;
  const hasMap = Boolean(listingMapLocation);
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
              <p className={styles.summaryText}>
                {summaryItems.map((item, index) => (
                  <Fragment key={item.key}>
                    {item.href ? (
                      <Link className={styles.summaryLink} href={item.href}>
                        {item.label}
                      </Link>
                    ) : (
                      <span>{item.label}</span>
                    )}
                    {index < summaryItems.length - 1 ? (
                      <span className={styles.summaryDivider}>|</span>
                    ) : null}
                  </Fragment>
                ))}
              </p>
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
            <div className={styles.contactHero}>
              <div className={styles.contactBrandMark}>
                {builderLogoUrl ? (
                  <div
                    className={styles.contactBrandImage}
                    style={{ backgroundImage: `url(${builderLogoUrl})` }}
                    role="img"
                    aria-label={builderLabel ? `${builderLabel} logo` : "Builder logo"}
                  />
                ) : (
                  <div className={styles.contactBrandFallback} aria-hidden="true">
                    {getBuilderMonogram(builderLabel)}
                  </div>
                )}
              </div>
              <div className={styles.contactHeroCopy}>
                <h3>Sales contact</h3>
                {builderHref && builderLabel ? (
                  <Link className={styles.contactBuilderLink} href={builderHref}>
                    {builderLabel}
                  </Link>
                ) : builderLabel ? (
                  <div className={styles.contactBuilderText}>{builderLabel}</div>
                ) : null}
                {communityHref && communityLabel ? (
                  <Link className={styles.contactCommunityLink} href={communityHref}>
                    {communityLabel}
                  </Link>
                ) : communityLabel ? (
                  <div className={styles.contactCommunityText}>{communityLabel}</div>
                ) : null}
              </div>
            </div>
            {effectiveSalesContact ? (
              <div className={styles.contactCard}>
                {effectiveSalesContact.name ? (
                  <div className={styles.contactRow}>
                    <span className={styles.contactIcon}>
                      <ContactInfoIcon kind="name" />
                    </span>
                    <div className={styles.contactMeta}>
                      <div className={styles.contactLabel}>Name</div>
                      <div className={styles.contactValue}>{effectiveSalesContact.name}</div>
                    </div>
                  </div>
                ) : null}
                {effectiveSalesContact.phone ? (
                  <div className={styles.contactRow}>
                    <span className={styles.contactIcon}>
                      <ContactInfoIcon kind="phone" />
                    </span>
                    <div className={styles.contactMeta}>
                      <div className={styles.contactLabel}>Phone</div>
                      {contactPhoneHref ? (
                        <a href={contactPhoneHref} className={styles.contactValueLink}>
                          {effectiveSalesContact.phone}
                        </a>
                      ) : (
                        <div className={styles.contactValue}>{effectiveSalesContact.phone}</div>
                      )}
                    </div>
                  </div>
                ) : null}
                {effectiveSalesContact.email ? (
                  <div className={styles.contactRow}>
                    <span className={styles.contactIcon}>
                      <ContactInfoIcon kind="email" />
                    </span>
                    <div className={styles.contactMeta}>
                      <div className={styles.contactLabel}>Email</div>
                      {contactEmailHref ? (
                        <a href={contactEmailHref} className={styles.contactValueLink}>
                          {effectiveSalesContact.email}
                        </a>
                      ) : (
                        <div className={styles.contactValue}>{effectiveSalesContact.email}</div>
                      )}
                    </div>
                  </div>
                ) : null}
                {modelAddressLine ? (
                  <div className={styles.contactRow}>
                    <span className={styles.contactIcon}>
                      <ContactInfoIcon kind="location" />
                    </span>
                    <div className={styles.contactMeta}>
                      <div className={styles.contactLabel}>Model address</div>
                      <div className={styles.contactValue}>{modelAddressLine}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.muted}>No sales contact info provided.</p>
            )}
            <div className={styles.salesActions}>
              <div className={styles.ctaRow}>
                {contactHref ? (
                  renderActionLink(contactHref, "View Builder", styles.ctaPrimary)
                ) : (
                  <button type="button" className={styles.ctaPrimary} disabled>
                    View Builder
                  </button>
                )}
                {builderWebsiteHref
                  ? renderActionLink(
                      builderWebsiteHref,
                      "Visit Builder Website",
                      styles.ctaGhost,
                      true,
                    )
                  : null}
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
            {listingMapLocation ? (
              <div className={styles.mapBox}>
                <ListingLocationMap
                  lat={listingMapLocation.lat}
                  lng={listingMapLocation.lng}
                  label={listingTitleAddress}
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
            <FeesTaxesSection
              monthlyColumns={monthlyFeeColumns}
              yearlyColumns={yearlyFeeColumns}
            />
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
            renderActionLink(contactHref, "View Builder", styles.ctaPrimary)
          ) : (
            <button type="button" className={styles.ctaPrimary} disabled>
              View Builder
            </button>
          )}
          <SaveHomeButton listingId={listing.id} />
        </div>
      </div>
    </div>
  );
}

