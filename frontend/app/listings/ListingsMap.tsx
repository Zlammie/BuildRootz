"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicHome } from "../../types/public";
import type {
  BuilderProfileSummary,
  PublicCommunitySummary,
} from "../../lib/publicIdentityLookup";
import {
  formatAddress,
  formatPrice,
  getPrimaryImage,
  getSpecPills,
  getStatusBadge,
  getStatusBadgeFromValue,
} from "../../lib/listingFormatters";
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN } from "../../lib/mapbox";
import {
  PRICE_BUBBLE_ZOOM_HYSTERESIS,
  PRICE_BUBBLE_ZOOM_THRESHOLD,
  createPriceBubbleMarkerElement,
  formatPriceBubbleLabel,
  updatePriceBubbleMarkerElement,
} from "./priceBubbleMarker";
import styles from "../page.module.css";

export type MapBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type BoundsChangeSource = "user" | "programmatic";
export type LayerMode = "community" | "community+inventory";
type RenderMode = "split" | "map";

export type CommunityMapPoint = {
  id: string;
  name: string;
  slug?: string;
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  inventoryCount: number;
  builderCount: number | null;
  planCount: number | null;
  productTypes: string[];
};

type Props = {
  homes: PublicHome[];
  communityPoints: CommunityMapPoint[];
  communityPointsReady: boolean;
  builderMap: Record<string, BuilderProfileSummary>;
  communityMap: Record<string, PublicCommunitySummary>;
  hoveredHomeId: string | null;
  onHoverHome: (homeId: string | null) => void;
  appliedBounds: MapBounds | null;
  fitToHomesOnLoad: boolean;
  hasUnappliedMapMove: boolean;
  searchingThisArea: boolean;
  onViewportBoundsChange: (bounds: MapBounds, source: BoundsChangeSource) => void;
  onSearchThisArea: () => void;
  renderMode: RenderMode;
  layerMode: LayerMode;
  onLayerModeChange: (mode: LayerMode) => void;
};

type MappableHome = PublicHome & { lat: number; lng: number };

const DEFAULT_CENTER: [number, number] = [-96.797, 32.7767];
const BOUNDS_EPSILON = 0.0008;

const COMMUNITY_SOURCE_ID = "brz-communities";
const COMMUNITY_CLUSTER_LAYER_ID = "brz-community-clusters";
const COMMUNITY_CLUSTER_COUNT_LAYER_ID = "brz-community-cluster-count";
const COMMUNITY_UNCLUSTERED_LAYER_ID = "brz-community-unclustered";

const INVENTORY_SOURCE_ID = "brz-inventory";
const INVENTORY_CLUSTER_LAYER_ID = "brz-inventory-clusters";
const INVENTORY_CLUSTER_COUNT_LAYER_ID = "brz-inventory-cluster-count";
const INVENTORY_UNCLUSTERED_LAYER_ID = "brz-inventory-unclustered";

const INVENTORY_CLUSTER_RADIUS = 56;
const INVENTORY_CLUSTER_MAX_ZOOM = Math.max(0, Math.floor(PRICE_BUBBLE_ZOOM_THRESHOLD - 1));
const INVENTORY_AUTO_REVEAL_ZOOM = Math.max(0, PRICE_BUBBLE_ZOOM_THRESHOLD - 0.75);
const INVENTORY_AUTO_REVEAL_ZOOM_HYSTERESIS = 0.2;
const MAX_PRICE_BUBBLES = 300;
const PRICE_BUBBLE_MIN_WIDTH = 56;
const PRICE_BUBBLE_MAX_WIDTH = 136;
const PRICE_BUBBLE_STACK_SPACING_X = 18;
const PRICE_BUBBLE_STACK_SPACING_Y = 8;
const PRICE_BUBBLE_STACK_MAX_OFFSET_X = 54;
const PRICE_BUBBLE_STACK_MAX_OFFSET_Y = 24;
const PRICE_BUBBLE_OVERLAP_PADDING_X = 12;
const PRICE_BUBBLE_OVERLAP_MIN_X = 44;
const PRICE_BUBBLE_OVERLAP_MAX_X = 96;
const PRICE_BUBBLE_OVERLAP_Y = 26;
const MAP_DEBUG_STORAGE_KEY = "brz:map-debug";
const MAP_DEBUG_SAMPLE_SIZE = 3;
const MAP_DEBUG_DRAG_LOG_INTERVAL_MS = 120;

type CoordinateDiagnostics = {
  missingCount: number;
  duplicateCount: number;
};

type MapDebugStatus = {
  createCount: number;
  removeCount: number;
  mapCreated: boolean;
  loadFired: boolean;
  styleLoadFired: boolean;
  idleFired: boolean;
  canvasFound: boolean;
  mapboxContainerFound: boolean;
  controlContainerFound: boolean;
  containerSize: string;
  canvasSize: string;
  lastError: string | null;
};

type PriceBubbleCandidate = {
  home: MappableHome;
  priceLabel: string;
  projectedX: number;
  projectedY: number;
  estimatedWidth: number;
};

type PriceBubbleLayout = {
  offset: [number, number];
  zIndex: number;
};

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001)
  );
}

function markerStatusKey(status?: string): "available" | "inventory" | "comingSoon" | "model" {
  const badge = getStatusBadgeFromValue(status);
  if (badge.variant === "inventory") return "inventory";
  if (badge.variant === "comingSoon") return "comingSoon";
  if (badge.variant === "model") return "model";
  return "available";
}

function readRootColorVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function setDebugMapInstance(map: mapboxgl.Map | null) {
  if (typeof window === "undefined") return;
  const debugWindow = window as typeof window & {
    __BRZ_MAP_DEBUG_INSTANCE__?: mapboxgl.Map | null;
  };
  debugWindow.__BRZ_MAP_DEBUG_INSTANCE__ = map;
}

function buildCoordinateDiagnostics(
  totalHomes: number,
  homesWithGeo: MappableHome[],
): CoordinateDiagnostics {
  const coordinateBuckets = new Map<string, number>();
  homesWithGeo.forEach((home) => {
    const key = `${home.lat.toFixed(6)},${home.lng.toFixed(6)}`;
    coordinateBuckets.set(key, (coordinateBuckets.get(key) || 0) + 1);
  });

  const duplicateCount = Array.from(coordinateBuckets.values()).reduce(
    (sum, count) => (count > 1 ? sum + count : sum),
    0,
  );

  return {
    missingCount: Math.max(0, totalHomes - homesWithGeo.length),
    duplicateCount,
  };
}

function boundsToKey(bounds: MapBounds | null): string {
  if (!bounds) return "";
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
    .map((value) => value.toFixed(5))
    .join(",");
}

function toMapBounds(bounds: mapboxgl.LngLatBounds): MapBounds {
  const southwest = bounds.getSouthWest();
  const northeast = bounds.getNorthEast();
  return {
    minLng: southwest.lng,
    minLat: southwest.lat,
    maxLng: northeast.lng,
    maxLat: northeast.lat,
  };
}

