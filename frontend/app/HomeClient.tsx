"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NavBar from "../components/NavBar";
import ListingCard from "../components/ListingCard";
import { useAuth } from "../components/AuthProvider";
import { resolveBuilderParam } from "../lib/builder";
import { hasValidCoordinates } from "../lib/listingFormatters";
import { autoNameFromFilters } from "../lib/searchSummary";
import {
  fetchBuilderProfilesByCompanyIds,
  fetchPublicCommunitiesByIds,
  type BuilderProfileSummary,
  type PublicCommunitySummary,
} from "../lib/publicIdentityLookup";
import ListingsMap, {
  type BoundsChangeSource,
  type LayerMode,
  type MapBounds,
  type CommunityMapPoint,
} from "./listings/ListingsMap";
import styles from "./page.module.css";
import type { PublicHome } from "../types/public";

type Props = {
  initialHomes: PublicHome[];
  dataError?: string;
};

type ListingsApiResult = {
  _id: string;
  id?: string;
  publicCommunityId?: string | null;
  companyId?: string | null;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  address1?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  status?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lat?: number | null;
  lng?: number | null;
  primaryPhotoUrl?: string | null;
  photosPreview?: string[];
  planCatalogId?: string | null;
  keepupFloorPlanId?: string | null;
  title?: string | null;
  builder?: string | null;
  builderSlug?: string | null;
  keepupBuilderId?: string | null;
  updatedAt?: string | null;
};

type ListingsApiIncludes = {
  communitiesById?: Record<
    string,
    {
      _id: string;
      slug?: string;
      name?: string;
      city?: string;
      state?: string;
      heroImageUrl?: string | null;
      imageUrlsPreview?: string[];
      photosPreview?: string[];
      highlights?: string[];
    }
  >;
  buildersByCompanyId?: Record<
    string,
    {
      companyId: string;
      name?: string;
      slug?: string;
      logoUrl?: string;
    }
  >;
};

type ListingsApiResponse = {
  results?: ListingsApiResult[];
  includes?: ListingsApiIncludes;
  warnings?: string[];
};

type SortKey = "default" | "price-asc" | "price-desc" | "sqft-asc" | "sqft-desc";
type MoveIn = "all" | "ready" | "1-2" | "3-6";
type FilterKey = "price" | "bedbath" | "movein" | null;
type ViewMode = "split" | "list" | "map";

const VIEW_MODE_STORAGE_KEY = "brz:viewMode";
const MAP_LAYER_STORAGE_KEY = "brz:mapLayerMode";
const MAP_BOUNDS_EPSILON = 0.0008;

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function parseNumberParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerParam(value: string | null, fallback: number, min = 1, max = 500): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeSortKeyFromQuery(value: string | null): SortKey {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "price_asc") return "price-asc";
  if (normalized === "price_desc") return "price-desc";
  return "default";
}

function normalizeViewMode(value: string | null | undefined): ViewMode | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "split" || normalized === "list" || normalized === "map") {
    return normalized;
  }
  return null;
}

function normalizeLayerMode(value: string | null | undefined): LayerMode | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "community" || normalized === "community+inventory") {
    return normalized;
  }
  return null;
}

function parseBoundsParam(value: string | null): MapBounds | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (parts.length !== 4) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function formatBoundsParam(bounds: MapBounds | null): string {
  if (!bounds) return "";
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
    .map((value) => value.toFixed(6))
    .join(",");
}

function areBoundsMeaningfullyDifferent(left: MapBounds | null, right: MapBounds | null): boolean {
  if (!left || !right) return left !== right;
  return (
    Math.abs(left.minLng - right.minLng) > MAP_BOUNDS_EPSILON ||
    Math.abs(left.minLat - right.minLat) > MAP_BOUNDS_EPSILON ||
    Math.abs(left.maxLng - right.maxLng) > MAP_BOUNDS_EPSILON ||
    Math.abs(left.maxLat - right.maxLat) > MAP_BOUNDS_EPSILON
  );
}

