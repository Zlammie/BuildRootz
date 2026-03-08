import type { Metadata } from "next";
import { headers } from "next/headers";

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
]);

export const DEFAULT_SITE_NAME = "BuildRootz";
export const DEFAULT_TWITTER_CARD = "summary_large_image";
export type AppSearchParams = Record<string, string | string[] | undefined>;

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "http://localhost:3002";
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

export function getConfiguredSiteOrigin(): string {
  const configuredBase =
    process.env.BUILDROOTZ_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "";
  return normalizeOrigin(configuredBase);
}

export async function getSiteOrigin(): Promise<string> {
  const configured = getConfiguredSiteOrigin();
  if (configured !== "http://localhost:3002") {
    return configured;
  }

  try {
    const incomingHeaders = await headers();
    const host =
      incomingHeaders.get("x-forwarded-host") ||
      incomingHeaders.get("host") ||
      "";
    if (host) {
      const proto =
        incomingHeaders.get("x-forwarded-proto") ||
        (host.includes("localhost") ? "http" : "https");
      return normalizeOrigin(`${proto}://${host}`);
    }
  } catch {
    // Ignore header lookup failures outside a request context.
  }

  return configured;
}

export function isTrackingParam(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (TRACKING_PARAM_NAMES.has(normalized)) return true;
  return TRACKING_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function sanitizeCanonicalPath(
  pathname: string,
  searchParams?: URLSearchParams,
  allowedParams: string[] = [],
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!searchParams) {
    return normalizedPath;
  }

  const allowed = new Set(allowedParams.map((param) => param.trim()).filter(Boolean));
  const sanitized = new URLSearchParams();

  searchParams.forEach((value, key) => {
    if (!allowed.has(key) || isTrackingParam(key)) {
      return;
    }
    if (!value.trim()) {
      return;
    }
    sanitized.set(key, value);
  });

  const query = sanitized.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

export function toAbsoluteUrl(path: string, origin: string): string {
  if (!path) {
    return origin;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return path;
  }
  return new URL(path.startsWith("/") ? path : `/${path}`, origin).toString();
}

export async function buildAbsoluteUrl(path: string): Promise<string> {
  return toAbsoluteUrl(path, await getSiteOrigin());
}

export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (normalized === "undefined" || normalized === "null") {
    return null;
  }
  return trimmed;
}

export function getSearchParamValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cleaned = cleanText(item);
      if (cleaned) return cleaned;
    }
    return null;
  }
  return cleanText(value);
}

export function hasAnySearchParam(searchParams?: AppSearchParams | null): boolean {
  if (!searchParams) return false;
  return Object.values(searchParams).some((value) => Boolean(getSearchParamValue(value)));
}

export function buildRobotsMeta({
  index,
  follow,
}: {
  index: boolean;
  follow: boolean;
}): NonNullable<Metadata["robots"]> {
  return {
    index,
    follow,
  };
}
