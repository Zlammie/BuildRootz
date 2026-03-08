"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import NavBar from "../../components/NavBar";
import { useAuth } from "../../components/AuthProvider";
import type { PublicHome, PublicCommunity } from "../../types/public";
import { summarizeFilters } from "../../lib/searchSummary";
import styles from "./page.module.css";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Section = "homes" | "communities" | "searches";

export default function SavedPage() {
  const router = useRouter();
  const {
    user,
    loading,
    savedHomes,
    savedSearches,
    counts,
    toggleSavedHome,
    deleteSavedSearch,
    savedCommunities,
    toggleSavedCommunity,
    authError,
  } = useAuth();

  const [localError, setLocalError] = useState<string | null>(null);
  const [homeDetails, setHomeDetails] = useState<Record<string, PublicHome>>({});
  const [homesLoading, setHomesLoading] = useState(false);
  const [communityDetails, setCommunityDetails] = useState<Record<string, PublicCommunity>>({});
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("homes");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadHomes = async () => {
      if (!savedHomes.length) {
        setHomeDetails({});
        return;
      }
      setHomesLoading(true);
      setLocalError(null);
      try {
        const res = await fetch(`/api/public-homes?ids=${encodeURIComponent(savedHomes.join(","))}`);
        if (!res.ok) {
          throw new Error("Unable to load saved home details.");
        }
        const data = await res.json();
        const map: Record<string, PublicHome> = {};
        (data.homes as PublicHome[] | undefined)?.forEach((home) => {
          map[home.id] = home;
        });
        setHomeDetails(map);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Unable to load saved home details.");
      } finally {
        setHomesLoading(false);
      }
    };
    loadHomes();
  }, [savedHomes]);

  useEffect(() => {
    const loadCommunities = async () => {
      if (!savedCommunities.length) {
        setCommunityDetails({});
        return;
      }
      setCommunitiesLoading(true);
      setLocalError(null);
      try {
        const res = await fetch(
          `/api/public-communities?ids=${encodeURIComponent(savedCommunities.join(","))}`,
        );
        if (!res.ok) {
          throw new Error("Unable to load saved communities.");
        }
        const data = await res.json();
        const map: Record<string, PublicCommunity> = {};
        (data.communities as PublicCommunity[] | undefined)?.forEach((community) => {
          map[community.id] = community;
        });
        setCommunityDetails(map);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Unable to load saved communities.");
      } finally {
        setCommunitiesLoading(false);
      }
    };
    loadCommunities();
  }, [savedCommunities]);

  const savedFiltersPreview = useMemo(
    () =>
      savedSearches.map((search) => ({
        id: search._id,
        name: search.name,
        filters: summarizeFilters(search.filters || {}),
        createdAt: search.createdAt ? new Date(search.createdAt).toLocaleDateString() : "",
      })),
    [savedSearches],
  );

  const handleDeleteSearch = async (id: string) => {
    try {
      await deleteSavedSearch(id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not delete saved search.");
    }
  };

  const formatPrice = (price?: number | null) =>
    price === null || price === undefined ? "Price on request" : priceFormatter.format(price);

  const locationLine = (home?: PublicHome) => {
    if (!home) return "";
    const cityState = [home.city, home.state].filter(Boolean).join(", ");
    if (home.address) {
      return `${home.address}${cityState ? `, ${cityState}` : ""}`;
    }
    return cityState;
  };

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Saved</p>
            <h1>Saved homes & alerts</h1>
            <p className={styles.subhead}>
              Review homes you&apos;ve favorited and the saved searches powering your alerts.
            </p>
          </div>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabButton} ${activeSection === "homes" ? styles.tabActive : ""}`}
              onClick={() => setActiveSection("homes")}
            >
              Saved homes <span className={styles.tabCount}>{counts.savedHomes}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeSection === "communities" ? styles.tabActive : ""}`}
              onClick={() => setActiveSection("communities")}
            >
              Saved communities <span className={styles.tabCount}>{counts.savedCommunities}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeSection === "searches" ? styles.tabActive : ""}`}
              onClick={() => setActiveSection("searches")}
            >
              Saved searches <span className={styles.tabCount}>{counts.savedSearches}</span>
            </button>
          </div>
        </header>

        {(authError || localError) && (
          <div className={styles.errorBox} role="alert">
            {authError || localError}
          </div>
        )}

        <div className={styles.grid}>
          {activeSection === "homes" && (
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>Saved homes</p>
                  <h3>Homes you&apos;ve favorited</h3>
                </div>
                <span className={styles.badge}>{savedHomes.length}</span>
              </div>
              {homesLoading && <p className={styles.loading}>Loading saved homes...</p>}
              {savedHomes.length === 0 ? (
                <p className={styles.empty}>You haven&apos;t saved any homes yet.</p>
              ) : (
                <ul className={styles.list}>
                  {savedHomes.map((id) => {
                    const home = homeDetails[id];
                    const hero = home?.heroImage || home?.heroImages?.[0];
                    const location = locationLine(home) || "Location coming soon";
                    return (
                      <li key={id} className={styles.listItem}>
                        <Link href={`/listing/${id}`} className={styles.savedCard}>
                          <div
                            className={styles.savedMedia}
                            style={hero ? { backgroundImage: `url(${hero})` } : undefined}
                          />
                          <div className={styles.savedBody}>
                            <p className={styles.listTitle}>{home?.title || `Listing ${id}`}</p>
                            <p className={styles.savedPrice}>{formatPrice(home?.price)}</p>
                            <p className={styles.listMeta}>
                              {home?.beds ?? "N/A"} bd | {home?.baths ?? "N/A"} ba |{" "}
                              {home?.sqft ? home.sqft.toLocaleString() : "N/A"} sqft
                            </p>
                            <p className={styles.listMeta}>{location}</p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => toggleSavedHome(id)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {activeSection === "communities" && (
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>Saved communities</p>
                  <h3>Communities you follow</h3>
                </div>
                <span className={styles.badge}>{savedCommunities.length}</span>
              </div>
              {communitiesLoading && <p className={styles.loading}>Loading saved communities...</p>}
              {savedCommunities.length === 0 ? (
                <p className={styles.empty}>You haven&apos;t saved any communities yet.</p>
              ) : (
                <ul className={styles.list}>
                {savedCommunities.map((id) => {
                  const community = communityDetails[id];
                  const location = [community?.city, community?.state].filter(Boolean).join(", ");
                  return (
                    <li key={id} className={styles.listItem}>
                      <Link href={`/community?communityId=${id}`} className={styles.savedCard}>
                          <div className={styles.savedBody}>
                            <p className={styles.listTitle}>{community?.name || `Community ${id}`}</p>
                            <p className={styles.listMeta}>{location || "Location coming soon"}</p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => toggleSavedCommunity(id)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {activeSection === "searches" && (
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>Saved searches</p>
                  <h3>Alerts for new matches</h3>
                </div>
                <span className={styles.badge}>{savedSearches.length}</span>
              </div>
              {savedSearches.length === 0 ? (
                <p className={styles.empty}>
                  No saved searches yet. Set filters on the browse page and tap "Save search".
                </p>
              ) : (
                <ul className={styles.list}>
                  {savedFiltersPreview.map((search) => (
                    <li key={search.id} className={styles.listItem}>
                      <div>
                        <p className={styles.listTitle}>{search.name}</p>
                        <p className={styles.listMeta}>{search.filters}</p>
                        {search.createdAt && (
                          <p className={styles.listMeta}>Saved on {search.createdAt}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => handleDeleteSearch(search.id)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