function mapApiHomeToPublicHome(row: ListingsApiResult): PublicHome {
  const line1 = row.address?.line1 || row.address1 || "";
  const city = row.address?.city || row.city || undefined;
  const state = row.address?.state || row.state || undefined;
  const zip = row.address?.zip || row.postalCode || undefined;
  const photosPreview = Array.isArray(row.photosPreview)
    ? row.photosPreview.filter(Boolean)
    : [];
  const heroImage = row.primaryPhotoUrl || photosPreview[0] || undefined;

  const statusRaw = (row.status || "").toLowerCase();
  const normalizedStatus: PublicHome["status"] = statusRaw.includes("model")
    ? "model"
    : statusRaw.includes("coming")
      ? "comingSoon"
      : statusRaw.includes("inventory") || statusRaw.includes("spec")
        ? "inventory"
        : statusRaw
          ? "available"
          : "unknown";

  return {
    id: row.id || row._id,
    title: row.title || line1 || "Untitled home",
    keepupBuilderId: row.keepupBuilderId || (row.companyId || undefined),
    price: typeof row.price === "number" ? row.price : null,
    address: line1 || undefined,
    address1: line1 || undefined,
    formattedAddress: row.formattedAddress || undefined,
    city,
    state,
    postalCode: zip,
    beds: typeof row.beds === "number" ? row.beds : null,
    baths: typeof row.baths === "number" ? row.baths : null,
    sqft: typeof row.sqft === "number" ? row.sqft : null,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    status: normalizedStatus,
    publicCommunityId: row.publicCommunityId || undefined,
    keepupFloorPlanId: row.keepupFloorPlanId || undefined,
    planCatalogId: row.planCatalogId || undefined,
    heroImage,
    heroImages: photosPreview.length ? photosPreview : undefined,
    images: photosPreview.length ? photosPreview : undefined,
    builder: row.builder || undefined,
    builderSlug: row.builderSlug || undefined,
  };
}

function normalizeBuilderIncludes(
  buildersByCompanyId?: ListingsApiIncludes["buildersByCompanyId"],
): Record<string, BuilderProfileSummary> {
  const out: Record<string, BuilderProfileSummary> = {};
  Object.entries(buildersByCompanyId || {}).forEach(([key, value]) => {
    const companyId = (value?.companyId || key || "").trim().toLowerCase();
    if (!companyId) return;
    out[companyId] = {
      companyId,
      builderName: value?.name,
      builderSlug: value?.slug,
      logoUrl: value?.logoUrl,
    };
  });
  return out;
}

function normalizeCommunityIncludes(
  communitiesById?: ListingsApiIncludes["communitiesById"],
): Record<string, PublicCommunitySummary> {
  const out: Record<string, PublicCommunitySummary> = {};
  Object.entries(communitiesById || {}).forEach(([key, value]) => {
    const communityId = (value?._id || key || "").trim().toLowerCase();
    if (!communityId) return;
    out[communityId] = {
      publicCommunityId: communityId,
      name: value?.name,
      slug: value?.slug,
      city: value?.city,
      state: value?.state,
      heroImageUrl: value?.heroImageUrl || undefined,
      imageUrlsPreview: Array.isArray(value?.imageUrlsPreview)
        ? value.imageUrlsPreview
        : undefined,
      photosPreview: Array.isArray(value?.photosPreview) ? value.photosPreview : undefined,
      highlights: Array.isArray(value?.highlights) ? value.highlights : undefined,
    };
  });
  return out;
}

