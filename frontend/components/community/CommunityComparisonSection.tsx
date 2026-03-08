"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BuilderCardData } from "./types";
import styles from "./CommunityComparisonSection.module.css";

type Props = {
  builders: BuilderCardData[];
};

type ComparisonTab = "homes" | "plans";

type PreviewState = {
  url: string;
  planName: string;
  kind: "pdf" | "image";
};

type HomesRow = {
  id: string;
  builderId: string;
  address: string;
  builderName: string;
  builderSlug?: string | null;
  planName: string;
  planId?: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  status: string;
  moveInDate: string | null;
  listingUrl: string;
  planCatalogId?: string | null;
  keepupFloorPlanId?: string | null;
  normalizedPlanName: string;
};

type FloorPlanRow = {
  id: string;
  builderId: string;
  planName: string;
  builderName: string;
  builderSlug?: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  garageCount: number | null;
  stories: number | null;
  startingPrice: number | null;
  previewUrl: string | null;
  fileUrl: string | null;
  homesCount: number;
  planCatalogId?: string | null;
  keepupFloorPlanId?: string | null;
  normalizedPlanName: string;
};

type HomesSort =
  | "price-low"
  | "price-high"
  | "sqft-low"
  | "sqft-high"
  | "beds"
  | "move-in-earliest"
  | "move-in-latest";

type PlansSort = "price-low" | "price-high" | "sqft-low" | "sqft-high" | "beds";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePlanToken(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toAddress(row: BuilderCardData["inventoryHomes"][number]): string {
  return cleanText(row.address) || cleanText(row.address1) || cleanText(row.title) || "Address coming soon";
}

function toStatusLabel(status: unknown): string {
  const normalized = cleanText(status).toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized.includes("quick move") || normalized.includes("spec")) return "Quick Move-In";
  if (normalized.includes("inventory")) return "Inventory";
  if (normalized.includes("model")) return "Model";
  if (normalized.includes("coming")) return "Coming soon";
  if (normalized.includes("available")) return "Available";
  return status ? cleanText(status) : "Unknown";
}

