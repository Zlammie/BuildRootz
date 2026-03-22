"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";
import { MAPBOX_STYLE_URL, MAPBOX_TOKEN } from "../../lib/mapbox";
import styles from "./CommunitySections.module.css";

type Props = {
  lat: number;
  lng: number;
  label: string;
};

const COMMUNITY_MAP_ZOOM = 13.25;

export default function CommunityLocationMap({ lat, lng, label }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    if (!mapRef.current) {
      const markerElement = document.createElement("div");
      markerElement.className = styles.communityMapMarker;
      markerElement.setAttribute("aria-hidden", "true");

      const map = new mapboxgl.Map({
        container,
        style: MAPBOX_STYLE_URL,
        center: [lng, lat],
        zoom: COMMUNITY_MAP_ZOOM,
        attributionControl: false,
      });

      map.scrollZoom.disable();
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));

      markerRef.current = new mapboxgl.Marker({
        element: markerElement,
        anchor: "bottom",
      })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(label))
        .addTo(map);

      mapRef.current = map;
    } else {
      mapRef.current.setCenter([lng, lat]);
      mapRef.current.setZoom(COMMUNITY_MAP_ZOOM);
      markerRef.current?.setLngLat([lng, lat]);
      markerRef.current?.getPopup()?.setText(label);
    }

    const map = mapRef.current;
    if (!map) return;

    const resize = () => map.resize();
    resize();
    const frame = window.requestAnimationFrame(resize);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [label, lat, lng]);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return <div className={styles.mapFallback}>Community map unavailable right now.</div>;
  }

  return <div ref={containerRef} className={styles.mapCanvas} aria-label={`${label} community map`} />;
}