export default function HomeClient({ initialHomes, dataError }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const routeFilters = useMemo(
    () => ({
      q: searchParams.get("q")?.trim() || "",
      publicCommunityId: searchParams.get("publicCommunityId")?.trim() || "",
      communitySlug: searchParams.get("communitySlug")?.trim() || "",
      companyId: searchParams.get("companyId")?.trim() || "",
      builderId: searchParams.get("builderId")?.trim() || "",
      keepupFloorPlanId: searchParams.get("keepupFloorPlanId")?.trim() || "",
      planCatalogId: searchParams.get("planCatalogId")?.trim() || "",
      status: searchParams.get("status")?.trim() || "",
      minPrice: parseNumberParam(searchParams.get("minPrice")),
      maxPrice: parseNumberParam(searchParams.get("maxPrice")),
      bedsMin: parseNumberParam(searchParams.get("bedsMin")),
      bathsMin: parseNumberParam(searchParams.get("bathsMin")),
      minSqft: parseNumberParam(searchParams.get("minSqft")),
      maxSqft: parseNumberParam(searchParams.get("maxSqft")),
      bounds: parseBoundsParam(searchParams.get("bounds")),
      sort: searchParams.get("sort")?.trim() || "",
      page: parseIntegerParam(searchParams.get("page"), 1, 1, 500),
      pageSize: parseIntegerParam(searchParams.get("pageSize"), 24, 1, 120),
    }),
    [searchParams],
  );
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [priceMin, setPriceMin] = useState(300000);
  const [priceMax, setPriceMax] = useState(1500000);
  const [beds, setBeds] = useState("Any");
  const [baths, setBaths] = useState("Any");
  const [moveIn, setMoveIn] = useState<MoveIn>("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<FilterKey>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [homes, setHomes] = useState<PublicHome[]>(initialHomes ?? []);
  const [builderMap, setBuilderMap] = useState<Record<string, BuilderProfileSummary>>({});
  const [communityMap, setCommunityMap] = useState<Record<string, PublicCommunitySummary>>({});
  const [homesLoading, setHomesLoading] = useState(false);
  const [homesError, setHomesError] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [viewModeReady, setViewModeReady] = useState(false);
  const [layerMode, setLayerMode] = useState<LayerMode>("community+inventory");
  const [layerModeReady, setLayerModeReady] = useState(false);
  const [communityPoints, setCommunityPoints] = useState<CommunityMapPoint[]>([]);
  const [communityPointsReady, setCommunityPointsReady] = useState(false);
  const [hoveredHomeId, setHoveredHomeId] = useState<string | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<MapBounds | null>(routeFilters.bounds);
  const [mapViewportBounds, setMapViewportBounds] = useState<MapBounds | null>(routeFilters.bounds);
  const [mapReferenceBounds, setMapReferenceBounds] = useState<MapBounds | null>(routeFilters.bounds);
  const [hasUnappliedMapMove, setHasUnappliedMapMove] = useState(false);
  const {
    saveSearch,
    authError,
  } = useAuth();
  const [saveSearchStatus, setSaveSearchStatus] = useState<string | null>(null);
  const [saveSearchError, setSaveSearchError] = useState<string | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);

  useEffect(() => {
    setSearchDraft(routeFilters.q);
    setSearchQuery(routeFilters.q);
    setPriceMin(
      typeof routeFilters.minPrice === "number"
        ? Math.max(300000, Math.min(routeFilters.minPrice, 1500000))
        : 300000,
    );
    setPriceMax(
      typeof routeFilters.maxPrice === "number"
        ? Math.max(300000, Math.min(routeFilters.maxPrice, 1500000))
        : 1500000,
    );
    setBeds(
      typeof routeFilters.bedsMin === "number" && routeFilters.bedsMin >= 1
        ? `${Math.floor(routeFilters.bedsMin)}+`
        : "Any",
    );
    setBaths(
      typeof routeFilters.bathsMin === "number" && routeFilters.bathsMin >= 1
        ? `${Math.floor(routeFilters.bathsMin)}+`
        : "Any",
    );
    setSortKey(normalizeSortKeyFromQuery(routeFilters.sort));
    setUrlReady(true);
  }, [
    routeFilters.bathsMin,
    routeFilters.bedsMin,
    routeFilters.maxPrice,
    routeFilters.minPrice,
    routeFilters.q,
    routeFilters.sort,
  ]);

  useEffect(() => {
    setHomes(initialHomes ?? []);
  }, [initialHomes]);

  useEffect(() => {
    const fromQuery = normalizeViewMode(searchParams.get("view"));
    if (fromQuery) {
      setViewMode(fromQuery);
      setViewModeReady(true);
      return;
    }

    if (typeof window !== "undefined") {
      const fromStorage = normalizeViewMode(
        window.localStorage.getItem(VIEW_MODE_STORAGE_KEY),
      );
      if (fromStorage) {
        setViewMode(fromStorage);
      } else {
        setViewMode("split");
      }
    } else {
      setViewMode("split");
    }
    setViewModeReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!viewModeReady || typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextParams.get("view") === viewMode) return;
    nextParams.set("view", viewMode);
    const query = nextParams.toString();
    window.history.replaceState({}, "", query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams, viewMode, viewModeReady]);

  useEffect(() => {
    const fromQuery = normalizeLayerMode(searchParams.get("layer"));
    if (fromQuery) {
      setLayerMode(fromQuery);
      setLayerModeReady(true);
      return;
    }

    if (typeof window !== "undefined") {
      const fromStorage = normalizeLayerMode(
        window.localStorage.getItem(MAP_LAYER_STORAGE_KEY),
      );
      if (fromStorage) {
        setLayerMode(fromStorage);
      } else {
        setLayerMode("community+inventory");
      }
    } else {
      setLayerMode("community+inventory");
    }
    setLayerModeReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!layerModeReady || typeof window === "undefined") return;
    window.localStorage.setItem(MAP_LAYER_STORAGE_KEY, layerMode);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextParams.get("layer") === layerMode) return;
    nextParams.set("layer", layerMode);
    const query = nextParams.toString();
    window.history.replaceState({}, "", query ? `${pathname}?${query}` : pathname);
  }, [layerMode, layerModeReady, pathname, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCommunityPoints = async () => {
      try {
        const response = await fetch("/api/public/communities/map-points", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { points?: CommunityMapPoint[] };
        if (!controller.signal.aborted && Array.isArray(payload.points)) {
          setCommunityPoints(payload.points);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCommunityPoints([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCommunityPointsReady(true);
        }
      }
    };
    void loadCommunityPoints();
    return () => controller.abort();
  }, []);

  const routeBoundsKey = useMemo(() => formatBoundsParam(routeFilters.bounds), [routeFilters.bounds]);

  useEffect(() => {
    const nextBounds = parseBoundsParam(routeBoundsKey || null);
    setAppliedBounds(nextBounds);
    setMapViewportBounds(nextBounds);
    setMapReferenceBounds(nextBounds);
    setHasUnappliedMapMove(false);
  }, [routeBoundsKey]);

  const replaceBoundsInUrl = useCallback(
    (nextBounds: MapBounds | null) => {
      if (typeof window === "undefined") return;
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextBounds) {
        nextParams.set("bounds", formatBoundsParam(nextBounds));
      } else {
        nextParams.delete("bounds");
      }
      const query = nextParams.toString();
      window.history.replaceState({}, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams],
  );

  const handleMapViewportBoundsChange = useCallback(
    (nextBounds: MapBounds, source: BoundsChangeSource) => {
      setMapViewportBounds(nextBounds);

      const baselineBounds = appliedBounds || mapReferenceBounds;
      if (!baselineBounds) {
        if (source === "programmatic") {
          setMapReferenceBounds(nextBounds);
          setHasUnappliedMapMove(false);
        } else {
          setHasUnappliedMapMove(true);
        }
        return;
      }

      const isDifferent = areBoundsMeaningfullyDifferent(nextBounds, baselineBounds);
      if (source === "user") {
        setHasUnappliedMapMove(isDifferent);
      } else if (!isDifferent) {
        setHasUnappliedMapMove(false);
      }
    },
    [appliedBounds, mapReferenceBounds],
  );

  const handleSearchThisArea = useCallback(() => {
    if (!mapViewportBounds) return;
    setAppliedBounds(mapViewportBounds);
    setMapReferenceBounds(mapViewportBounds);
    setHasUnappliedMapMove(false);
    replaceBoundsInUrl(mapViewportBounds);
  }, [mapViewportBounds, replaceBoundsInUrl]);

  const effectivePaging = useMemo(
    () => ({
      page: routeFilters.page || 1,
      pageSize: routeFilters.pageSize || 24,
    }),
    [routeFilters.page, routeFilters.pageSize],
  );

  useEffect(() => {
    if (!urlReady) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setHomesLoading(true);
      setHomesError(null);
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (routeFilters.publicCommunityId) params.set("publicCommunityId", routeFilters.publicCommunityId);
        if (routeFilters.communitySlug) params.set("communitySlug", routeFilters.communitySlug);
        if (routeFilters.companyId) params.set("companyId", routeFilters.companyId);
        if (routeFilters.builderId) params.set("builderId", routeFilters.builderId);
        if (routeFilters.keepupFloorPlanId) params.set("keepupFloorPlanId", routeFilters.keepupFloorPlanId);
        if (routeFilters.planCatalogId) params.set("planCatalogId", routeFilters.planCatalogId);
        if (routeFilters.status) params.set("status", routeFilters.status);

        if (priceMin > 300000) params.set("minPrice", String(priceMin));
        if (priceMax < 1500000) params.set("maxPrice", String(priceMax));
        if (beds !== "Any") params.set("bedsMin", beds.replace("+", ""));
        if (baths !== "Any") params.set("bathsMin", baths.replace("+", ""));
        if (typeof routeFilters.minSqft === "number" && routeFilters.minSqft > 0) {
          params.set("minSqft", String(routeFilters.minSqft));
        }
        if (typeof routeFilters.maxSqft === "number" && routeFilters.maxSqft > 0) {
          params.set("maxSqft", String(routeFilters.maxSqft));
        }
        if (appliedBounds) {
          params.set("bounds", formatBoundsParam(appliedBounds));
        }

        const apiSort =
          sortKey === "price-asc"
            ? "price_asc"
            : sortKey === "price-desc"
              ? "price_desc"
              : "newest";
        params.set("sort", apiSort);
        params.set("page", String(effectivePaging.page));
        params.set("pageSize", String(effectivePaging.pageSize));
        params.set("includeIdentity", "1");

        const res = await fetch(`/api/public/homes?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Unable to load listings.");
        }
        const data = (await res.json()) as ListingsApiResponse;
        const results = Array.isArray(data.results) ? (data.results as ListingsApiResult[]) : [];
        const mappedHomes = results.map((row) => mapApiHomeToPublicHome(row));
        setHomes(mappedHomes);

        const includedBuilders = normalizeBuilderIncludes(data.includes?.buildersByCompanyId);
        const includedCommunities = normalizeCommunityIncludes(data.includes?.communitiesById);

        if (!controller.signal.aborted) {
          if (Object.keys(includedBuilders).length) {
            setBuilderMap((prev) => ({ ...prev, ...includedBuilders }));
          }
          if (Object.keys(includedCommunities).length) {
            setCommunityMap((prev) => ({ ...prev, ...includedCommunities }));
          }
        }

        const companyIds = Array.from(
          new Set(
            results
              .map((row) => (typeof row.companyId === "string" ? row.companyId.trim().toLowerCase() : ""))
              .filter(Boolean),
          ),
        );
        const missingCompanyIds = companyIds.filter((id) => !includedBuilders[id]);
        const communityIds = Array.from(
          new Set(
            results
              .map((row) =>
                typeof row.publicCommunityId === "string"
                  ? row.publicCommunityId.trim().toLowerCase()
                  : "",
              )
              .filter(Boolean),
          ),
        );
        const missingCommunityIds = communityIds.filter((id) => !includedCommunities[id]);

        if (missingCompanyIds.length || missingCommunityIds.length) {
          const [builderLookup, communityLookup] = await Promise.all([
            missingCompanyIds.length
              ? fetchBuilderProfilesByCompanyIds(missingCompanyIds)
              : Promise.resolve({}),
            missingCommunityIds.length
              ? fetchPublicCommunitiesByIds(missingCommunityIds)
              : Promise.resolve({}),
          ]);
          if (!controller.signal.aborted) {
            setBuilderMap((prev) => ({ ...prev, ...builderLookup }));
            setCommunityMap((prev) => ({ ...prev, ...communityLookup }));
          }
        }

        if (
          process.env.NODE_ENV !== "production" &&
          Array.isArray(data.warnings) &&
          data.warnings.includes("LEGACY_FALLBACK_USED")
        ) {
          console.warn("[listings] LEGACY_FALLBACK_USED");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unable to load listings.";
        setHomesError(message);
      } finally {
        if (!controller.signal.aborted) setHomesLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    appliedBounds,
    baths,
    beds,
    priceMax,
    priceMin,
    routeFilters.builderId,
    routeFilters.communitySlug,
    routeFilters.companyId,
    routeFilters.keepupFloorPlanId,
    routeFilters.planCatalogId,
    routeFilters.maxSqft,
    routeFilters.minSqft,
    routeFilters.publicCommunityId,
    routeFilters.status,
    effectivePaging.page,
    effectivePaging.pageSize,
    searchQuery,
    sortKey,
    urlReady,
  ]);

  const listings = useMemo(() => homes ?? [], [homes]);

  const sortedListings = useMemo(() => {
    const list = [...listings];
    switch (sortKey) {
      case "price-asc":
        return list.sort(
          (a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER),
        );
      case "price-desc":
        return list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "sqft-asc":
        return list.sort(
          (a, b) => (a.sqft ?? Number.MAX_SAFE_INTEGER) - (b.sqft ?? Number.MAX_SAFE_INTEGER),
        );
      case "sqft-desc":
        return list.sort((a, b) => (b.sqft ?? 0) - (a.sqft ?? 0));
      case "default":
      default:
        return list;
    }
  }, [listings, sortKey]);

  const priceTrackStyle = useMemo(() => {
    const PRICE_MIN = 300000;
    const PRICE_MAX = 1500000;
    const PRICE_RANGE = PRICE_MAX - PRICE_MIN;
    const minPct = ((priceMin - PRICE_MIN) / PRICE_RANGE) * 100;
    const maxPct = ((priceMax - PRICE_MIN) / PRICE_RANGE) * 100;
    return {
      background: `linear-gradient(90deg, #e2ddd5 ${minPct}%, var(--rootz-green-soft) ${minPct}%, var(--rootz-green-soft) ${maxPct}%, #e2ddd5 ${maxPct}%)`,
    };
  }, [priceMin, priceMax]);

  const currentFilters = useMemo(
    () => ({
      priceMin,
      priceMax,
      beds,
      baths,
      moveIn,
      sortKey,
    }),
    [priceMin, priceMax, beds, baths, moveIn, sortKey],
  );

  const handleSaveSearch = async () => {
    setSaveSearchStatus(null);
    setSaveSearchError(null);
    const suggestedName = autoNameFromFilters(currentFilters);
    let name = suggestedName;
    if (typeof window !== "undefined") {
      const input = window.prompt("Name this search (optional):", suggestedName);
      if (input && input.trim()) {
        name = input.trim();
      }
    }
    try {
      setSavingSearch(true);
      await saveSearch(name, currentFilters);
      setSaveSearchStatus("Search saved. Manage alerts in your account.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save search.";
      setSaveSearchError(msg);
    } finally {
      setSavingSearch(false);
    }
  };

  const mapCounts = useMemo(() => {
    const mappable = sortedListings.filter((home) => hasValidCoordinates(home)).length;
    return {
      mappable,
      missing: sortedListings.length - mappable,
    };
  }, [sortedListings]);

  useEffect(() => {
    if (!hoveredHomeId) return;
    if (!sortedListings.some((home) => home.id === hoveredHomeId)) {
      setHoveredHomeId(null);
    }
  }, [hoveredHomeId, sortedListings]);

  return (
    <div className={styles.page}>
      <NavBar />

      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.heroTitle}>
              Find new homes from builders, mapped in real time.
            </h1>
            <p className={styles.subhead}>
              Explore inventory, coming soon releases, and featured homes across your market. The
              map and the list stay in sync - tap a pin or card to see more detail.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.primary} href="/account">
              Get alerts
            </Link>
            <button
              className={styles.secondary}
              type="button"
              onClick={handleSaveSearch}
              disabled={savingSearch}
            >
              {savingSearch ? "Saving..." : "Save search"}
            </button>
          </div>
        </header>
        {(saveSearchStatus || saveSearchError || authError) && (
          <div className={styles.dataNotice} role="status">
            {saveSearchStatus || saveSearchError || authError}
          </div>
        )}

        {(dataError || homesError) && (
          <div className={styles.dataError} role="status">
            <strong>Heads up:</strong> Could not load published homes from MongoDB. Check your
            BUILDROOTZ_MONGODB_URI / BUILDROOTZ_DB_NAME settings and restart the app. Error:
            {` ${homesError || dataError}`}
          </div>
        )}

        <section className={styles.shell}>
          <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <span className={styles.dotAvailable} />
                <span>Available</span>
                <span className={styles.dotInventory} />
                <span>Quick Move-In</span>
                <span className={styles.dotComing} />
                <span>Coming soon</span>
                <span className={styles.dotModel} />
                <span>Model</span>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.filterToggles}>
                <button
                  type="button"
                  className={`${styles.filterBtn} ${
                    openFilter === "price" ? styles.filterBtnActive : ""
                  }`}
                  onClick={() => setOpenFilter(openFilter === "price" ? null : "price")}
                >
                  Price
                </button>
                <button
                  type="button"
                  className={`${styles.filterBtn} ${
                    openFilter === "bedbath" ? styles.filterBtnActive : ""
                  }`}
                  onClick={() => setOpenFilter(openFilter === "bedbath" ? null : "bedbath")}
                >
                  Beds / Baths
                </button>
                <button
                  type="button"
                  className={`${styles.filterBtn} ${
                    openFilter === "movein" ? styles.filterBtnActive : ""
                  }`}
                  onClick={() => setOpenFilter(openFilter === "movein" ? null : "movein")}
                >
                  Move-in
                </button>
                <button type="button" className={styles.filterBtn} onClick={() => setMoreOpen(true)}>
                  More
                </button>
              </div>
              <label className={styles.sortLabel}>
                <span className={styles.visuallyHidden}>Sort by</span>
                <select
                  className={styles.sortSelect}
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="default">Default</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="sqft-asc">Sqft: Low to High</option>
                  <option value="sqft-desc">Sqft: High to Low</option>
                </select>
              </label>
              <div className={styles.viewModeToggle} role="group" aria-label="Results view">
                <button
                  type="button"
                  className={`${styles.viewModeBtn} ${viewMode === "split" ? styles.viewModeBtnActive : ""}`}
                  onClick={() => setViewMode("split")}
                  aria-pressed={viewMode === "split"}
                >
                  Split
                </button>
                <button
                  type="button"
                  className={`${styles.viewModeBtn} ${viewMode === "list" ? styles.viewModeBtnActive : ""}`}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`${styles.viewModeBtn} ${viewMode === "map" ? styles.viewModeBtnActive : ""}`}
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                >
                  Map
                </button>
              </div>
            </div>
          </div>

          {openFilter && (
            <div className={styles.filterPanel}>
              {openFilter === "price" && (
                <div className={styles.pricePanel}>
                  <div className={styles.filterPanelHeader}>
                    <span className={styles.filterLabel}>Price range</span>
                    <div className={styles.rangeValues}>
                      <span>{priceFormatter.format(priceMin)}</span>
                      <span>-</span>
                      <span>{priceFormatter.format(priceMax)}</span>
                    </div>
                  </div>
                  <div className={styles.dualRange}>
                    <div className={styles.rangeTrack} style={priceTrackStyle} />
                    <input
                      type="range"
                      min={300000}
                      max={1500000}
                      step={10000}
                      value={priceMin}
                      onChange={(e) => setPriceMin(Math.min(Number(e.target.value), priceMax - 10000))}
                    />
                    <input
                      type="range"
                      min={300000}
                      max={1500000}
                      step={10000}
                      value={priceMax}
                      onChange={(e) => setPriceMax(Math.max(Number(e.target.value), priceMin + 10000))}
                    />
                  </div>
                </div>
              )}

              {openFilter === "bedbath" && (
                <div className={styles.pillPanel}>
                  <div className={styles.bedBathRow}>
                    <div>
                      <div className={styles.filterLabel}>Beds</div>
                      <div className={styles.pills}>
                        {["Any", "1+", "2+", "3+", "4+", "5+"].map((val) => (
                          <button
                            key={`beds-${val}`}
                            type="button"
                            className={`${styles.pillBtn} ${beds === val ? styles.pillActive : ""}`}
                            onClick={() => setBeds(val)}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className={styles.filterLabel}>Baths</div>
                      <div className={styles.pills}>
                        {["Any", "1+", "2+", "3+", "4+", "5+"].map((val) => (
                          <button
                            key={`baths-${val}`}
                            type="button"
                            className={`${styles.pillBtn} ${baths === val ? styles.pillActive : ""}`}
                            onClick={() => setBaths(val)}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {openFilter === "movein" && (
                <div className={styles.moveInPanel}>
                  <span className={styles.filterLabel}>Move-in</span>
                  <select
                    className={styles.sortSelect}
                    value={moveIn}
                    onChange={(e) => setMoveIn(e.target.value as MoveIn)}
                  >
                    <option value="all">All</option>
                    <option value="ready">Ready to Move In</option>
                    <option value="1-2">1-2 Months</option>
                    <option value="3-6">3-6 Months</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className={styles.mapHeader}>
            <div className={styles.searchBox}>
              <label className={styles.visuallyHidden} htmlFor="search-area">
                Search area
              </label>
              <input
                id="search-area"
                type="search"
                className={styles.searchInput}
                placeholder="Search city, neighborhood, or zip"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setSearchQuery(searchDraft.trim());
                  }
                }}
              />
              <button
                type="button"
                className={styles.searchButton}
                onClick={() => setSearchQuery(searchDraft.trim())}
              >
                Search
              </button>
            </div>
            <button className={styles.ghost}>Change area</button>
          </div>

          {viewMode === "split" && (
            <div className={styles.split}>
              <div className={styles.mapPanel}>
                <div className={styles.mapModePanel}>
                  <p className={styles.mapModeMeta}>
                    Showing {mapCounts.mappable} homes on map ({mapCounts.missing} missing location)
                  </p>
                  <p className={styles.mapModeHint}>
                    Hover a pin or a card to preview details.
                  </p>
                  <ListingsMap
                    homes={sortedListings}
                    communityPoints={communityPoints}
                    communityPointsReady={communityPointsReady}
                    builderMap={builderMap}
                    communityMap={communityMap}
                    hoveredHomeId={hoveredHomeId}
                    onHoverHome={setHoveredHomeId}
                    appliedBounds={appliedBounds || mapReferenceBounds}
                    fitToHomesOnLoad={!appliedBounds && !mapReferenceBounds}
                    hasUnappliedMapMove={hasUnappliedMapMove}
                    searchingThisArea={homesLoading}
                    onViewportBoundsChange={handleMapViewportBoundsChange}
                    onSearchThisArea={handleSearchThisArea}
                    layerMode={layerMode}
                    onLayerModeChange={setLayerMode}
                  />
                </div>
              </div>

              <div className={styles.listPanel}>
                <div className={styles.listHeader}>
                  <div>
                    <p className={styles.listLabel}>Showing current page results</p>
                    <strong>{homesLoading ? "Loading..." : `${sortedListings.length} homes`}</strong>
                  </div>
                  <div className={styles.pills}>
                    <span className={styles.pill}>Single family</span>
                    <span className={styles.pill}>3-5 beds</span>
                    <span className={styles.pill}>Under $750k</span>
                  </div>
                </div>

                <div className={styles.listScrollRegion}>
                  <div className={`${styles.cards} ${styles.cardsSplit}`}>
                    {sortedListings.length === 0 && (
                      <div className={styles.emptyState}>
                        <p>No published homes found yet. Publish a home in KeepUP and refresh.</p>
                      </div>
                    )}
                    {sortedListings.map((home) => {
                      const companyId = (home.keepupBuilderId || "").trim().toLowerCase();
                      const communityId = (home.publicCommunityId || "").trim().toLowerCase();
                      const builderInfo = companyId ? builderMap[companyId] : undefined;
                      const communityInfo = communityId ? communityMap[communityId] : undefined;
                      return (
                        <ListingCard
                          key={home.id}
                          home={home}
                          builder={
                            builderInfo
                              ? {
                                  builderName: builderInfo.builderName,
                                  builderSlug:
                                    builderInfo.builderSlug ||
                                    resolveBuilderParam({
                                      builderSlug: builderInfo.builderSlug,
                                      keepupBuilderId: home.keepupBuilderId,
                                      builder: builderInfo.builderName || home.builder,
                                    }),
                                  logoUrl: builderInfo.logoUrl,
                                }
                              : null
                          }
                          community={
                            communityInfo
                              ? {
                                  name: communityInfo.name,
                                  slug: communityInfo.slug,
                                  city: communityInfo.city,
                                  state: communityInfo.state,
                                  mapImage:
                                    communityInfo.heroImageUrl ||
                                    communityInfo.imageUrlsPreview?.[0] ||
                                    communityInfo.photosPreview?.[0],
                                }
                              : null
                          }
                          variant="compact"
                          showSaveButton
                          isHighlighted={hoveredHomeId === home.id}
                          onMouseEnter={() => setHoveredHomeId(home.id)}
                          onMouseLeave={() =>
                            setHoveredHomeId((current) => (current === home.id ? null : current))
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "list" && (
            <div className={styles.listOnlyPanel}>
              <div className={styles.listHeader}>
                <div>
                  <p className={styles.listLabel}>Showing current page results</p>
                  <strong>{homesLoading ? "Loading..." : `${sortedListings.length} homes`}</strong>
                </div>
                <div className={styles.pills}>
                  <span className={styles.pill}>Single family</span>
                  <span className={styles.pill}>3-5 beds</span>
                  <span className={styles.pill}>Under $750k</span>
                </div>
              </div>

              <div className={`${styles.cards} ${styles.cardsList}`}>
                {sortedListings.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>No published homes found yet. Publish a home in KeepUP and refresh.</p>
                  </div>
                )}
                {sortedListings.map((home) => {
                  const companyId = (home.keepupBuilderId || "").trim().toLowerCase();
                  const communityId = (home.publicCommunityId || "").trim().toLowerCase();
                  const builderInfo = companyId ? builderMap[companyId] : undefined;
                  const communityInfo = communityId ? communityMap[communityId] : undefined;
                  return (
                    <ListingCard
                      key={home.id}
                      home={home}
                      builder={
                        builderInfo
                          ? {
                              builderName: builderInfo.builderName,
                              builderSlug:
                                builderInfo.builderSlug ||
                                resolveBuilderParam({
                                  builderSlug: builderInfo.builderSlug,
                                  keepupBuilderId: home.keepupBuilderId,
                                  builder: builderInfo.builderName || home.builder,
                                }),
                              logoUrl: builderInfo.logoUrl,
                            }
                          : null
                      }
                      community={
                        communityInfo
                          ? {
                              name: communityInfo.name,
                              slug: communityInfo.slug,
                              city: communityInfo.city,
                              state: communityInfo.state,
                              mapImage:
                                communityInfo.heroImageUrl ||
                                communityInfo.imageUrlsPreview?.[0] ||
                                communityInfo.photosPreview?.[0],
                            }
                          : null
                      }
                      variant="compact"
                      showSaveButton
                    />
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "map" && (
            <div className={styles.mapOnlyPanel}>
              <div className={styles.mapModePanel}>
                <p className={styles.mapModeMeta}>
                  Showing {mapCounts.mappable} homes on map ({mapCounts.missing} missing location)
                </p>
                <p className={styles.mapModeHint}>
                  Hover a pin for quick details. Click a pin to open the listing.
                </p>
                <ListingsMap
                  homes={sortedListings}
                  communityPoints={communityPoints}
                  communityPointsReady={communityPointsReady}
                  builderMap={builderMap}
                  communityMap={communityMap}
                  hoveredHomeId={hoveredHomeId}
                  onHoverHome={setHoveredHomeId}
                  appliedBounds={appliedBounds || mapReferenceBounds}
                  fitToHomesOnLoad={!appliedBounds && !mapReferenceBounds}
                  hasUnappliedMapMove={hasUnappliedMapMove}
                  searchingThisArea={homesLoading}
                  onViewportBoundsChange={handleMapViewportBoundsChange}
                  onSearchThisArea={handleSearchThisArea}
                  layerMode={layerMode}
                  onLayerModeChange={setLayerMode}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {moreOpen && (
        <div className={styles.moreOverlay} role="dialog" aria-modal="true">
          <div className={styles.morePanel}>
            <div className={styles.moreHeader}>
              <h2>More filters</h2>
              <button type="button" className={styles.ghost} onClick={() => setMoreOpen(false)}>
                Close
              </button>
            </div>
            <p className={styles.subtle}>
              Additional filters coming soon. Choose your options and save preferences later.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
