export type PublicHomeStatus = "available" | "inventory" | "comingSoon" | "model" | "unknown";

export type PublicPromo = {
  headline?: string | null;
  description?: string | null;
  disclaimer?: string | null;
};

export type CommunityPrimaryContact = {
  name?: string | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type CommunitySchools = {
  district?: string | null;
  elementary?: string | null;
  middle?: string | null;
  high?: string | null;
  text?: string | null;
};

export type CommunityRealtorIncentives = {
  enabled: boolean;
  amount?: number | string | null;
  notes?: string | null;
};

export type CommunityPidMud = {
  hasPid?: boolean | null;
  hasMud?: boolean | null;
  notes?: string | null;
};

export type CommunityDetails = {
  primaryContact: CommunityPrimaryContact;
  totalLots?: number | null;
  schools: CommunitySchools;
  hoaAmount?: number | string | null;
  hoaFrequency?: string | null;
  earnestMoney?: number | string | null;
  realtorIncentives: CommunityRealtorIncentives;
  pidMud: CommunityPidMud;
};

export type PublicFloorPlan = {
  id: string;
  name: string;
  communityId?: string | null;
  communityName?: string | null;
  communitySlug?: string | null;
  keepupFloorPlanId?: string | null;
  planCatalogId?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSize?: string | null;
  garage?: number | null;
  basePriceFrom?: number | null;
  basePriceAsOf?: string | null;
  detail?: string | null;
};

export type PublicHome = {
  id: string;
  title: string;
  companyId?: string;
  keepupBuilderId?: string;
  isActive?: boolean;
  price?: number | null;
  address?: string;
  address1?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSize?: string | null;
  garage?: number | null;
  lat?: number | null;
  lng?: number | null;
  status: PublicHomeStatus;
  tag?: string;
  builder?: string;
  builderSlug?: string;
  communityName?: string;
  communityId?: string; // deprecated
  publicCommunityId?: string;
  keepupCommunityId?: string;
  communitySlug?: string;
  keepupFloorPlanId?: string;
  planCatalogId?: string;
  published?: boolean;
  heroImage?: string;
  images?: string[];
  heroImages?: string[];
  description?: string;
  highlights?: string;
  planName?: string;
  planNumber?: string;
  floorPlanUrl?: string;
  floorPlanImage?: string;
  promo?: PublicPromo | null;
  promoMode?: "add" | "override";
  incentives?: string[];
  amenities?: string[];
  salesContact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  modelAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  schools?: {
    isd?: string;
    elementary?: string;
    middle?: string;
    high?: string;
  };
  hoaFee?: number | null;
  hoaFrequency?: string | null;
  taxRate?: number | null;
  pidFee?: number | null;
  pidFeeFrequency?: string | null;
  mudFee?: number | null;
  feeTypes?: string[];
  updatedAt?: string;
};

export type PublicCommunity = {
  id: string;
  canonicalKey?: string;
  slug?: string;
  keepupCommunityId?: string;
  name?: string;
  city?: string;
  state?: string;
  overview?: string | null;
  highlights?: string[];
  heroImageUrl?: string | null;
  imageUrls?: string[];
  hoaMonthly?: number | null;
  taxRate?: number | null;
  mudTaxRate?: number | null;
  mudFeeAmount?: number | null;
  pidFee?: number | null;
  pidFeeFrequency?: string | null;
  pid?: boolean;
  mud?: boolean;
  taxDistrict?: string | null;
  hoaIncludes?: string[];
  description?: string;
  hoa?: string;
  taxes?: string;
  dues?: string;
  promo?: PublicPromo | null;
  amenities?: string[];
  productTypes?: string[];
  builders?: string[];
  published?: boolean;
  mapImage?: string;
  primaryContact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  schools?: {
    isd?: string | null;
    elementary?: string | null;
    middle?: string | null;
    high?: string | null;
  };
  modelAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
  };
  modelAddresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
  }>;
  models?: Array<{
    id?: string | null;
    title?: string | null;
    address?: {
      street?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      label?: string | null;
    } | null;
    price?: number | string | null;
    sqft?: number | null;
    lotSize?: string | null;
  }>;
  floorPlans?: PublicFloorPlan[];
  location?: {
    lat?: number;
    lng?: number;
  };
  communityDetails?: CommunityDetails;
  updatedAt?: string;
};
