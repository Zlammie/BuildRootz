"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getWorkspaceAdapter } from "../lib/workspace/getWorkspaceAdapter";
import { extractWorkspaceQueueItems, sanitizeWorkspaceStorageSnapshot } from "../lib/workspace/storage";
import { subscribeWorkspaceSync } from "../lib/workspace/sync";
import styles from "./navBar.module.css";

export default function NavBar() {
  const { user, logout, counts } = useAuth();
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
          <Link className={styles.navLinkMobile} href="/">
            Browse
          </Link>
          <Link className={styles.navLinkMobile} href="/#map">
            Map
          </Link>
          <Link className={styles.navLinkMobile} href="/saved">
            Saved
          </Link>
          <Link className={styles.navLinkMobile} href="/account">
            Account
          </Link>
        </div>
      </nav>
    </>
  );
}
