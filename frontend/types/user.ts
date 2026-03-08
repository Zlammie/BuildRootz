export type AlertPreferences = {
  emailAlertsEnabled: boolean;
  frequency: "daily" | "weekly";
  priceDrop: boolean;
  newMatches: boolean;
};

export type User = {
  id: string;
  email: string;
  emailVerified?: boolean;
  roles?: string[];
  createdAt?: string;
  lastLoginAt?: string;
  alertPreferences?: AlertPreferences;
};

export type SavedHome = {
  _id?: string;
  listingId: string;
  createdAt?: string;
};

export type SavedCommunity = {
  _id?: string;
  publicCommunityId?: string;
  communityId?: string;
  keepupCommunityId?: string;
  communitySlug?: string;
  createdAt?: string;
};

export type SavedSearch = {
  _id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt?: string;
  lastNotifiedAt?: string | null;
};
