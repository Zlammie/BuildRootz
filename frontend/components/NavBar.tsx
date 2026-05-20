"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getWorkspaceAdapter } from "../lib/workspace/getWorkspaceAdapter";
import { extractWorkspaceQueueItems, sanitizeWorkspaceStorageSnapshot } from "../lib/workspace/storage";
import { subscribeWorkspaceSync } from "../lib/workspace/sync";
import styles from "./navBar.module.css";

type MobileNavIcon = "home" | "browse" | "map" | "saved" | "account";

function MobileIcon({ icon }: { icon: MobileNavIcon }) {
  if (icon === "home") {
    return (
      <svg className={styles.mobileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 11.2 12 5l7.5 6.2" />
        <path d="M6.8 10.6v8h10.4v-8" />
        <path d="M10 18.6v-5h4v5" />
      </svg>
    );
  }

  if (icon === "browse") {
    return (
      <svg className={styles.mobileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 6.5h14" />
        <path d="M5 12h14" />
        <path d="M5 17.5h9" />
      </svg>
    );
  }

  if (icon === "map") {
    return (
      <svg className={styles.mobileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 18.5 4.5 20V6L9 4.5l6 1.9L19.5 5v14L15 20.5z" />
        <path d="M9 4.5v14" />
        <path d="M15 6.4v14.1" />
      </svg>
    );
  }

  if (icon === "saved") {
    return (
      <svg className={styles.mobileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 5.5h10v14l-5-3.2-5 3.2z" />
      </svg>
    );
  }

  return (
    <svg className={styles.mobileIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c.9-3.4 3.2-5.2 6.5-5.2s5.6 1.8 6.5 5.2" />
    </svg>
  );
}

export default function NavBar() {
  const { user, logout, counts } = useAuth();
  const pathname = usePathname();
  const [currentSearch, setCurrentSearch] = useState("");
  const isAuthenticated = Boolean(user);
  const userId = typeof user?.id === "string" ? user.id : null;
  const workspaceAdapter = useMemo(
    () => getWorkspaceAdapter({ isAuthenticated, userId }),
    [isAuthenticated, userId],
  );
  const [signingOut, setSigningOut] = useState(false);
  const [workspaceQueueCount, setWorkspaceQueueCount] = useState(0);
  const queueLoadRef = useRef(0);

  const refreshWorkspaceQueueCount = useCallback(async () => {
    const requestId = queueLoadRef.current + 1;
    queueLoadRef.current = requestId;

    try {
      const snapshot = await workspaceAdapter.loadAll();
      if (queueLoadRef.current !== requestId) return;
      const sanitized = sanitizeWorkspaceStorageSnapshot(snapshot);
      setWorkspaceQueueCount(extractWorkspaceQueueItems(sanitized).length);
    } catch {
      if (queueLoadRef.current !== requestId) return;
      setWorkspaceQueueCount(0);
    }
  }, [workspaceAdapter]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    void refreshWorkspaceQueueCount();
  }, [refreshWorkspaceQueueCount]);

  useEffect(() => {
    return subscribeWorkspaceSync(() => {
      void refreshWorkspaceQueueCount();
    });
  }, [refreshWorkspaceQueueCount]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncSearch = () => setCurrentSearch(window.location.search);
    syncSearch();
    window.addEventListener("popstate", syncSearch);
    window.addEventListener("brz:navigation-state-change", syncSearch);
    return () => {
      window.removeEventListener("popstate", syncSearch);
      window.removeEventListener("brz:navigation-state-change", syncSearch);
    };
  }, [pathname]);

  const mobileListingView = new URLSearchParams(currentSearch).get("view");
  const handleMobileNavClick = (href: string) => {
    const queryIndex = href.indexOf("?");
    setCurrentSearch(queryIndex >= 0 ? href.slice(queryIndex) : "");
  };

  const mobileNavItems = [
    {
      href: "/",
      label: "Home",
      icon: "home" as const,
      active: pathname === "/",
    },
    {
      href: "/listings",
      label: "Browse",
      icon: "browse" as const,
      active: pathname === "/listings" && mobileListingView !== "map",
    },
    {
      href: "/listings?view=map",
      label: "Map",
      icon: "map" as const,
      active: pathname === "/listings" && mobileListingView === "map",
    },
    {
      href: "/saved",
      label: "Saved",
      icon: "saved" as const,
      active: pathname === "/saved",
      count: counts.savedHomes,
    },
    {
      href: user ? "/account" : "/login",
      label: "Account",
      icon: "account" as const,
      active: pathname === "/account" || pathname === "/login" || pathname === "/signup",
    },
  ];

  return (
    <>
      <div className={styles.alphaBanner} role="note">
        <div className={styles.alphaBannerInner}>
          BuildRootz is currently in Alpha. Information displayed is sourced from builders but may change.
          Please contact the builder directly to verify pricing, availability, and details.
        </div>
      </div>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logoWordmark}>
            BuildRootz
          </Link>
        </div>
        <div className={styles.navLinks}>
          <Link className={`${styles.navLink} ${styles.navLinkDesktop}`} href="/about">
            About
          </Link>
          <Link className={`${styles.navLink} ${styles.navLinkDesktop}`} href="/#resources">
            Resources
          </Link>
          <Link
            className={`${styles.navLink} ${styles.navLinkDesktop} ${styles.workspaceLink}`}
            href="/workspace"
          >
            <span>My Workspace</span>
            {workspaceQueueCount > 0 ? (
              <span className={styles.workspaceCount}>{workspaceQueueCount}</span>
            ) : null}
          </Link>
          <div className={styles.navActions}>
            {user ? (
              <>
                <Link
                  className={`${styles.navLink} ${styles.navLinkDesktop} ${styles.savedLink} ${
                    counts.savedHomes > 0 ? styles.savedLinkActive : ""
                  }`}
                  href="/saved"
                >
                  <svg className={styles.saveIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle className={styles.saveCircle} cx="12" cy="12" r="9" />
                    <path
                      className={styles.saveRoots}
                      d="M12 14.5c-.6.9-1.3 1.7-2.2 2.2M12 14.5c.6.7 1.3 1.4 2.2 1.8M12 14.5c0 1-.2 2-.4 3M12 14.5c.3.8.5 1.5.8 2.3"
                      fill="none"
                    />
                    <path
                      className={styles.saveSprout}
                      d="M12 14.5V10.8m0 0c.4-1.3 1.1-2.6 2.8-3m-2.8 3c-.5-1.2-1.3-2.3-2.8-2.6"
                      fill="none"
                    />
                  </svg>
                  <span>Saved</span>
                  <span className={styles.savedCount}>{counts.savedHomes}</span>
                </Link>
                <Link className={`${styles.ghost} ${styles.navLinkDesktop}`} href="/account">
                  Account
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`${styles.primary} ${styles.navLinkDesktop}`}
                  disabled={signingOut}
                >
                  {signingOut ? "Signing out..." : "Log out"}
                </button>
              </>
            ) : (
              <>
                <Link className={`${styles.ghost} ${styles.navLinkDesktop}`} href="/login">
                  Log in
                </Link>
                <Link className={`${styles.primary} ${styles.navLinkDesktop}`} href="/signup">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
        <div className={styles.navMobile}>
          {mobileNavItems.map((item) => (
            <Link
              key={item.label}
              className={`${styles.navLinkMobile} ${item.active ? styles.navLinkMobileActive : ""}`}
              href={item.href}
              onClick={() => handleMobileNavClick(item.href)}
              aria-current={item.active ? "page" : undefined}
            >
              <span className={styles.mobileIconWrap}>
                <MobileIcon icon={item.icon} />
                {item.count && item.count > 0 ? (
                  <span className={styles.mobileCount}>{item.count}</span>
                ) : null}
              </span>
              <span className={styles.mobileNavLabel}>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
