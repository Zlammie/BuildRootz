import type { PublicCommunity, PublicHome } from "../types/public";

type AddressObject = {
  line1?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postalCode?: string | null;
};

type ListingLike = Partial<PublicHome> & {
  displayAddress?: string | null;
  address?: string | AddressObject | null;
  photos?: Array<string | { url?: string | null } | null> | null;
  elevationPhoto?: string | null;
  elevationImage?: string | null;
  status?: string | null;
};

type BuilderLike = {
  builderName?: string | null;
  logoUrl?: string | null;
};

type CommunityLike = Pick<Partial<PublicCommunity>, "name" | "mapImage" | "slug"> & {
  heroImage?: string | null;
  heroImageUrl?: string | null;
};

export type ListingSpecPill = {
  key: "beds" | "baths" | "sqft";
  label: string;
};

export type ListingImage = {
  url: string;
  alt: string;
  isPlaceholder: boolean;
};

export type ListingStatusBadge = {
  text: "Available" | "Quick Move-In" | "Under Construction" | "Sold" | "Coming Soon";
  variant: "available" | "inventory" | "construction" | "sold" | "comingSoon";
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const PLACEHOLDER_IMAGE_URL =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23ebe5da'/%3E%3Cstop offset='1' stop-color='%23d8cbb8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23g)'/%3E%3Cpath d='M180 560l170-170 120 120 160-200 170 190 110-110 190 170v80H180z' fill='%23c8baa5' opacity='.85'/%3E%3Ctext x='600' y='420' text-anchor='middle' fill='%23645845' font-family='Arial, sans-serif' font-size='42'%3EHome image coming soon%3C/text%3E%3C/svg%3E";

function cleanSegment(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim().replace(/^,+|,+$/g, "");
}

function normalizedText(value: unknown): string | null {
  const cleaned = cleanSegment(value);
  return cleaned || null;
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeAddressString(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,+/g, ",")
    .replace(/(^,\s*|\s*,\s*$)/g, "")
    .trim();
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? integerFormatter.format(value) : numberFormatter.format(value);
}

function addressLineFromHome(home?: ListingLike | null): string | null {
  if (!home) return null;
  if (typeof home.address === "string") {
    const line = normalizedText(home.address);
    if (line) return line;
  }

  if (!home.address || typeof home.address !== "object") {
    return null;
  }

  const address = home.address as AddressObject;
  return normalizedText(address.line1) || normalizedText(address.street);
}

function cityFromHome(home?: ListingLike | null): string | null {
  if (!home) return null;
  if (typeof home.city === "string" && home.city.trim()) {
    return cleanSegment(home.city);
  }
  if (home.address && typeof home.address === "object") {
    return normalizedText((home.address as AddressObject).city);
  }
  return null;
}

function stateFromHome(home?: ListingLike | null): string | null {
  if (!home) return null;
  if (typeof home.state === "string" && home.state.trim()) {
    return cleanSegment(home.state);
  }
  if (home.address && typeof home.address === "object") {
    return normalizedText((home.address as AddressObject).state);
  }
  return null;
}

function postalCodeFromHome(home?: ListingLike | null): string | null {
  if (!home) return null;
  if (typeof home.postalCode === "string" && home.postalCode.trim()) {
    return cleanSegment(home.postalCode);
  }
  if (home.address && typeof home.address === "object") {
    const address = home.address as AddressObject;
    return normalizedText(address.zip) || normalizedText(address.postalCode);
  }
  return null;
}

function imageUrlFromPhoto(value: unknown): string | null {
  if (typeof value === "string") return cleanUrl(value);
  if (value && typeof value === "object") {
    return cleanUrl((value as { url?: unknown }).url);
  }
  return null;
}

function firstImage(values: unknown[]): string | null {
  for (const value of values) {
    const url = imageUrlFromPhoto(value);
    if (url) return url;
  }
  return null;
}

function imageAlt(home?: ListingLike | null): string {
  const title = normalizedText(home?.title);
  const address = formatAddress(home);
  if (title && address !== "Address coming soon") {
    return `${title} at ${address}`;
  }
  if (title) {
    return title;
  }
  if (address !== "Address coming soon") {
    return address;
  }
  return "Home image";
}

export function formatAddress(home?: ListingLike | null): string {
  const preferred = normalizedText(home?.displayAddress);
  if (preferred) {
    return normalizeAddressString(preferred);
  }

  const line1 = addressLineFromHome(home);
  const city = cityFromHome(home);
  const state = stateFromHome(home);
  const postalCode = postalCodeFromHome(home);
  const region = [state, postalCode].filter(Boolean).join(" ");
  const full = [line1, city, region].filter(Boolean).join(", ");
  const normalized = normalizeAddressString(full);
  return normalized || "Address coming soon";
}