function toMoveInDate(home: BuilderCardData["inventoryHomes"][number]): string | null {
  const raw =
    cleanText((home as unknown as { moveInDate?: unknown }).moveInDate) ||
    cleanText((home as unknown as { availableDate?: unknown }).availableDate) ||
    cleanText((home as unknown as { estimatedCompletionDate?: unknown }).estimatedCompletionDate) ||
    cleanText((home as unknown as { completionDate?: unknown }).completionDate);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isPdfUrl(url: string): boolean {
  const cleaned = cleanText(url);
  if (!cleaned) return false;
  try {
    const parsed = new URL(cleaned, "https://buildrootz.local");
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return cleaned.toLowerCase().split("?")[0].endsWith(".pdf");
  }
}

function formatNumber(value: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "\u2014";
}

function formatCurrency(value: number | null): string {
  return typeof value === "number" ? `$${Math.round(value).toLocaleString()}` : "\u2014";
}

function parseInputNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateSortValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function safeCompare(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  const aVal = typeof a === "number" ? a : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const bVal = typeof b === "number" ? b : direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return direction === "asc" ? aVal - bVal : bVal - aVal;
}

function planMatchesHome(plan: FloorPlanRow, home: HomesRow): boolean {
  if (plan.builderId !== home.builderId) return false;

  const planTokens = new Set(
    [plan.id, plan.planCatalogId, plan.keepupFloorPlanId, plan.normalizedPlanName]
      .map((token) => normalizePlanToken(token))
      .filter(Boolean),
  );

  const homeTokens = [home.planId, home.planCatalogId, home.keepupFloorPlanId, home.normalizedPlanName]
    .map((token) => normalizePlanToken(token))
    .filter(Boolean);

  return homeTokens.some((token) => planTokens.has(token));
}

export default function CommunityComparisonSection({ builders }: Props) {
  const [activeTab, setActiveTab] = useState<ComparisonTab>("homes");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [homesPlanFilter, setHomesPlanFilter] = useState<FloorPlanRow | null>(null);

  const [homesBuilder, setHomesBuilder] = useState("all");
  const [homesMinPrice, setHomesMinPrice] = useState("");
  const [homesMaxPrice, setHomesMaxPrice] = useState("");
  const [homesMinSqft, setHomesMinSqft] = useState("");
  const [homesMaxSqft, setHomesMaxSqft] = useState("");
  const [homesBeds, setHomesBeds] = useState("all");
  const [homesStatus, setHomesStatus] = useState("all");
  const [homesSort, setHomesSort] = useState<HomesSort>("price-low");

  const [plansBuilder, setPlansBuilder] = useState("all");
  const [plansMinPrice, setPlansMinPrice] = useState("");
  const [plansMaxPrice, setPlansMaxPrice] = useState("");
  const [plansMinSqft, setPlansMinSqft] = useState("");
  const [plansMaxSqft, setPlansMaxSqft] = useState("");
  const [plansBeds, setPlansBeds] = useState("all");
  const [plansGarage, setPlansGarage] = useState("all");
  const [plansStories, setPlansStories] = useState("all");
  const [plansSort, setPlansSort] = useState<PlansSort>("price-low");

  useEffect(() => {
    if (!preview || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  const homesRows = useMemo(() => {
    const rows: HomesRow[] = [];
    builders.forEach((builder) => {
      const builderId = cleanText(builder.id) || "unknown-builder";
      const builderName = cleanText(builder.name) || "Unknown builder";
      const builderSlug = cleanText(builder.slug) || null;
      const homes = Array.isArray(builder.inventoryHomes) ? builder.inventoryHomes : [];
      homes.forEach((home, index) => {
        const planName = cleanText(home.planName) || "\u2014";
        const normalizedPlanName = normalizePlanToken(planName);
        rows.push({
          id: cleanText(home.id) || `${builder.id}-home-${index + 1}`,
          builderId,
          address: toAddress(home),
          builderName,
          builderSlug,
          planName,
          planId: cleanText((home as unknown as { planId?: unknown }).planId) || null,
          beds: toNumeric(home.beds),
          baths: toNumeric(home.baths),
          sqft: toNumeric(home.sqft),
          price: toNumeric(home.price),
          status: toStatusLabel(home.status),
          moveInDate: toMoveInDate(home),
          listingUrl: cleanText(home.id) ? `/listing/${home.id}` : "",
          planCatalogId: cleanText(home.planCatalogId) || null,
          keepupFloorPlanId: cleanText(home.keepupFloorPlanId) || null,
          normalizedPlanName,
        });
      });
    });
    return rows;
  }, [builders]);

  const planRows = useMemo(() => {
    const rows: FloorPlanRow[] = [];
    builders.forEach((builder) => {
      const builderId = cleanText(builder.id) || "unknown-builder";
      const builderName = cleanText(builder.name) || "Unknown builder";
      const builderSlug = cleanText(builder.slug) || null;
      const plans = Array.isArray(builder.plans) ? builder.plans : [];
      const homes = homesRows.filter((home) => home.builderId === builderId);

      plans.forEach((plan, index) => {
        const planName = cleanText(plan.name) || "Plan";
        const normalizedPlanName = normalizePlanToken(planName);
        const row: FloorPlanRow = {
          id: cleanText(plan.id) || `${builder.id}-plan-${index + 1}`,
          builderId,
          planName,
          builderName,
          builderSlug,
          beds: toNumeric(plan.beds),
          baths: toNumeric(plan.baths),
          sqft: toNumeric(plan.sqft),
          garageCount: toNumeric(plan.garageCount),
          stories: toNumeric(plan.stories),
          startingPrice: toNumeric(plan.basePriceFrom),
          previewUrl: cleanText(plan.previewUrl) || null,
          fileUrl: cleanText(plan.fileUrl) || null,
          homesCount: 0,
          planCatalogId: cleanText(plan.planCatalogId) || null,
          keepupFloorPlanId: cleanText(plan.keepupFloorPlanId) || null,
          normalizedPlanName,
        };
        row.homesCount = homes.filter((home) => planMatchesHome(row, home)).length;
        rows.push(row);
      });
    });
    return rows;
  }, [builders, homesRows]);

  const builderOptions = useMemo(
    () =>
      builders
        .map((builder) => ({
          id: cleanText(builder.id),
          name: cleanText(builder.name) || "Unknown builder",
        }))
        .filter((builder) => Boolean(builder.id))
        .sort((a, b) => {
          const byName = a.name.localeCompare(b.name);
          return byName !== 0 ? byName : a.id.localeCompare(b.id);
        }),
    [builders],
  );

  const homesBedsOptions = useMemo(
    () => Array.from(new Set(homesRows.map((row) => row.beds).filter((v): v is number => typeof v === "number"))).sort((a, b) => a - b),
    [homesRows],
  );

  const homesStatusOptions = useMemo(
    () => Array.from(new Set(homesRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [homesRows],
  );

  const plansBedsOptions = useMemo(
    () => Array.from(new Set(planRows.map((row) => row.beds).filter((v): v is number => typeof v === "number"))).sort((a, b) => a - b),
    [planRows],
  );

  const plansGarageOptions = useMemo(
    () => Array.from(new Set(planRows.map((row) => row.garageCount).filter((v): v is number => typeof v === "number"))).sort((a, b) => a - b),
    [planRows],
  );

  const plansStoryOptions = useMemo(
    () => Array.from(new Set(planRows.map((row) => row.stories).filter((v): v is number => typeof v === "number"))).sort((a, b) => a - b),
    [planRows],
  );

  const filteredHomes = useMemo(() => {
    const minPrice = parseInputNumber(homesMinPrice);
    const maxPrice = parseInputNumber(homesMaxPrice);
    const minSqft = parseInputNumber(homesMinSqft);
    const maxSqft = parseInputNumber(homesMaxSqft);

    const rows = homesRows.filter((row) => {
      if (homesBuilder !== "all" && row.builderId !== homesBuilder) return false;
      if (homesStatus !== "all" && row.status !== homesStatus) return false;
      if (homesBeds !== "all" && row.beds !== Number(homesBeds)) return false;
      if (minPrice !== null && (row.price === null || row.price < minPrice)) return false;
      if (maxPrice !== null && (row.price === null || row.price > maxPrice)) return false;
      if (minSqft !== null && (row.sqft === null || row.sqft < minSqft)) return false;
      if (maxSqft !== null && (row.sqft === null || row.sqft > maxSqft)) return false;
      if (homesPlanFilter && !planMatchesHome(homesPlanFilter, row)) return false;
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (homesSort) {
        case "price-low":
          return safeCompare(a.price, b.price, "asc");
        case "price-high":
          return safeCompare(a.price, b.price, "desc");
        case "sqft-low":
          return safeCompare(a.sqft, b.sqft, "asc");
        case "sqft-high":
          return safeCompare(a.sqft, b.sqft, "desc");
        case "beds":
          return safeCompare(a.beds, b.beds, "desc");
        case "move-in-earliest":
          return toDateSortValue(a.moveInDate) - toDateSortValue(b.moveInDate);
        case "move-in-latest":
          return toDateSortValue(b.moveInDate) - toDateSortValue(a.moveInDate);
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    homesRows,
    homesBuilder,
    homesStatus,
    homesBeds,
    homesMinPrice,
    homesMaxPrice,
    homesMinSqft,
    homesMaxSqft,
    homesSort,
    homesPlanFilter,
  ]);

  const filteredPlans = useMemo(() => {
    const minPrice = parseInputNumber(plansMinPrice);
    const maxPrice = parseInputNumber(plansMaxPrice);
    const minSqft = parseInputNumber(plansMinSqft);
    const maxSqft = parseInputNumber(plansMaxSqft);

    const rows = planRows.filter((row) => {
      if (plansBuilder !== "all" && row.builderId !== plansBuilder) return false;
      if (plansBeds !== "all" && row.beds !== Number(plansBeds)) return false;
      if (plansGarage !== "all" && row.garageCount !== Number(plansGarage)) return false;
      if (plansStories !== "all" && row.stories !== Number(plansStories)) return false;
      if (minPrice !== null && (row.startingPrice === null || row.startingPrice < minPrice)) return false;
      if (maxPrice !== null && (row.startingPrice === null || row.startingPrice > maxPrice)) return false;
      if (minSqft !== null && (row.sqft === null || row.sqft < minSqft)) return false;
      if (maxSqft !== null && (row.sqft === null || row.sqft > maxSqft)) return false;
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (plansSort) {
        case "price-low":
          return safeCompare(a.startingPrice, b.startingPrice, "asc");
        case "price-high":
          return safeCompare(a.startingPrice, b.startingPrice, "desc");
        case "sqft-low":
          return safeCompare(a.sqft, b.sqft, "asc");
        case "sqft-high":
          return safeCompare(a.sqft, b.sqft, "desc");
        case "beds":
          return safeCompare(a.beds, b.beds, "desc");
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    planRows,
    plansBuilder,
    plansBeds,
    plansGarage,
    plansStories,
    plansMinPrice,
    plansMaxPrice,
    plansMinSqft,
    plansMaxSqft,
    plansSort,
  ]);

  const openPlanPreview = (row: FloorPlanRow) => {
    const url = row.previewUrl || row.fileUrl;
    if (!url) return;
    setPreview({
      url,
      planName: row.planName,
      kind: isPdfUrl(url) ? "pdf" : "image",
    });
  };

  const viewHomesForPlan = (row: FloorPlanRow) => {
    setHomesPlanFilter(row);
    setActiveTab("homes");
  };

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <h2 className={styles.header}>Compare in This Community</h2>
        <div className={styles.tabs} role="tablist" aria-label="Community comparison tabs">
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "homes" ? styles.tabBtnActive : ""}`}
            role="tab"
            aria-selected={activeTab === "homes"}
            onClick={() => setActiveTab("homes")}
          >
            Homes
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "plans" ? styles.tabBtnActive : ""}`}
            role="tab"
            aria-selected={activeTab === "plans"}
            onClick={() => setActiveTab("plans")}
          >
            Floor Plans
          </button>
        </div>
      </div>

      <div className={styles.card}>
        {activeTab === "homes" ? (
          <>
            <div className={styles.filters}>
              <label className={styles.filterField}>
                <span>Builder</span>
                <select value={homesBuilder} onChange={(event) => setHomesBuilder(event.target.value)}>
                  <option value="all">All builders</option>
                  {builderOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Min price</span>
                <input value={homesMinPrice} onChange={(event) => setHomesMinPrice(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Max price</span>
                <input value={homesMaxPrice} onChange={(event) => setHomesMaxPrice(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Min sqft</span>
                <input value={homesMinSqft} onChange={(event) => setHomesMinSqft(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Max sqft</span>
                <input value={homesMaxSqft} onChange={(event) => setHomesMaxSqft(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Beds</span>
                <select value={homesBeds} onChange={(event) => setHomesBeds(event.target.value)}>
                  <option value="all">Any</option>
                  {homesBedsOptions.map((beds) => (
                    <option key={beds} value={String(beds)}>{beds}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Status</span>
                <select value={homesStatus} onChange={(event) => setHomesStatus(event.target.value)}>
                  <option value="all">Any</option>
                  {homesStatusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Sort</span>
                <select value={homesSort} onChange={(event) => setHomesSort(event.target.value as HomesSort)}>
                  <option value="price-low">Price low to high</option>
                  <option value="price-high">Price high to low</option>
                  <option value="sqft-low">Sqft low to high</option>
                  <option value="sqft-high">Sqft high to low</option>
                  <option value="beds">Beds</option>
                  <option value="move-in-earliest">Earliest move-in</option>
                  <option value="move-in-latest">Latest move-in</option>
                </select>
              </label>
            </div>

            {homesPlanFilter ? (
              <div className={styles.filterChipRow}>
                <div className={styles.filterChip}>
                  <span>Filtered by plan: {homesPlanFilter.planName}</span>
                  <button type="button" onClick={() => setHomesPlanFilter(null)} aria-label="Clear plan filter">x</button>
                </div>
              </div>
            ) : null}

            <p className={styles.resultCount}>Showing {filteredHomes.length} {filteredHomes.length === 1 ? "home" : "homes"}</p>

            {filteredHomes.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Builder</th>
                      <th>Plan</th>
                      <th>Beds</th>
                      <th>Baths</th>
                      <th>Sqft</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Move-in</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHomes.map((row) => (
                      <tr key={row.id}>
                        <td>{row.address}</td>
                        <td>{row.builderName}</td>
                        <td>{row.planName}</td>
                        <td>{formatNumber(row.beds)}</td>
                        <td>{formatNumber(row.baths)}</td>
                        <td>{row.sqft !== null ? `${row.sqft.toLocaleString()} sqft` : "\u2014"}</td>
                        <td>{formatCurrency(row.price)}</td>
                        <td>{row.status || "\u2014"}</td>
                        <td>{row.moveInDate ? new Date(row.moveInDate).toLocaleDateString() : "\u2014"}</td>
                        <td>
                          {row.listingUrl ? (
                            <Link href={row.listingUrl} className={styles.actionLink}>View listing</Link>
                          ) : (
                            "\u2014"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyState}>No homes match these filters.</p>
            )}
          </>
        ) : (
          <>
            <div className={styles.filters}>
              <label className={styles.filterField}>
                <span>Builder</span>
                <select value={plansBuilder} onChange={(event) => setPlansBuilder(event.target.value)}>
                  <option value="all">All builders</option>
                  {builderOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Min price</span>
                <input value={plansMinPrice} onChange={(event) => setPlansMinPrice(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Max price</span>
                <input value={plansMaxPrice} onChange={(event) => setPlansMaxPrice(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Min sqft</span>
                <input value={plansMinSqft} onChange={(event) => setPlansMinSqft(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Max sqft</span>
                <input value={plansMaxSqft} onChange={(event) => setPlansMaxSqft(event.target.value)} placeholder="Any" inputMode="numeric" />
              </label>
              <label className={styles.filterField}>
                <span>Beds</span>
                <select value={plansBeds} onChange={(event) => setPlansBeds(event.target.value)}>
                  <option value="all">Any</option>
                  {plansBedsOptions.map((beds) => (
                    <option key={beds} value={String(beds)}>{beds}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Garage</span>
                <select value={plansGarage} onChange={(event) => setPlansGarage(event.target.value)}>
                  <option value="all">Any</option>
                  {plansGarageOptions.map((garage) => (
                    <option key={garage} value={String(garage)}>{garage}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Stories</span>
                <select value={plansStories} onChange={(event) => setPlansStories(event.target.value)}>
                  <option value="all">Any</option>
                  {plansStoryOptions.map((stories) => (
                    <option key={stories} value={String(stories)}>{stories}</option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span>Sort</span>
                <select value={plansSort} onChange={(event) => setPlansSort(event.target.value as PlansSort)}>
                  <option value="price-low">Starting price low to high</option>
                  <option value="price-high">Starting price high to low</option>
                  <option value="sqft-low">Sqft low to high</option>
                  <option value="sqft-high">Sqft high to low</option>
                  <option value="beds">Beds</option>
                </select>
              </label>
            </div>

            <p className={styles.resultCount}>Showing {filteredPlans.length} {filteredPlans.length === 1 ? "floor plan" : "floor plans"}</p>

            {filteredPlans.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Builder</th>
                      <th>Beds</th>
                      <th>Baths</th>
                      <th>Sqft</th>
                      <th>Garage</th>
                      <th>Stories</th>
                      <th>Starting Price</th>
                      <th>Homes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlans.map((row) => {
                      const canPreview = Boolean(row.previewUrl || row.fileUrl);
                      return (
                        <tr key={`${row.builderId}-${row.id}`}>
                          <td>{row.planName}</td>
                          <td>{row.builderName}</td>
                          <td>{formatNumber(row.beds)}</td>
                          <td>{formatNumber(row.baths)}</td>
                          <td>{row.sqft !== null ? `${row.sqft.toLocaleString()} sqft` : "\u2014"}</td>
                          <td>{row.garageCount !== null ? `${row.garageCount} car` : "\u2014"}</td>
                          <td>{row.stories !== null ? `${row.stories} ${row.stories === 1 ? "story" : "stories"}` : "\u2014"}</td>
                          <td>{row.startingPrice !== null ? `From ${formatCurrency(row.startingPrice)}` : "From \u2014"}</td>
                          <td>{row.homesCount.toLocaleString()}</td>
                          <td>
                            <div className={styles.actionsCell}>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => openPlanPreview(row)}
                                disabled={!canPreview}
                                title={canPreview ? "Preview floor plan" : "Preview not available"}
                              >
                                Preview floor plan
                              </button>
                              <button type="button" className={styles.secondaryBtn} onClick={() => viewHomesForPlan(row)}>
                                View homes
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyState}>No floor plans match these filters.</p>
            )}
          </>
        )}
      </div>

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