function toMapboxBounds(bounds: MapBounds): [[number, number], [number, number]] {
  return [
    [bounds.minLng, bounds.minLat],
    [bounds.maxLng, bounds.maxLat],
  ];
}

function areBoundsClose(left: MapBounds, right: MapBounds): boolean {
  return (
    Math.abs(left.minLng - right.minLng) <= BOUNDS_EPSILON &&
    Math.abs(left.minLat - right.minLat) <= BOUNDS_EPSILON &&
    Math.abs(left.maxLng - right.maxLng) <= BOUNDS_EPSILON &&
    Math.abs(left.maxLat - right.maxLat) <= BOUNDS_EPSILON
  );
}

function parseFeatureNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundDebugValue(value: number): number {
  return Number(value.toFixed(2));
}

function isMapDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(MAP_DEBUG_STORAGE_KEY) === "1" ||
    (window as typeof window & { __BRZ_MAP_DEBUG__?: boolean }).__BRZ_MAP_DEBUG__ === true
  );
}

function logMarkerDragSnapshot(
  label: string,
  map: mapboxgl.Map,
  homesById: Map<string, MappableHome>,
  markersById: Map<string, mapboxgl.Marker>,
) {
  if (typeof window === "undefined") return;

  const center = map.getCenter();
  const markers = Array.from(markersById.entries())
    .slice(0, MAP_DEBUG_SAMPLE_SIZE)
    .map(([homeId, marker]) => {
      const home = homesById.get(homeId);
      const element = marker.getElement();
      const computedStyle = window.getComputedStyle(element);
      const lngLat = marker.getLngLat();
      const projected = map.project([lngLat.lng, lngLat.lat]);

      return {
        homeId,
        lat: home ? roundDebugValue(home.lat) : roundDebugValue(lngLat.lat),
        lng: home ? roundDebugValue(home.lng) : roundDebugValue(lngLat.lng),
        projected: {
          x: roundDebugValue(projected.x),
          y: roundDebugValue(projected.y),
        },
        markerInlineTransform: element.style.transform || "",
        markerComputedTransform: computedStyle.transform || "",
        markerTransition: computedStyle.transition || "",
      };
    });

  console.debug("[ListingsMapDebug]", label, {
    center: {
      lng: roundDebugValue(center.lng),
      lat: roundDebugValue(center.lat),
    },
    zoom: roundDebugValue(map.getZoom()),
    markerCount: markersById.size,
    canvasTransform: map.getCanvas().style.transform || "",
    canvasContainerTransform: map.getCanvasContainer().style.transform || "",
    markers,
  });
}

function formatDebugError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Unknown error";
}

