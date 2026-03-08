import type { ReactNode } from "react";
import type { PublicHome } from "../../types/public";

export type CommunityHeaderBadge = {
  label: string;
  value: string;
};

export type CommunityOverviewMetric = {
  label: string;
  value: string;
};

export type BuilderPlanCard = {
  id: string;
  name: string;
  specs: string;
  fromPrice: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  basePriceFrom?: number | null;
  garageCount?: number | null;
  stories?: number | null;
  heroImageUrl?: string | null;
  previewUrl?: string | null;
  fileUrl?: string | null;
  planCatalogId?: string | null;
  keepupFloorPlanId?: string | null;
};

export type BuilderCardMetric = {
  label: string;
  value: string;
};

export type BuilderCardData = {
  id: string;
  name: string;
  logoUrl?: string | null;
  slug?: string | null;
  modelAddress?: string | null;
  community?: {
    name?: string | null;
    slug?: string | null;
    city?: string | null;
    state?: string | null;
    mapImage?: string | null;
  };
  metrics: BuilderCardMetric[];
  plans: BuilderPlanCard[];
  inventoryHomes: PublicHome[];
};

export type InventoryCard = {
  id: string;
  title: string;
  subtitle: string;
  cta?: ReactNode;
};

export type DetailStat = {
  label: string;
  value: string;
};
