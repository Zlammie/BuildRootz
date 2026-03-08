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
} from "../../lib/listingFormatters";
import styles from "../page.module.css";

export type MapBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type BoundsChangeSource = "user" | "programmatic";
export type LayerMode = "community" | "community+inventory";

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
  layerMode: LayerMode;
  onLayerModeChange: (mode: LayerMode) => void;
};

type MappableHome = PublicHome & { lat: number; lng: number };

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "";
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

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function markerStatusKey(status?: string): "available" | "inventory" | "comingSoon" | "model" {
  const key = (status || "").toLowerCase();
  if (key.includes("inventory") || key.includes("spec")) return "inventory";
  if (key.includes("coming")) return "comingSoon";
  if (key.includes("model")) return "model";
  return "available";
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
  layerMode,
  onLayerModeChange,
}: Props) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const initialResultsFitDoneRef = useRef(false);
  const lastAppliedBoundsKeyRef = useRef("");
  const communityHoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [layersReady, setLayersReady] = useState(false);

  const inventoryLayerEnabled = layerMode === "community+inventory";
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
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [home.lng, home.lat],
          },
          properties: {
            homeId: home.id,
            status: markerStatusKey(home.status),
            isActive: hoveredHomeId === home.id,
          },
        })),
      }) as GeoJSON.FeatureCollection<GeoJSON.Point>,
    [homesWithGeo, hoveredHomeId],
  );

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || typeof window === "undefined") {
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: DEFAULT_CENTER,
        zoom: 10,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }
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
          clusterRadius: 40,
          clusterMaxZoom: 14,
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
            visibility: inventoryLayerEnabled ? "visible" : "none",
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
            visibility: inventoryLayerEnabled ? "visible" : "none",
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
              "#d9b555",
              "comingSoon",
              "#d58f5f",
              "model",
              "#7db2e8",
              "#5f7d5a",
            ],
            "circle-radius": [
              "case",
              ["boolean", ["get", "isActive"], false],
              8,
              5,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
          layout: {
            visibility: inventoryLayerEnabled ? "visible" : "none",
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
  }, [communityGeoJson, inventoryGeoJson, inventoryLayerEnabled]);

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
      source.setData(inventoryGeoJson);
    }
  }, [inventoryGeoJson, layersReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const visibility = inventoryLayerEnabled ? "visible" : "none";
    [INVENTORY_CLUSTER_LAYER_ID, INVENTORY_CLUSTER_COUNT_LAYER_ID, INVENTORY_UNCLUSTERED_LAYER_ID].forEach(
      (layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility);
        }
      },
    );
    if (!inventoryLayerEnabled) {
      onHoverHome(null);
    }
  }, [inventoryLayerEnabled, layersReady, onHoverHome]);

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
      const html = `<div class="brz-map-tooltip"><strong>${escapeHtml(name)}</strong><div>${inventoryCount} inventory</div></div>`;
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
      onHoverHome(homeId);
    };

    const onInventoryPinLeave = () => {
      map.getCanvas().style.cursor = "";
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
    if (!map) return;

    const handleMoveEnd = (event: mapboxgl.MapboxEvent<unknown>) => {
      const nextBounds = toMapBounds(map.getBounds());
      const source: BoundsChangeSource = event.originalEvent ? "user" : "programmatic";
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
      const currentBounds = toMapBounds(map.getBounds());
      if (!areBoundsClose(currentBounds, appliedBounds)) {
        map.fitBounds(toMapboxBounds(appliedBounds), { padding: 52, maxZoom: 13, duration: 500 });
      }
      return;
    }

    if (appliedBounds) return;
    lastAppliedBoundsKeyRef.current = "";
    if (!fitToHomesOnLoad || initialResultsFitDoneRef.current) return;
    if (!communityPointsReady && communitiesWithGeo.length === 0) return;

    const pointsToFit =
      communitiesWithGeo.length > 0
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
  ]);

  useEffect(() => {
    return () => {
      communityHoverPopupRef.current?.remove();
      communityHoverPopupRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={styles.mapEmptyState}>
        Add `NEXT_PUBLIC_MAPBOX_TOKEN` to enable map view.
      </div>
    );
  }

  return (
    <div className={styles.mapModeWrapper} onMouseLeave={() => onHoverHome(null)}>
      <div ref={mapContainerRef} className={styles.mapModeCanvas} />
      <div className={styles.mapLayerControl} role="group" aria-label="Map layers">
        <button type="button" className={`${styles.mapLayerBtn} ${styles.mapLayerBtnActive}`} aria-pressed>
          Communities
        </button>
        <button
          type="button"
          className={`${styles.mapLayerBtn} ${
            inventoryLayerEnabled ? styles.mapLayerBtnActive : ""
          }`}
          aria-pressed={inventoryLayerEnabled}
          onClick={() =>
            onLayerModeChange(inventoryLayerEnabled ? "community" : "community+inventory")
          }
        >
          Inventory
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
            <p>Inventory: {selectedCommunity.inventoryCount}</p>
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