function formatElementSize(element: Element | null): string {
  if (!(element instanceof HTMLElement) && !(element instanceof HTMLCanvasElement)) {
    return "missing";
  }
  const rect = element.getBoundingClientRect();
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function estimatePriceBubbleWidth(priceLabel: string): number {
  const estimated = 24 + priceLabel.length * 8;
  return clamp(estimated, PRICE_BUBBLE_MIN_WIDTH, PRICE_BUBBLE_MAX_WIDTH);
}

function priceBubblesOverlap(a: PriceBubbleCandidate, b: PriceBubbleCandidate): boolean {
  const overlapThresholdX = clamp(
    (a.estimatedWidth + b.estimatedWidth) / 2 - PRICE_BUBBLE_OVERLAP_PADDING_X,
    PRICE_BUBBLE_OVERLAP_MIN_X,
    PRICE_BUBBLE_OVERLAP_MAX_X,
  );
  return (
    Math.abs(a.projectedX - b.projectedX) <= overlapThresholdX &&
    Math.abs(a.projectedY - b.projectedY) <= PRICE_BUBBLE_OVERLAP_Y
  );
}

function buildPriceBubbleLayouts(
  candidates: PriceBubbleCandidate[],
  hoveredHomeId: string | null,
): Map<string, PriceBubbleLayout> {
  const groups: PriceBubbleCandidate[][] = [];
  const sortedCandidates = [...candidates].sort(
    (a, b) =>
      a.projectedY - b.projectedY ||
      a.projectedX - b.projectedX ||
      a.home.id.localeCompare(b.home.id),
  );

  sortedCandidates.forEach((candidate) => {
    const group = groups.find((members) =>
      members.some((member) => priceBubblesOverlap(member, candidate)),
    );
    if (group) {
      group.push(candidate);
      return;
    }
    groups.push([candidate]);
  });

  const layouts = new Map<string, PriceBubbleLayout>();
  groups.forEach((group) => {
    const orderedMembers = [...group].sort(
      (a, b) =>
        a.projectedX - b.projectedX ||
        a.projectedY - b.projectedY ||
        a.home.id.localeCompare(b.home.id),
    );
    const center = (orderedMembers.length - 1) / 2;

    orderedMembers.forEach((candidate, index) => {
      const relativeIndex = index - center;
      const offsetX = clamp(
        relativeIndex * PRICE_BUBBLE_STACK_SPACING_X,
        -PRICE_BUBBLE_STACK_MAX_OFFSET_X,
        PRICE_BUBBLE_STACK_MAX_OFFSET_X,
      );
      const offsetY = -Math.min(
        PRICE_BUBBLE_STACK_MAX_OFFSET_Y,
        Math.abs(relativeIndex) * PRICE_BUBBLE_STACK_SPACING_Y,
      );
      const isActive = hoveredHomeId === candidate.home.id;

      layouts.set(candidate.home.id, {
        offset: [offsetX, offsetY],
        zIndex: isActive ? 400 : 100 + index,
      });
    });
  });

  return layouts;
}

function getBuilderCommunityLine(
  home: PublicHome,
  builderMap: Record<string, BuilderProfileSummary>,
  communityMap: Record<string, PublicCommunitySummary>,
): string {
  const companyId = (home.keepupBuilderId || "").trim().toLowerCase();
  const communityId = (home.publicCommunityId || "").trim().toLowerCase();
  const builderName = builderMap[companyId]?.builderName || home.builder || "Builder";
  const communityName = communityMap[communityId]?.name || home.communityName || "Community";
  const location = [communityMap[communityId]?.city, communityMap[communityId]?.state]
    .filter(Boolean)
    .join(", ");
  return location
    ? `${builderName} | ${communityName} | ${location}`
    : `${builderName} | ${communityName}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export default function ListingsMap({
  homes,
  communityPoints,
  communityPointsReady,
  builderMap,
  communityMap,
  hoveredHomeId,
  onHoverHome,
  appliedBounds,
  fitToHomesOnLoad,
  hasUnappliedMapMove,
  searchingThisArea,
  onViewportBoundsChange,
  onSearchThisArea,
  renderMode,
  layerMode,
  onLayerModeChange,
}: Props) {
  const router = useRouter();
  const debugEnabled = useMemo(() => isMapDebugEnabled(), []);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const initialResultsFitDoneRef = useRef(false);
  const lastAppliedBoundsKeyRef = useRef("");
  const communityHoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const hoveredHomeIdRef = useRef<string | null>(hoveredHomeId);
  const activeInventoryFeatureIdRef = useRef<string | null>(null);
  const inventoryPriceMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const priceBubbleVisibleRef = useRef(false);
  const userNavigatedMapRef = useRef(false);
  const diagnosticsLogKeyRef = useRef("");
  const debugStyleDataCountRef = useRef(0);
  const debugSourceDataCountRef = useRef(0);
  const debugResizeCountRef = useRef(0);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [inventoryAutoRevealActive, setInventoryAutoRevealActive] = useState(false);
  const [showDebugBadge, setShowDebugBadge] = useState(false);
  const [debugStatus, setDebugStatus] = useState<MapDebugStatus>({
    createCount: 0,
    removeCount: 0,
    mapCreated: false,
    loadFired: false,
    styleLoadFired: false,
    idleFired: false,
    canvasFound: false,
    mapboxContainerFound: false,
    controlContainerFound: false,
    containerSize: "missing",
    canvasSize: "missing",
    lastError: null,
  });

  const inventoryLayerEnabled = layerMode === "community+inventory";
  const inventoryLayerVisible = inventoryLayerEnabled || inventoryAutoRevealActive;
  const statusColors = useMemo(
    () => ({
      available: readRootColorVar("--map-available", "#5f7d5a"),
      inventory: readRootColorVar("--map-inventory", "#d9b65d"),
      comingSoon: readRootColorVar("--map-coming-soon", "#b8a89a"),
      model: readRootColorVar("--map-model", "#b8d8ff"),
    }),
    [],
  );
  const homesWithGeo = useMemo<MappableHome[]>(
    () =>
      homes.filter((home): home is MappableHome =>
        isValidCoordinate(home.lat, home.lng),
      ),
    [homes],
  );
  const homesById = useMemo(() => {
    const map = new Map<string, MappableHome>();
    homesWithGeo.forEach((home) => map.set(home.id, home));
    return map;
  }, [homesWithGeo]);
  const coordinateDiagnostics = useMemo(
    () => buildCoordinateDiagnostics(homes.length, homesWithGeo),
    [homes.length, homesWithGeo],
  );
  const communitiesWithGeo = useMemo(
    () =>
      communityPoints.filter((point) => isValidCoordinate(point.lat, point.lng)),
    [communityPoints],
  );
  const communitiesById = useMemo(() => {
    const map = new Map<string, CommunityMapPoint>();
    communitiesWithGeo.forEach((community) => map.set(community.id, community));
    return map;
  }, [communitiesWithGeo]);
  const appliedBoundsKey = useMemo(() => boundsToKey(appliedBounds), [appliedBounds]);

  const activeHome = useMemo(
    () => (hoveredHomeId ? homesById.get(hoveredHomeId) || null : null),
    [homesById, hoveredHomeId],
  );

  const selectedCommunity = useMemo(
    () => (selectedCommunityId ? communitiesById.get(selectedCommunityId) || null : null),
    [communitiesById, selectedCommunityId],
  );
  const priceBubbleClasses = useMemo(
    () => ({
      base: styles.mapPriceBubble,
      inner: styles.mapPriceBubbleInner,
      active: styles.mapPriceBubbleActive,
      muted: styles.mapPriceBubbleMuted,
    }),
    [],
  );
  const debugLog = useMemo(
    () => (label: string, details?: Record<string, unknown>) => {
      if (!debugEnabled) return;
      console.debug("[ListingsMapDebug]", label, details || {});
    },
    [debugEnabled],
  );
  const captureDomSnapshot = useMemo(
    () => (label: string) => {
      if (!debugEnabled || typeof window === "undefined") return;
      const container = mapContainerRef.current;
      const wrapper = container?.parentElement ?? null;
      const canvas = container?.querySelector("canvas.mapboxgl-canvas") ?? null;
      const mapboxContainer = container?.querySelector(".mapboxgl-canvas-container") ?? null;
      const controlContainer = container?.querySelector(".mapboxgl-control-container") ?? null;
      const wrapperStyle = wrapper ? window.getComputedStyle(wrapper) : null;
      const containerStyle = container ? window.getComputedStyle(container) : null;
      const snapshot = {
        renderMode,
        layerMode,
        containerSize: formatElementSize(container),
        canvasSize: formatElementSize(canvas),
        canvasFound: Boolean(canvas),
        mapboxContainerFound: Boolean(mapboxContainer),
        controlContainerFound: Boolean(controlContainer),
        wrapperOpacity: wrapperStyle?.opacity || "",
        wrapperZIndex: wrapperStyle?.zIndex || "",
        wrapperPointerEvents: wrapperStyle?.pointerEvents || "",
        containerOpacity: containerStyle?.opacity || "",
        containerZIndex: containerStyle?.zIndex || "",
        containerPointerEvents: containerStyle?.pointerEvents || "",
      };
      setDebugStatus((prev) => ({
        ...prev,
        containerSize: snapshot.containerSize,
        canvasSize: snapshot.canvasSize,
        canvasFound: snapshot.canvasFound,
        mapboxContainerFound: snapshot.mapboxContainerFound,
        controlContainerFound: snapshot.controlContainerFound,
      }));
      debugLog(label, snapshot);
    },
    [debugEnabled, debugLog, layerMode, renderMode],
  );

  useEffect(() => {
    if (debugEnabled) {
      window.requestAnimationFrame(() => setShowDebugBadge(true));
    }
  }, [debugEnabled]);

  useEffect(() => {
    if (!debugEnabled) return;
    debugLog("mount", {
      renderMode,
      layerMode,
      tokenPresent: Boolean(MAPBOX_TOKEN),
      styleUrl: MAPBOX_STYLE_URL,
      homesCount: homes.length,
      communitiesCount: communityPoints.length,
    });
    captureDomSnapshot("mount-dom");
    return () => {
      debugLog("unmount", {
        renderMode,
        layerMode,
        mapExists: Boolean(mapRef.current),
      });
    };
  }, [captureDomSnapshot, communityPoints.length, debugEnabled, debugLog, homes.length, layerMode, renderMode]);

  useEffect(() => {
    if (!debugEnabled) return;
    debugLog("props", {
      renderMode,
      layerMode,
      inventoryLayerEnabled,
      inventoryLayerVisible,
      homesWithGeo: homesWithGeo.length,
      communitiesWithGeo: communitiesWithGeo.length,
      appliedBounds: appliedBoundsKey || null,
    });
  }, [
    appliedBoundsKey,
    communitiesWithGeo.length,
    debugEnabled,
    debugLog,
    homesWithGeo.length,
    inventoryLayerEnabled,
    inventoryLayerVisible,
    layerMode,
    renderMode,
  ]);

  useEffect(() => {
    if (
      coordinateDiagnostics.missingCount <= 0 &&
      coordinateDiagnostics.duplicateCount <= 0
    ) {
      diagnosticsLogKeyRef.current = "";
      return;
    }
    const logKey = `${homes.length}:${coordinateDiagnostics.missingCount}:${coordinateDiagnostics.duplicateCount}`;
    if (diagnosticsLogKeyRef.current === logKey) return;
    diagnosticsLogKeyRef.current = logKey;

    if (coordinateDiagnostics.missingCount > 0) {
      console.warn(
        `[ListingsMap] ${coordinateDiagnostics.missingCount} listing(s) skipped due to missing/invalid coordinates.`,
      );
    }
    if (coordinateDiagnostics.duplicateCount > 0) {
      console.warn(
        `[ListingsMap] ${coordinateDiagnostics.duplicateCount} listing(s) share duplicate coordinates.`,
      );
    }
  }, [coordinateDiagnostics, homes.length]);

  useEffect(() => {
    hoveredHomeIdRef.current = hoveredHomeId;
    inventoryPriceMarkersRef.current.forEach((marker, homeId) => {
      const home = homesById.get(homeId);
      if (!home) return;
      const priceLabel = formatPriceBubbleLabel(home.price);
      const ariaLabel = priceLabel
        ? `Open listing at ${formatAddress(home)} priced ${priceLabel}`
        : `Open listing at ${formatAddress(home)}`;
      updatePriceBubbleMarkerElement(marker.getElement() as HTMLButtonElement, {
        classes: priceBubbleClasses,
        priceLabel,
        isActive: hoveredHomeId === homeId,
        ariaLabel,
      });
    });
  }, [homesById, hoveredHomeId, priceBubbleClasses]);

  useEffect(() => {
    if (!debugEnabled || typeof window === "undefined") return;
    const preview = document.querySelector(`.${styles.mapSelectionCard}`) as HTMLElement | null;
    if (activeHome) {
      debugLog("preview-mount", {
        homeId: activeHome.id,
        pointerEvents: preview ? window.getComputedStyle(preview).pointerEvents : "missing",
      });
      return () => {
        debugLog("preview-unmount", {
          homeId: activeHome.id,
        });
      };
    }
    debugLog("preview-cleared", {
      hoveredHomeId,
    });
  }, [activeHome, debugEnabled, debugLog, hoveredHomeId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady || !isMapDebugEnabled()) return;

    let lastDragLogAt = 0;

    const logSnapshot = (label: string) => {
      logMarkerDragSnapshot(label, map, homesById, inventoryPriceMarkersRef.current);
    };

    const handleDragStart = () => {
      lastDragLogAt = 0;
      logSnapshot("dragstart");
    };

    const handleDrag = () => {
      if (typeof window === "undefined") return;
      const now = window.performance.now();
      if (now - lastDragLogAt < MAP_DEBUG_DRAG_LOG_INTERVAL_MS) return;
      lastDragLogAt = now;
      logSnapshot("drag");
    };

    const handleDragEnd = () => {
      logSnapshot("dragend");
    };

    map.on("dragstart", handleDragStart);
    map.on("drag", handleDrag);
    map.on("dragend", handleDragEnd);

    return () => {
      map.off("dragstart", handleDragStart);
      map.off("drag", handleDrag);
      map.off("dragend", handleDragEnd);
    };
  }, [homesById, layersReady]);

  const communityGeoJson = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: communitiesWithGeo.map((point) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [point.lng, point.lat],
          },
          properties: {
            communityId: point.id,
            name: point.name,
            city: point.city || "",
            state: point.state || "",
            inventoryCount: point.inventoryCount,
            builderCount: point.builderCount ?? "",
            planCount: point.planCount ?? "",
            productTypes: (point.productTypes || []).join(", "),
          },
        })),
      }) as GeoJSON.FeatureCollection<GeoJSON.Point>,
    [communitiesWithGeo],
  );

  const inventoryGeoJson = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: homesWithGeo.map((home) => ({
          id: home.id,
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [home.lng, home.lat],
          },
          properties: {
            homeId: home.id,
            status: markerStatusKey(home.status),
          },
        })),
      }) as GeoJSON.FeatureCollection<GeoJSON.Point>,
    [homesWithGeo],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const container = mapContainerRef.current;
    if (!MAPBOX_TOKEN || !container) {
      debugLog("map-create-skipped", {
        tokenPresent: Boolean(MAPBOX_TOKEN),
        hasContainer: Boolean(container),
      });
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (mapRef.current) {
      debugLog("map-create-reused-existing-instance", {
        mapExists: true,
      });
      captureDomSnapshot("map-create-reused-dom");
      return;
    }

    try {
      debugLog("map-create-start", {
        tokenPresent: true,
        styleUrl: MAPBOX_STYLE_URL,
        renderMode,
        layerMode,
        containerSize: formatElementSize(container),
      });
      const map = new mapboxgl.Map({
        container,
        style: MAPBOX_STYLE_URL,
        center: DEFAULT_CENTER,
        zoom: 10,
      });
      mapRef.current = map;
      if (debugEnabled) {
        setDebugMapInstance(map);
      }
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      window.requestAnimationFrame(() => {
        setDebugStatus((prev) => ({
          ...prev,
          createCount: prev.createCount + 1,
          mapCreated: true,
          lastError: null,
        }));
      });
      captureDomSnapshot("map-create-success");
    } catch (error) {
      const message = formatDebugError(error);
      window.requestAnimationFrame(() => {
        setDebugStatus((prev) => ({
          ...prev,
          lastError: message,
        }));
      });
      debugLog("map-create-error", {
        message,
        tokenPresent: true,
        styleUrl: MAPBOX_STYLE_URL,
        renderMode,
        layerMode,
      });
      console.error("[ListingsMapDebug] map-create-error", error);
    }
  }, [captureDomSnapshot, debugEnabled, debugLog, layerMode, renderMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !debugEnabled) return;

    const handleLoad = () => {
      setDebugStatus((prev) => ({ ...prev, loadFired: true }));
      debugLog("event:load", {
        styleLoaded: map.isStyleLoaded(),
        center: map.getCenter().toArray(),
        zoom: roundDebugValue(map.getZoom()),
      });
      captureDomSnapshot("event:load-dom");
    };

    const handleStyleLoad = () => {
      setDebugStatus((prev) => ({ ...prev, styleLoadFired: true }));
      debugLog("event:style.load", {
        styleLoaded: map.isStyleLoaded(),
      });
      captureDomSnapshot("event:style.load-dom");
    };

    const handleIdle = () => {
      setDebugStatus((prev) => ({ ...prev, idleFired: true }));
      debugLog("event:idle", {
        styleLoaded: map.isStyleLoaded(),
        loaded: map.loaded(),
      });
      captureDomSnapshot("event:idle-dom");
    };

    const handleError = (event: mapboxgl.ErrorEvent) => {
      const message = formatDebugError(event.error);
      setDebugStatus((prev) => ({
        ...prev,
        lastError: message,
      }));
      debugLog("event:error", {
        message,
        error: event.error,
      });
      captureDomSnapshot("event:error-dom");
    };

    const handleStyleData = () => {
      debugStyleDataCountRef.current += 1;
      if (debugStyleDataCountRef.current > 6) return;
      debugLog("event:styledata", {
        count: debugStyleDataCountRef.current,
        styleLoaded: map.isStyleLoaded(),
      });
    };

    const handleSourceData = (event: mapboxgl.MapSourceDataEvent) => {
      debugSourceDataCountRef.current += 1;
      if (debugSourceDataCountRef.current > 10) return;
      debugLog("event:sourcedata", {
        count: debugSourceDataCountRef.current,
        dataType: event.dataType,
        sourceId: event.sourceId || "",
        isSourceLoaded: event.isSourceLoaded || false,
      });
    };

    map.on("load", handleLoad);
    map.on("style.load", handleStyleLoad);
    map.on("idle", handleIdle);
    map.on("error", handleError);
    map.on("styledata", handleStyleData);
    map.on("sourcedata", handleSourceData);

    debugLog("debug-event-listeners-attached", {
      styleLoaded: map.isStyleLoaded(),
      loaded: map.loaded(),
    });
    captureDomSnapshot("debug-event-listeners-attached-dom");

    return () => {
      map.off("load", handleLoad);
      map.off("style.load", handleStyleLoad);
      map.off("idle", handleIdle);
      map.off("error", handleError);
      map.off("styledata", handleStyleData);
      map.off("sourcedata", handleSourceData);
    };
  }, [captureDomSnapshot, debugEnabled, debugLog]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || typeof window === "undefined") return;

    const resizeMap = () => {
      debugResizeCountRef.current += 1;
      if (debugEnabled) {
        setDebugStatus((prev) => ({
          ...prev,
          containerSize: formatElementSize(container),
        }));
        debugLog("resize", {
          resizeCount: debugResizeCountRef.current,
          containerSize: formatElementSize(container),
        });
      }
      map.resize();
      captureDomSnapshot("resize-dom");
    };

    resizeMap();
    const raf = window.requestAnimationFrame(resizeMap);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        debugLog("resize-observer-fired", {
          containerSize: formatElementSize(container),
        });
        resizeMap();
      });
      observer.observe(container);
    }
    window.addEventListener("resize", resizeMap);
    map.once("load", resizeMap);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resizeMap);
      observer?.disconnect();
      map.off("load", resizeMap);
    };
  }, [captureDomSnapshot, debugEnabled, debugLog]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncInventoryAutoReveal = () => {
      const zoom = map.getZoom();
      setInventoryAutoRevealActive((current) => {
        const next = current
          ? zoom >= INVENTORY_AUTO_REVEAL_ZOOM - INVENTORY_AUTO_REVEAL_ZOOM_HYSTERESIS
          : zoom >= INVENTORY_AUTO_REVEAL_ZOOM + INVENTORY_AUTO_REVEAL_ZOOM_HYSTERESIS;
        return current === next ? current : next;
      });
    };

    syncInventoryAutoReveal();
    map.on("zoom", syncInventoryAutoReveal);
    map.on("zoomend", syncInventoryAutoReveal);

    return () => {
      map.off("zoom", syncInventoryAutoReveal);
      map.off("zoomend", syncInventoryAutoReveal);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markUserNavigation = () => {
      userNavigatedMapRef.current = true;
    };

    map.on("dragstart", markUserNavigation);
    map.on("zoomstart", markUserNavigation);

    return () => {
      map.off("dragstart", markUserNavigation);
      map.off("zoomstart", markUserNavigation);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const initSourcesAndLayers = () => {
      if (!map.getSource(COMMUNITY_SOURCE_ID)) {
        map.addSource(COMMUNITY_SOURCE_ID, {
          type: "geojson",
          data: communityGeoJson,
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 13,
        });
      }
      if (!map.getLayer(COMMUNITY_CLUSTER_LAYER_ID)) {
        map.addLayer({
          id: COMMUNITY_CLUSTER_LAYER_ID,
          type: "circle",
          source: COMMUNITY_SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#6f8f67",
              20,
              "#55754f",
              60,
              "#3e5b3b",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              20,
              20,
              60,
              24,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }
      if (!map.getLayer(COMMUNITY_CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: COMMUNITY_CLUSTER_COUNT_LAYER_ID,
          type: "symbol",
          source: COMMUNITY_SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }
      if (!map.getLayer(COMMUNITY_UNCLUSTERED_LAYER_ID)) {
        map.addLayer({
          id: COMMUNITY_UNCLUSTERED_LAYER_ID,
          type: "circle",
          source: COMMUNITY_SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#5f7d5a",
            "circle-radius": 8,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }

      if (!map.getSource(INVENTORY_SOURCE_ID)) {
        map.addSource(INVENTORY_SOURCE_ID, {
          type: "geojson",
          data: inventoryGeoJson,
          cluster: true,
          clusterRadius: INVENTORY_CLUSTER_RADIUS,
          clusterMaxZoom: INVENTORY_CLUSTER_MAX_ZOOM,
        });
      }
      if (!map.getLayer(INVENTORY_CLUSTER_LAYER_ID)) {
        map.addLayer({
          id: INVENTORY_CLUSTER_LAYER_ID,
          type: "circle",
          source: INVENTORY_SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#c8a84b",
              25,
              "#b38f2f",
              75,
              "#9a7722",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              14,
              25,
              18,
              75,
              22,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
          layout: {
            visibility: inventoryLayerVisible ? "visible" : "none",
          },
        });
      }
      if (!map.getLayer(INVENTORY_CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: INVENTORY_CLUSTER_COUNT_LAYER_ID,
          type: "symbol",
          source: INVENTORY_SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 11,
            visibility: inventoryLayerVisible ? "visible" : "none",
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }
      if (!map.getLayer(INVENTORY_UNCLUSTERED_LAYER_ID)) {
        map.addLayer({
          id: INVENTORY_UNCLUSTERED_LAYER_ID,
          type: "circle",
          source: INVENTORY_SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "status"],
              "inventory",
              statusColors.inventory,
              "comingSoon",
              statusColors.comingSoon,
              "model",
              statusColors.model,
              statusColors.available,
            ],
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "active"], false],
              9,
              6,
            ],
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              PRICE_BUBBLE_ZOOM_THRESHOLD - 0.4,
              1,
              PRICE_BUBBLE_ZOOM_THRESHOLD + 0.2,
              0,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              PRICE_BUBBLE_ZOOM_THRESHOLD - 0.4,
              1,
              PRICE_BUBBLE_ZOOM_THRESHOLD + 0.2,
              0,
            ],
          },
          layout: {
            visibility: inventoryLayerVisible ? "visible" : "none",
          },
        });
      }
      setLayersReady(true);
    };

    if (map.isStyleLoaded()) {
      initSourcesAndLayers();
    } else {
      map.once("load", initSourcesAndLayers);
    }

    return () => {
      map.off("load", initSourcesAndLayers);
    };
  }, [communityGeoJson, inventoryGeoJson, inventoryLayerVisible, statusColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const source = map.getSource(COMMUNITY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(communityGeoJson);
    }
  }, [communityGeoJson, layersReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const source = map.getSource(INVENTORY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      debugLog("inventory-source-update", {
        featureCount: homesWithGeo.length,
      });
      source.setData(inventoryGeoJson);
    }
  }, [debugLog, homesWithGeo.length, inventoryGeoJson, layersReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady || !map.getSource(INVENTORY_SOURCE_ID)) return;

    const previousHomeId = activeInventoryFeatureIdRef.current;
    if (previousHomeId && previousHomeId !== hoveredHomeId) {
      map.setFeatureState(
        {
          source: INVENTORY_SOURCE_ID,
          id: previousHomeId,
        },
        { active: false },
      );
      debugLog("inventory-feature-state", {
        homeId: previousHomeId,
        active: false,
      });
      activeInventoryFeatureIdRef.current = null;
    }

    if (!hoveredHomeId || !homesById.has(hoveredHomeId)) {
      return;
    }

    map.setFeatureState(
      {
        source: INVENTORY_SOURCE_ID,
        id: hoveredHomeId,
      },
      { active: true },
    );
    activeInventoryFeatureIdRef.current = hoveredHomeId;
    debugLog("inventory-feature-state", {
      homeId: hoveredHomeId,
      active: true,
    });
  }, [debugLog, homesById, hoveredHomeId, layersReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const visibility = inventoryLayerVisible ? "visible" : "none";
    [
      INVENTORY_CLUSTER_LAYER_ID,
      INVENTORY_CLUSTER_COUNT_LAYER_ID,
      INVENTORY_UNCLUSTERED_LAYER_ID,
    ].forEach(
      (layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      },
    );
    if (!inventoryLayerVisible) {
      onHoverHome(null);
    }
  }, [inventoryLayerVisible, layersReady, onHoverHome]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onCommunityClusterClick = (event: mapboxgl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [COMMUNITY_CLUSTER_LAYER_ID],
      })[0];
      if (!feature) return;
      const clusterId = parseFeatureNumber(feature.properties?.cluster_id);
      if (clusterId === null) return;
      const source = map.getSource(COMMUNITY_SOURCE_ID) as mapboxgl.GeoJSONSource & {
        getClusterExpansionZoom: (
          id: number,
          callback: (error: Error | null, zoom: number) => void,
        ) => void;
      };
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        if (typeof zoom !== "number" || !Number.isFinite(zoom)) return;
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coordinates, zoom });
      });
    };

    const onInventoryClusterClick = (event: mapboxgl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [INVENTORY_CLUSTER_LAYER_ID],
      })[0];
      if (!feature) return;
      const clusterId = parseFeatureNumber(feature.properties?.cluster_id);
      if (clusterId === null) return;
      const source = map.getSource(INVENTORY_SOURCE_ID) as mapboxgl.GeoJSONSource & {
        getClusterExpansionZoom: (
          id: number,
          callback: (error: Error | null, zoom: number) => void,
        ) => void;
      };
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        if (typeof zoom !== "number" || !Number.isFinite(zoom)) return;
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coordinates, zoom });
      });
    };

    const onCommunityPinClick = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const communityId = typeof feature.properties?.communityId === "string"
        ? feature.properties.communityId
        : "";
      if (!communityId) return;
      setSelectedCommunityId(communityId);
      onHoverHome(null);
    };

    const onInventoryPinClick = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      const homeId = typeof feature?.properties?.homeId === "string" ? feature.properties.homeId : "";
      if (!homeId) return;
      router.push(`/listing/${homeId}`);
    };

    const onCommunityPinEnter = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature) return;
      map.getCanvas().style.cursor = "pointer";
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const name = typeof feature.properties?.name === "string" ? feature.properties.name : "Community";
      const inventoryCount = parseFeatureNumber(feature.properties?.inventoryCount) ?? 0;
      const homeLabel = inventoryCount === 1 ? "Quick Move-In home" : "Quick Move-In homes";
      const html = `<div class="brz-map-tooltip"><strong>${escapeHtml(name)}</strong><div>${inventoryCount} ${homeLabel}</div></div>`;
      if (!communityHoverPopupRef.current) {
        communityHoverPopupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "brzMapTooltipPopup",
        });
      }
      communityHoverPopupRef.current
        .setLngLat(coordinates)
        .setHTML(html)
        .addTo(map);
    };

    const onCommunityPinLeave = () => {
      map.getCanvas().style.cursor = "";
      communityHoverPopupRef.current?.remove();
    };

    const onInventoryPinEnter = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      const homeId = typeof feature?.properties?.homeId === "string" ? feature.properties.homeId : "";
      if (!homeId) return;
      map.getCanvas().style.cursor = "pointer";
      debugLog("hover-enter", {
        source: "inventory-layer",
        homeId,
      });
      onHoverHome(homeId);
    };

    const onInventoryPinLeave = () => {
      map.getCanvas().style.cursor = "";
      debugLog("hover-leave", {
        source: "inventory-layer",
        homeId: hoveredHomeIdRef.current,
      });
      onHoverHome(null);
    };

    if (map.getLayer(COMMUNITY_CLUSTER_LAYER_ID)) {
      map.on("click", COMMUNITY_CLUSTER_LAYER_ID, onCommunityClusterClick);
    }
    if (map.getLayer(COMMUNITY_UNCLUSTERED_LAYER_ID)) {
      map.on("click", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinClick);
      map.on("mouseenter", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinEnter);
      map.on("mouseleave", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinLeave);
    }
    if (map.getLayer(INVENTORY_CLUSTER_LAYER_ID)) {
      map.on("click", INVENTORY_CLUSTER_LAYER_ID, onInventoryClusterClick);
    }
    if (map.getLayer(INVENTORY_UNCLUSTERED_LAYER_ID)) {
      map.on("click", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinClick);
      map.on("mouseenter", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinEnter);
      map.on("mouseleave", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinLeave);
    }

    return () => {
      if (map.getLayer(COMMUNITY_CLUSTER_LAYER_ID)) {
        map.off("click", COMMUNITY_CLUSTER_LAYER_ID, onCommunityClusterClick);
      }
      if (map.getLayer(COMMUNITY_UNCLUSTERED_LAYER_ID)) {
        map.off("click", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinClick);
        map.off("mouseenter", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinEnter);
        map.off("mouseleave", COMMUNITY_UNCLUSTERED_LAYER_ID, onCommunityPinLeave);
      }
      if (map.getLayer(INVENTORY_CLUSTER_LAYER_ID)) {
        map.off("click", INVENTORY_CLUSTER_LAYER_ID, onInventoryClusterClick);
      }
      if (map.getLayer(INVENTORY_UNCLUSTERED_LAYER_ID)) {
        map.off("click", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinClick);
        map.off("mouseenter", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinEnter);
        map.off("mouseleave", INVENTORY_UNCLUSTERED_LAYER_ID, onInventoryPinLeave);
      }
    };
  }, [layersReady, onHoverHome, router]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;

    const markersById = inventoryPriceMarkersRef.current;
    let frameId: number | null = null;

    const clearMarkers = () => {
      markersById.forEach((marker) => marker.remove());
      markersById.clear();
    };

    const shouldShowPriceBubbles = () => {
      const zoom = map.getZoom();
      const currentlyVisible = priceBubbleVisibleRef.current;
      const nextVisible = currentlyVisible
        ? zoom >= PRICE_BUBBLE_ZOOM_THRESHOLD - PRICE_BUBBLE_ZOOM_HYSTERESIS
        : zoom >= PRICE_BUBBLE_ZOOM_THRESHOLD + PRICE_BUBBLE_ZOOM_HYSTERESIS;
      priceBubbleVisibleRef.current = nextVisible;
      return nextVisible;
    };

    const syncPriceBubbles = () => {
      if (!inventoryLayerVisible || !shouldShowPriceBubbles()) {
        clearMarkers();
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) {
        clearMarkers();
        return;
      }

      const nextVisibleIds = new Set<string>();
      const visibleCandidates: PriceBubbleCandidate[] = [];

      for (const home of homesWithGeo) {
        if (visibleCandidates.length >= MAX_PRICE_BUBBLES) break;
        if (!bounds.contains([home.lng, home.lat])) continue;

        const priceLabel = formatPriceBubbleLabel(home.price);
        if (!priceLabel) continue;

        const projected = map.project([home.lng, home.lat]);
        visibleCandidates.push({
          home,
          priceLabel,
          projectedX: projected.x,
          projectedY: projected.y,
          estimatedWidth: estimatePriceBubbleWidth(priceLabel),
        });
      }

      const bubbleLayouts = buildPriceBubbleLayouts(visibleCandidates, hoveredHomeIdRef.current);

      for (const candidate of visibleCandidates) {
        const { home, priceLabel } = candidate;
        nextVisibleIds.add(home.id);

        const ariaLabel = `Open listing at ${formatAddress(home)} priced ${priceLabel}`;
        const isActive = hoveredHomeIdRef.current === home.id;
        const layout = bubbleLayouts.get(home.id);
        const existing = markersById.get(home.id);

        if (!existing) {
          const element = createPriceBubbleMarkerElement({
            classes: priceBubbleClasses,
            priceLabel,
            isActive,
            ariaLabel,
          });

          element.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            router.push(`/listing/${home.id}`);
          });
          element.addEventListener("mouseenter", () => {
            debugLog("hover-enter", {
              source: "price-bubble-marker",
              homeId: home.id,
            });
            onHoverHome(home.id);
          });
          element.addEventListener("mouseleave", () => {
            debugLog("hover-leave", {
              source: "price-bubble-marker",
              homeId: home.id,
            });
            onHoverHome(null);
          });

          const marker = new mapboxgl.Marker({
            element,
            anchor: "bottom",
            offset: layout?.offset || [0, 0],
          })
            .setLngLat([home.lng, home.lat])
            .addTo(map);

          element.style.zIndex = String(layout?.zIndex || (isActive ? 400 : 100));
          markersById.set(home.id, marker);
          debugLog("marker-created", {
            homeId: home.id,
          });
          continue;
        }

        const markerLngLat = existing.getLngLat();
        if (
          Math.abs(markerLngLat.lng - home.lng) > 0.0000001 ||
          Math.abs(markerLngLat.lat - home.lat) > 0.0000001
        ) {
          existing.setLngLat([home.lng, home.lat]);
        }
        existing.setOffset(layout?.offset || [0, 0]);
        updatePriceBubbleMarkerElement(existing.getElement() as HTMLButtonElement, {
          classes: priceBubbleClasses,
          priceLabel,
          isActive,
          ariaLabel,
        });
        (existing.getElement() as HTMLButtonElement).style.zIndex = String(
          layout?.zIndex || (isActive ? 400 : 100),
        );
      }

      markersById.forEach((marker, homeId) => {
        if (nextVisibleIds.has(homeId)) return;
        marker.remove();
        markersById.delete(homeId);
        debugLog("marker-removed", {
          homeId,
        });
      });
    };

    const scheduleSync = () => {
      if (typeof window === "undefined") {
        syncPriceBubbles();
        return;
      }
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncPriceBubbles();
      });
    };

    scheduleSync();
    map.on("move", scheduleSync);
    map.on("zoom", scheduleSync);
    map.on("moveend", scheduleSync);
    map.on("zoomend", scheduleSync);

    return () => {
      map.off("move", scheduleSync);
      map.off("zoom", scheduleSync);
      map.off("moveend", scheduleSync);
      map.off("zoomend", scheduleSync);
      if (frameId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameId);
      }
      clearMarkers();
      priceBubbleVisibleRef.current = false;
    };
  }, [
    homesWithGeo,
    inventoryLayerVisible,
    layersReady,
    onHoverHome,
    priceBubbleClasses,
    router,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMoveEnd = (event: mapboxgl.MapboxEvent) => {
      const mapBounds = map.getBounds();
      if (!mapBounds) return;
      const nextBounds = toMapBounds(mapBounds);
      const source: BoundsChangeSource =
        "originalEvent" in event && event.originalEvent ? "user" : "programmatic";
      onViewportBoundsChange(nextBounds, source);
    };

    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [onViewportBoundsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (appliedBounds && appliedBoundsKey !== lastAppliedBoundsKeyRef.current) {
      lastAppliedBoundsKeyRef.current = appliedBoundsKey;
      initialResultsFitDoneRef.current = true;
      // External bounds update (URL or Search this area) becomes the new sticky baseline.
      userNavigatedMapRef.current = false;
      const mapBounds = map.getBounds();
      if (!mapBounds) return;
      const currentBounds = toMapBounds(mapBounds);
      if (!areBoundsClose(currentBounds, appliedBounds)) {
        map.fitBounds(toMapboxBounds(appliedBounds), { padding: 52, duration: 500 });
      }
      return;
    }

    // After a user pan/zoom, keep the viewport where they moved it until a new explicit bounds apply.
    if (userNavigatedMapRef.current) return;

    if (appliedBounds) return;
    lastAppliedBoundsKeyRef.current = "";
    if (!fitToHomesOnLoad || initialResultsFitDoneRef.current) return;
    if (!communityPointsReady && communitiesWithGeo.length === 0) return;

    const pointsToFit =
      inventoryLayerEnabled && homesWithGeo.length > 0
        ? homesWithGeo.map((home) => [home.lng, home.lat] as [number, number])
        : communitiesWithGeo.length > 0
          ? communitiesWithGeo.map((community) => [community.lng, community.lat] as [number, number])
          : homesWithGeo.map((home) => [home.lng, home.lat] as [number, number]);
    if (!pointsToFit.length) return;

    initialResultsFitDoneRef.current = true;
    if (pointsToFit.length === 1) {
      map.flyTo({
        center: pointsToFit[0],
        zoom: 13,
        essential: true,
      });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    pointsToFit.forEach((point) => bounds.extend(point));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 52, maxZoom: 12, duration: 500 });
    }
  }, [
    appliedBounds,
    appliedBoundsKey,
    communitiesWithGeo,
    communityPointsReady,
    fitToHomesOnLoad,
    homesWithGeo,
    inventoryLayerEnabled,
  ]);

  useEffect(() => {
    return () => {
      if (debugEnabled) {
        debugLog("map-remove", {
          mapExists: Boolean(mapRef.current),
        });
      }
      communityHoverPopupRef.current?.remove();
      communityHoverPopupRef.current = null;
      if (mapRef.current) {
        setDebugStatus((prev) => ({
          ...prev,
          removeCount: prev.removeCount + 1,
        }));
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [debugEnabled, debugLog]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={styles.mapEmptyState}>
        Add `NEXT_PUBLIC_MAPBOX_TOKEN` to enable map view.
      </div>
    );
  }

  return (
    <div
      className={styles.mapModeWrapper}
      onMouseLeave={() => {
        debugLog("hover-leave", {
          source: "map-wrapper",
          homeId: hoveredHomeIdRef.current,
        });
        onHoverHome(null);
      }}
    >
      <div ref={mapContainerRef} className={styles.mapModeCanvas} />
      {showDebugBadge ? (
        <div className={styles.mapDebugBadge} aria-live="polite">
          <p>created: {debugStatus.mapCreated ? "yes" : "no"}</p>
          <p>load: {debugStatus.loadFired ? "yes" : "no"}</p>
          <p>style: {debugStatus.styleLoadFired ? "yes" : "no"}</p>
          <p>idle: {debugStatus.idleFired ? "yes" : "no"}</p>
          <p>canvas: {debugStatus.canvasFound ? "yes" : "no"}</p>
          <p>controls: {debugStatus.controlContainerFound ? "yes" : "no"}</p>
          <p>container: {debugStatus.containerSize}</p>
          <p>canvasSize: {debugStatus.canvasSize}</p>
          <p>error: {debugStatus.lastError || "none"}</p>
        </div>
      ) : null}
      <div className={styles.mapLayerControl} role="group" aria-label="Map layers">
        <button type="button" className={`${styles.mapLayerBtn} ${styles.mapLayerBtnActive}`} aria-pressed>
          Communities
        </button>
        <button
          type="button"
          className={`${styles.mapLayerBtn} ${
            inventoryLayerVisible ? styles.mapLayerBtnActive : ""
          }`}
          aria-pressed={inventoryLayerVisible}
          onClick={() =>
            onLayerModeChange(inventoryLayerEnabled ? "community" : "community+inventory")
          }
        >
          Quick Move-In
        </button>
      </div>
      {hasUnappliedMapMove ? (
        <button
          type="button"
          className={styles.mapSearchAreaButton}
          onClick={onSearchThisArea}
          disabled={searchingThisArea}
          aria-label="Search this area"
        >
          {searchingThisArea ? "Searching..." : "Search this area"}
        </button>
      ) : null}

      {selectedCommunity ? (
        <div className={styles.mapCommunityCard}>
          <div className={styles.mapCommunityCardHeader}>
            <div>
              <p className={styles.mapCommunityName}>{selectedCommunity.name}</p>
              <p className={styles.mapCommunityMeta}>
                {[selectedCommunity.city, selectedCommunity.state].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
            <button
              type="button"
              className={styles.mapCommunityClose}
              onClick={() => setSelectedCommunityId(null)}
              aria-label="Close community details"
            >
              ×
            </button>
          </div>
          <div className={styles.mapCommunityStats}>
            <p>Builders: {selectedCommunity.builderCount ?? "—"}</p>
            <p>Plans: {selectedCommunity.planCount ?? "—"}</p>
            <p>Quick Move-In Homes: {selectedCommunity.inventoryCount}</p>
            <p>
              Product types:{" "}
              {selectedCommunity.productTypes.length
                ? selectedCommunity.productTypes.join(", ")
                : "—"}
            </p>
          </div>
          <Link
            href={
              selectedCommunity.slug
                ? `/community?communitySlug=${encodeURIComponent(selectedCommunity.slug)}`
                : `/community?communityId=${encodeURIComponent(selectedCommunity.id)}`
            }
            className={styles.mapSelectionCta}
          >
            View community
          </Link>
        </div>
      ) : null}

      {!selectedCommunity && activeHome && (
        (() => {
          const companyId = (activeHome.keepupBuilderId || "").trim().toLowerCase();
          const communityId = (activeHome.publicCommunityId || "").trim().toLowerCase();
          const builder = companyId ? builderMap[companyId] : undefined;
          const community = communityId ? communityMap[communityId] : undefined;
          const image = getPrimaryImage(activeHome, builder, community);
          const price = formatPrice(activeHome);
          const specs = getSpecPills(activeHome);
          const badge = getStatusBadge(activeHome);

          return (
            <div className={styles.mapSelectionCard}>
              <div
                className={`${styles.mapSelectionImage} ${
                  image.isPlaceholder ? styles.mapSelectionImagePlaceholder : ""
                }`}
                style={{ backgroundImage: `url(${image.url})` }}
                role="img"
                aria-label={image.alt}
              />
              <div className={styles.mapSelectionBody}>
                <div className={styles.mapSelectionBadgeRow}>
                  <span
                    className={`${styles.status} ${
                      badge.variant === "construction"
                        ? styles.mapSelectionStatusConstruction
                        : badge.variant === "sold"
                          ? styles.mapSelectionStatusSold
                          : badge.variant === "inventory"
                            ? styles.status_inventory
                            : badge.variant === "comingSoon"
                              ? styles.status_comingSoon
                              : styles.status_available
                    }`}
                  >
                    {badge.text}
                  </span>
                </div>
                <p className={styles.mapSelectionMeta}>
                  {getBuilderCommunityLine(activeHome, builderMap, communityMap)}
                </p>
                <p className={styles.mapSelectionAddress}>{formatAddress(activeHome)}</p>
                <p
                  className={`${styles.mapSelectionPrice} ${
                    price.isFallback ? styles.mapSelectionPriceMuted : ""
                  }`}
                >
                  {price.label}
                </p>
                {specs.length ? (
                  <div className={styles.mapSelectionSpecs}>
                    {specs.map((spec) => (
                      <span key={spec.key} className={styles.mapSelectionSpec}>
                        {spec.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <Link href={`/listing/${activeHome.id}`} className={styles.mapSelectionCta}>
                  View listing
                </Link>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

