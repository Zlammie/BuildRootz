"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../lib/api";
import {
  clearLocalSavedHomes,
  getLocalSavedHomes,
  toggleLocalSavedHome,
} from "../lib/savedHomesStorage";
import {
  clearLocalSavedCommunities,
  getLocalSavedCommunities,
  toggleLocalSavedCommunity,
} from "../lib/savedCommunitiesStorage";
import { importAnonymousWorkspaceForAuthenticatedUser } from "../lib/workspace/authImport";
import type { AlertPreferences, SavedSearch, User } from "../types/user";

type Counts = { savedHomes: number; savedCommunities: number; savedSearches: number };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authError: string | null;
  savedHomes: string[];
  savedCommunities: string[];
  savedSearches: SavedSearch[];
  counts: Counts;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleSavedHome: (listingId: string) => Promise<boolean>;
  toggleSavedCommunity: (communityId: string) => Promise<boolean>;
  refreshSavedHomes: () => Promise<void>;
  refreshSavedCommunities: () => Promise<void>;
  saveSearch: (name: string, filters: Record<string, unknown>) => Promise<void>;
  deleteSavedSearch: (id: string) => Promise<void>;
  updateAlerts: (prefs: Partial<AlertPreferences>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const sessionCookieName = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "br_session";

  const hasSessionCookie = () => {
    if (typeof document === "undefined") return false;
    return document.cookie.split(";").some((c) => c.trim().startsWith(`${sessionCookieName}=`));
  };

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savedHomes, setSavedHomes] = useState<string[]>([]);
  const [savedCommunities, setSavedCommunities] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [counts, setCounts] = useState<Counts>({ savedHomes: 0, savedCommunities: 0, savedSearches: 0 });
  const normalizeCommunityIds = (
    items: Array<{ publicCommunityId?: string; communityId?: string }>,
  ): string[] =>
    items
      .map((c) => c.publicCommunityId || c.communityId)
      .filter((id): id is string => Boolean(id));

  useEffect(() => {
    const localHomes = getLocalSavedHomes();
    const localCommunities = getLocalSavedCommunities();
    setSavedHomes(localHomes);
    setSavedCommunities(localCommunities);
    setCounts((prev) => ({
      ...prev,
      savedHomes: localHomes.length,
      savedCommunities: localCommunities.length,
    }));

    const bootstrap = async () => {
      if (!hasSessionCookie()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        const { user: fetchedUser, counts: fetchedCounts } = me;
        setUser(fetchedUser);
        setCounts({
          savedHomes: fetchedCounts?.savedHomes ?? 0,
          savedCommunities: fetchedCounts?.savedCommunities ?? 0,
          savedSearches: fetchedCounts?.savedSearches ?? 0,
        });
        const [homesRes, communitiesRes, searchesRes] = await Promise.all([
          api.getSavedHomes(),
          api.getSavedCommunities(),
          api.getSavedSearches(),
        ]);
        const ids = (homesRes.savedHomes || []).map((h) => h.listingId);
        const communityIds = normalizeCommunityIds(communitiesRes.savedCommunities || []);
        setSavedHomes(ids);
        setSavedCommunities(communityIds);
        setSavedSearches(searchesRes.savedSearches || []);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const userId = typeof user?.id === "string" ? user.id.trim() : "";
    if (!userId) return;
    void importAnonymousWorkspaceForAuthenticatedUser(userId).catch(() => {
      // Keep auth flow resilient if workspace import fails transiently.
    });
  }, [user?.id]);

  const refreshSavedHomes = async () => {
    if (!user) {
      const localHomes = getLocalSavedHomes();
      setSavedHomes(localHomes);
      setCounts((prev) => ({ ...prev, savedHomes: localHomes.length }));
      return;
    }
    const res = await api.getSavedHomes();
    const ids = (res.savedHomes || []).map((h) => h.listingId);
    setSavedHomes(ids);
    setCounts((prev) => ({ ...prev, savedHomes: ids.length }));
  };

  const refreshSavedCommunities = async () => {
    if (!user) {
      const localCommunities = getLocalSavedCommunities();
      setSavedCommunities(localCommunities);
      setCounts((prev) => ({ ...prev, savedCommunities: localCommunities.length }));
      return;
    }
    const res = await api.getSavedCommunities();
    const ids = normalizeCommunityIds(res.savedCommunities || []);
    setSavedCommunities(ids);
    setCounts((prev) => ({ ...prev, savedCommunities: ids.length }));
  };

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const localSaved = getLocalSavedHomes();
    const localSavedCommunities = getLocalSavedCommunities();
    try {
      const res = await api.login({
        email,
        password,
        savedListingIds: localSaved,
        savedCommunityIds: localSavedCommunities,
      });
      setUser(res.user);

      if (localSaved.length) {
        clearLocalSavedHomes();
      }
      if (localSavedCommunities.length) {
        clearLocalSavedCommunities();
      }

      const [homesRes, communitiesRes, searchesRes] = await Promise.all([
        api.getSavedHomes(),
        api.getSavedCommunities(),
        api.getSavedSearches(),
      ]);
      const ids = (homesRes.savedHomes || []).map((h) => h.listingId);
      const communityIds = normalizeCommunityIds(communitiesRes.savedCommunities || []);
      const savedSearchesFetched = searchesRes.savedSearches || [];
      setSavedHomes(ids);
      setSavedCommunities(communityIds);
      setSavedSearches(savedSearchesFetched);
      setCounts({
        savedHomes: ids.length,
        savedCommunities: communityIds.length,
        savedSearches: savedSearchesFetched.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to log in.";
      setAuthError(message);
      throw err;
    }
  };

  const signup = async (email: string, password: string) => {
    setAuthError(null);
    const localSaved = getLocalSavedHomes();
    const localSavedCommunities = getLocalSavedCommunities();
    try {
      const res = await api.register({
        email,
        password,
        savedListingIds: localSaved,
        savedCommunityIds: localSavedCommunities,
      });
      setUser(res.user);

      if (localSaved.length) {
        clearLocalSavedHomes();
      }
      if (localSavedCommunities.length) {
        clearLocalSavedCommunities();
      }

      const [homesRes, communitiesRes, searchesRes] = await Promise.all([
        api.getSavedHomes(),
        api.getSavedCommunities(),
        api.getSavedSearches(),
      ]);
      const ids = (homesRes.savedHomes || []).map((h) => h.listingId);
      const communityIds = normalizeCommunityIds(communitiesRes.savedCommunities || []);
      const savedSearchesFetched = searchesRes.savedSearches || [];
      setSavedHomes(ids);
      setSavedCommunities(communityIds);
      setSavedSearches(savedSearchesFetched);
      setCounts({
        savedHomes: ids.length,
        savedCommunities: communityIds.length,
        savedSearches: savedSearchesFetched.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account.";
      setAuthError(message);
      throw err;
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setAuthError(null);
    const localHomes = getLocalSavedHomes();
    const localCommunities = getLocalSavedCommunities();
    setSavedHomes(localHomes);
    setSavedCommunities(localCommunities);
    setSavedSearches([]);
    setCounts({
      savedHomes: localHomes.length,
      savedCommunities: localCommunities.length,
      savedSearches: 0,
    });
  };

  const toggleSavedHome = async (listingId: string) => {
    if (!listingId) return false;
    setAuthError(null);
    if (!user) {
      const next = toggleLocalSavedHome(listingId);
      setSavedHomes(next);
      setCounts((prev) => ({ ...prev, savedHomes: next.length }));
      return next.includes(listingId);
    }

    let rollback: string[] = [];
    setSavedHomes((prev) => {
      rollback = prev;
      const next = prev.includes(listingId)
        ? prev.filter((id) => id !== listingId)
        : [...prev, listingId];
      setCounts((c) => ({ ...c, savedHomes: next.length }));
      return next;
    });

    const wasSaved = rollback.includes(listingId);
    try {
      if (wasSaved) {
        await api.deleteSavedHome(listingId);
      } else {
        await api.addSavedHome(listingId);
      }
      return !wasSaved;
    } catch (err) {
      setSavedHomes(rollback);
      setCounts((c) => ({ ...c, savedHomes: rollback.length }));
      setAuthError(err instanceof Error ? err.message : "Could not update saved homes.");
      return wasSaved;
    }
  };

  const toggleSavedCommunity = async (communityId: string) => {
    if (!communityId) return false;
    setAuthError(null);
    if (!user) {
      const next = toggleLocalSavedCommunity(communityId);
      setSavedCommunities(next);
      setCounts((prev) => ({ ...prev, savedCommunities: next.length }));
      return next.includes(communityId);
    }

    let rollback: string[] = [];
    setSavedCommunities((prev) => {
      rollback = prev;
      const next = prev.includes(communityId)
        ? prev.filter((id) => id !== communityId)
        : [...prev, communityId];
      setCounts((c) => ({ ...c, savedCommunities: next.length }));
      return next;
    });

    const wasSaved = rollback.includes(communityId);
    try {
      if (wasSaved) {
        await api.deleteSavedCommunity(communityId);
      } else {
        await api.addSavedCommunity(communityId);
      }
      return !wasSaved;
    } catch (err) {
      setSavedCommunities(rollback);
      setCounts((c) => ({ ...c, savedCommunities: rollback.length }));
      setAuthError(err instanceof Error ? err.message : "Could not update saved communities.");
      return wasSaved;
    }
  };

  const saveSearch = async (name: string, filters: Record<string, unknown>) => {
    if (!user) {
      throw new Error("Log in to save searches and alerts.");
    }
    const res = await api.createSavedSearch({ name, filters });
    setSavedSearches((prev) => [res.savedSearch, ...prev]);
    setCounts((prev) => ({ ...prev, savedSearches: prev.savedSearches + 1 }));
  };

  const deleteSavedSearch = async (id: string) => {
    if (!user) return;
    await api.deleteSavedSearch(id);
    setSavedSearches((prev) => prev.filter((search) => search._id !== id));
    setCounts((prev) => ({
      ...prev,
      savedSearches: Math.max(0, prev.savedSearches - 1),
    }));
  };

  const updateAlerts = async (prefs: Partial<AlertPreferences>) => {
    if (!user) {
      throw new Error("Log in to update alerts.");
    }
    const res = await api.updateAlerts(prefs);
    setUser(res.user);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      savedHomes,
      savedCommunities,
      savedSearches,
      counts,
      login,
      signup,
      logout,
      toggleSavedHome,
      toggleSavedCommunity,
      refreshSavedHomes,
      refreshSavedCommunities,
      saveSearch,
      deleteSavedSearch,
      updateAlerts,
    }),
    [user, loading, authError, savedHomes, savedCommunities, savedSearches, counts],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
