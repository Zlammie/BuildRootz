"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NavBar from "../../components/NavBar";
import { useAuth } from "../../components/AuthProvider";
import type { AlertPreferences } from "../../types/user";
import styles from "./page.module.css";

const defaultPrefs: AlertPreferences = {
  emailAlertsEnabled: true,
  frequency: "weekly",
  priceDrop: true,
  newMatches: true,
};

export default function AccountPage() {
  const router = useRouter();
  const {
    user,
    loading,
    updateAlerts,
    authError,
  } = useAuth();
  const [alertPrefs, setAlertPrefs] = useState<AlertPreferences>(defaultPrefs);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.alertPreferences) {
      setAlertPrefs({ ...defaultPrefs, ...user.alertPreferences });
    }
  }, [user]);

  const handleAlertChange = async (partial: Partial<AlertPreferences>) => {
    if (!user) {
      router.push("/login");
      return;
    }
    const nextPrefs = { ...alertPrefs, ...partial };
    setAlertPrefs(nextPrefs);
    setSavingAlerts(true);
    setLocalError(null);
    try {
      await updateAlerts(nextPrefs);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not update alerts.");
    } finally {
      setSavingAlerts(false);
    }
  };

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Account</p>
            <h1>Email preferences</h1>
            <p className={styles.subhead}>
              Manage how we contact you about saved homes and searches. Privacy reminder: we never
              send your contact info to builders unless you explicitly request info.
            </p>
          </div>
        </header>

        {(authError || localError) && (
          <div className={styles.errorBox} role="alert">
            {authError || localError}
          </div>
        )}

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionKicker}>Alerts</p>
              <h3>Email preferences</h3>
            </div>
          </div>
          <div className={styles.alerts}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={alertPrefs.emailAlertsEnabled}
                onChange={(e) => handleAlertChange({ emailAlertsEnabled: e.target.checked })}
              />
              <div>
                <p className={styles.toggleTitle}>Email alerts</p>
                <p className={styles.listMeta}>Get updates when there are new matches or price drops.</p>
              </div>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={alertPrefs.priceDrop}
                onChange={(e) => handleAlertChange({ priceDrop: e.target.checked })}
              />
              <div>
                <p className={styles.toggleTitle}>Price drop alerts</p>
                <p className={styles.listMeta}>We&apos;ll notify you when prices change on saved homes.</p>
              </div>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={alertPrefs.newMatches}
                onChange={(e) => handleAlertChange({ newMatches: e.target.checked })}
              />
              <div>
                <p className={styles.toggleTitle}>New match alerts</p>
                <p className={styles.listMeta}>Get alerts for new listings matching saved searches.</p>
              </div>
            </label>

            <label className={styles.dropdownLabel}>
              Frequency
              <select
                className={styles.select}
                value={alertPrefs.frequency}
                onChange={(e) => handleAlertChange({ frequency: e.target.value as AlertPreferences["frequency"] })}
                disabled={savingAlerts}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {savingAlerts && <p className={styles.saving}>Saving preferences...</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