export function formatPrice(home?: Pick<ListingLike, "price"> | null): {
  label: string;
  value?: number;
  isFallback: boolean;
} {
  const value = toPositiveNumber(home?.price);
  if (!value) {
    return {
      label: "Contact for price",
      isFallback: true,
    };
  }

  return {
    label: currencyFormatter.format(value),
    value,
    isFallback: false,
  };
}

export function getSpecPills(home?: ListingLike | null): ListingSpecPill[] {
  const pills: ListingSpecPill[] = [];
  const beds = toPositiveNumber(home?.beds);
  const baths = toPositiveNumber(home?.baths);
  const sqft = toPositiveNumber(home?.sqft);

  if (beds) {
    pills.push({ key: "beds", label: `${formatCount(beds)} bd` });
  }
  if (baths) {
    pills.push({ key: "baths", label: `${formatCount(baths)} ba` });
  }
  if (sqft) {
    pills.push({ key: "sqft", label: `${integerFormatter.format(Math.round(sqft))} sqft` });
  }

  return pills;
}

export function getPrimaryImage(
  home?: ListingLike | null,
  builder?: BuilderLike | null,
  community?: CommunityLike | null,
): ListingImage {
  const primaryAlt = imageAlt(home);
  const directHero = cleanUrl(home?.heroImage);
  if (directHero) {
    return { url: directHero, alt: primaryAlt, isPlaceholder: false };
  }

  const photos = Array.isArray(home?.photos) ? firstImage(home?.photos ?? []) : null;
  if (photos) {
    return { url: photos, alt: primaryAlt, isPlaceholder: false };
  }

  const imageSets = [
    firstImage(home?.heroImages ?? []),
    firstImage(home?.images ?? []),
    cleanUrl(home?.elevationPhoto),
    cleanUrl(home?.elevationImage),
    cleanUrl(home?.floorPlanImage),
  ];
  const firstHomeImage = imageSets.find(Boolean);
  if (firstHomeImage) {
    return { url: firstHomeImage, alt: primaryAlt, isPlaceholder: false };
  }

  const builderLogo = cleanUrl(builder?.logoUrl);
  if (builderLogo) {
    const builderName = normalizedText(builder?.builderName) || "Builder";
    return {
      url: builderLogo,
      alt: `${builderName} logo`,
      isPlaceholder: false,
    };
  }

  const communityHero =
    cleanUrl(community?.heroImage) ||
    cleanUrl(community?.heroImageUrl) ||
    cleanUrl(community?.mapImage);
  if (communityHero) {
    const communityName = normalizedText(community?.name) || "Community";
    return {
      url: communityHero,
      alt: `${communityName} image`,
      isPlaceholder: false,
    };
  }

  return {
    url: PLACEHOLDER_IMAGE_URL,
    alt: "Home image coming soon",
    isPlaceholder: true,
  };
}

export function getStatusBadge(home?: Pick<ListingLike, "status"> | null): ListingStatusBadge {
  const raw = cleanSegment(home?.status).toLowerCase();
  if (raw.includes("sold")) {
    return { text: "Sold", variant: "sold" };
  }
  if (
    raw.includes("construction") ||
    raw.includes("under construction") ||
    raw.includes("under_construction") ||
    raw.includes("under-construction") ||
    raw.includes("build")
  ) {
    return { text: "Under Construction", variant: "construction" };
  }
  if (
    raw.includes("inventory") ||
    raw.includes("spec") ||
    raw.includes("quick move") ||
    raw === "inventory"
  ) {
    return { text: "Quick Move-In", variant: "inventory" };
  }
  if (raw.includes("coming")) {
    return { text: "Coming Soon", variant: "comingSoon" };
  }
  return { text: "Available", variant: "available" };
}

export function safeLink(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || trimmed === "#") {
    return null;
  }
  return trimmed;
}

export function hasValidCoordinates(home?: Pick<ListingLike, "lat" | "lng"> | null): boolean {
  return (
    typeof home?.lat === "number" &&
    Number.isFinite(home.lat) &&
    typeof home?.lng === "number" &&
    Number.isFinite(home.lng) &&
    home.lat >= -90 &&
    home.lat <= 90 &&
    home.lng >= -180 &&
    home.lng <= 180 &&
    !(Math.abs(home.lat) < 0.000001 && Math.abs(home.lng) < 0.000001)
  );
}
