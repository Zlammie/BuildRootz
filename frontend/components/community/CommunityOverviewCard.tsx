import type { CommunityOverviewMetric, CommunitySchoolField, DetailStat } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  primaryMetrics: CommunityOverviewMetric[];
  secondaryMetrics: CommunityOverviewMetric[];
  lotSizeOptions: string[];
  feeStats: DetailStat[];
  amenities: string[];
  schools: CommunitySchoolField[];
  schoolsDistrict?: string | null;
};

export default function CommunityOverviewCard({
  primaryMetrics,
  secondaryMetrics,
  lotSizeOptions,
  feeStats,
  amenities,
  schools,
  schoolsDistrict,
}: Props) {
  return (
    <section className={`${styles.card} ${styles.overviewHub}`}>
      <div>
        <h2 className={styles.cardTitle}>Community Overview</h2>
        <p className={styles.cardSub}>
          Key metrics, fees, amenities, and school context in one place.
        </p>
      </div>

      <div className={styles.secondaryMetricsGrid}>
        {secondaryMetrics.map((metric) => (
          <div key={metric.label} className={`${styles.overviewStat} ${styles.overviewStatCompact}`}>
            <div className={styles.statLabel}>{metric.label}</div>
            <div className={styles.statValue}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.primaryMetricsGrid}>
        {primaryMetrics.map((metric) => (
          <div key={metric.label} className={`${styles.overviewStat} ${styles.overviewStatPrimary}`}>
            <div className={styles.statLabel}>{metric.label}</div>
            <div className={styles.statValue}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.overviewSupportGrid}>
        <section className={styles.overviewSection}>
          <div className={styles.overviewSectionHeader}>
            <h3 className={styles.overviewSectionTitle}>Lot Sizes</h3>
            <p className={styles.overviewSectionSub}>Reserved for the upcoming lot-size filter.</p>
          </div>
          <div className={styles.lotSizeChipRow}>
            {lotSizeOptions.length ? (
              lotSizeOptions.map((item) => (
                <div key={item} className={styles.lotSizeChip}>
                  {item}
                </div>
              ))
            ) : (
              <div className={styles.lotSizeChipMuted}>Not listed yet</div>
            )}
          </div>
        </section>

        <section className={styles.overviewSection}>
          <div className={styles.overviewSectionHeader}>
            <h3 className={styles.overviewSectionTitle}>Fees & Taxes</h3>
          </div>
          <div className={styles.feesCompactGrid}>
            {feeStats.map((item) => (
              <div key={item.label} className={styles.feeItem}>
                <div className={styles.feeLabel}>{item.label}</div>
                <div className={styles.feeValue}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.overviewSection}>
        <div className={styles.overviewSectionHeader}>
          <h3 className={styles.overviewSectionTitle}>Amenities</h3>
        </div>
        <div className={styles.amenities}>
          {amenities.length === 0 ? (
            <div className={styles.amenity}>No amenities listed yet.</div>
          ) : (
            amenities.map((item) => (
              <div key={item} className={styles.amenity}>
                {item}
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.overviewSection}>
        <div className={styles.overviewSectionHeader}>
          <h3 className={styles.overviewSectionTitle}>Schools</h3>
          {schoolsDistrict ? (
            <div className={styles.overviewSectionMeta}>District: {schoolsDistrict}</div>
          ) : null}
        </div>
        <div className={styles.schoolGrid}>
          {schools.map((school) => (
            <div key={school.label} className={styles.schoolItem}>
              <div className={styles.schoolLabel}>{school.label}</div>
              <div className={styles.schoolValue}>{school.value}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
