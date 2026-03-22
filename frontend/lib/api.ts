import type { AlertPreferences, SavedSearch, User } from "../types/user";
import type {
  WorkspaceNote,
  WorkspaceStorageSnapshot,
  WorkspaceSubjectState,
  WorkspaceSubjectType,
} from "./workspace/types";

function normalizeApiBase(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  if (trimmed.startsWith("//")) {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}${trimmed}`.replace(/\/$/, "");
    }
    return `https:${trimmed}`.replace(/\/$/, "");
  }

  if (trimmed.startsWith("/")) {
    return trimmed.replace(/\/$/, "");
  }

  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed);
  return `${isLocalHost ? "http" : "https"}://${trimmed}`.replace(/\/$/, "");
}

function resolveApiBase(): string {
  const configuredBase = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE_URL || "");
  if (configuredBase) {
    return configuredBase;
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3001";
    }
    return "";
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:3001" : "";
}

const API_BASE = resolveApiBase();

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const message = data?.error || data?.message || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function register(params: {
  email: string;
  password: string;
  savedListingIds?: string[];
  savedCommunityIds?: string[];
}): Promise<{ user: User; counts?: { savedHomes: number; savedCommunities?: number; savedSearches: number } }> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function login(params: {
  email: string;
  password: string;
  savedListingIds?: string[];
  savedCommunityIds?: string[];
}): Promise<{ user: User; counts?: { savedHomes: number; savedCommunities?: number; savedSearches: number } }> {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function logout(): Promise<{ success: boolean }> {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<{
  user: User;
  counts: { savedHomes: number; savedCommunities?: number; savedSearches: number };
}> {
  return apiFetch("/api/me");
}

export async function getSavedHomes(): Promise<{
  savedHomes: Array<{ _id?: string; listingId: string; createdAt?: string }>;
}> {
  return apiFetch("/api/me/saved-homes");
}

export async function addSavedHome(listingId: string) {
  return apiFetch("/api/me/saved-homes", {
    method: "POST",
    body: JSON.stringify({ listingId }),
  });
}

export async function mergeSavedHomes(listingIds: string[]) {
  return apiFetch("/api/me/saved-homes", {
    method: "POST",
    body: JSON.stringify({ listingIds }),
  });
}

export async function deleteSavedHome(listingId: string) {
  return apiFetch(`/api/me/saved-homes/${encodeURIComponent(listingId)}`, {
    method: "DELETE",
  });
}

export async function getSavedCommunities(): Promise<{
  savedCommunities: Array<{
    _id?: string;
    publicCommunityId?: string;
    communityId?: string;
    keepupCommunityId?: string;
    communitySlug?: string;
    createdAt?: string;
  }>;
}> {
  return apiFetch("/api/me/saved-communities");
}

export async function addSavedCommunity(communityId: string) {
  return apiFetch("/api/me/saved-communities", {
    method: "POST",
    body: JSON.stringify({ publicCommunityId: communityId, communityId }),
  });
}

export async function mergeSavedCommunities(communityIds: string[]) {
  return apiFetch("/api/me/saved-communities", {
    method: "POST",
    body: JSON.stringify({ communityIds }),
  });
}

export async function deleteSavedCommunity(communityId: string) {
  return apiFetch(`/api/me/saved-communities/${encodeURIComponent(communityId)}`, {
    method: "DELETE",
  });
}

export async function getPublicCommunitiesByIds(ids: string[]) {
  return apiFetch<{ communities: Array<{ id: string; name?: string; city?: string; state?: string }> }>(
    `/api/public-communities?ids=${encodeURIComponent(ids.join(","))}`,
  );
}

export async function getSavedSearches(): Promise<{ savedSearches: SavedSearch[] }> {
  return apiFetch("/api/me/saved-searches");
}

export async function createSavedSearch(params: {
  name: string;
  filters: Record<string, unknown>;
}) {
  return apiFetch<{ savedSearch: SavedSearch }>("/api/me/saved-searches", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function deleteSavedSearch(id: string) {
  return apiFetch(`/api/me/saved-searches/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function updateAlerts(prefs: Partial<AlertPreferences>) {
  return apiFetch<{ user: User }>("/api/me/alerts", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

export async function getWorkspaceSnapshot(): Promise<{ snapshot: WorkspaceStorageSnapshot }> {
  return apiFetch("/api/me/workspace");
}

export async function getWorkspaceEntry(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
): Promise<{ entry: WorkspaceSubjectState | null }> {
  return apiFetch(
    `/api/me/workspace/entries/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`,
  );
}

export async function upsertWorkspaceEntry(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
  subjectState: WorkspaceSubjectState,
): Promise<{ entry: WorkspaceSubjectState | null }> {
  return apiFetch(
    `/api/me/workspace/entries/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`,
    {
      method: "PUT",
      body: JSON.stringify(subjectState),
    },
  );
}

export async function deleteWorkspaceEntry(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
): Promise<{ removed: boolean }> {
  return apiFetch(
    `/api/me/workspace/entries/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function listWorkspaceNotes(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
): Promise<{ notes: WorkspaceNote[] }> {
  return apiFetch(
    `/api/me/workspace/notes/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`,
  );
}

export async function createWorkspaceNote(
  subjectType: WorkspaceSubjectType,
  subjectId: string,
  payload: {
    text: string;
    id?: string;
    builderId?: string;
    communityId?: string;
    listingId?: string;
    floorPlanId?: string;
  },
): Promise<{ note: WorkspaceNote }> {
  return apiFetch(
    `/api/me/workspace/notes/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateWorkspaceNote(
  noteId: string,
  payload: { text: string },
): Promise<{ note: WorkspaceNote }> {
  return apiFetch(`/api/me/workspace/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkspaceNote(noteId: string): Promise<{ removed: boolean }> {
  return apiFetch(`/api/me/workspace/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
}
