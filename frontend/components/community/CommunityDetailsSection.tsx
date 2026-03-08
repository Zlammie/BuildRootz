import type { DetailStat } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  feeStats: DetailStat[];
  amenities: string[];
  schoolsSummary: string;
};

export default function CommunityDetailsSection({ feeStats, amenities, schoolsSummary }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeader}>Community Details</h2>
      <div className={styles.detailsGrid}>
        <article className={styles.detailCard}>
          <h3 className={styles.detailTitle}>Fees & Taxes</h3>
          <div className={styles.detailStats}>
            {feeStats.map((item) => (
              <div key={item.label} className={styles.detailRow}>
                <div className={styles.detailLabel}>{item.label}</div>
                <div className={styles.detailValue}>{item.value}</div>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.detailCard}>
          <h3 className={styles.detailTitle}>Amenities</h3>
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
        </article>

        <article className={styles.detailCard}>
          <h3 className={styles.detailTitle}>Schools</h3>
          <div className={styles.detailRow}>
            <div className={styles.detailLabel}>School Information</div>
            <div className={styles.detailValue}>{schoolsSummary}</div>
          </div>
        </article>
      </div>
    </section>
  );
}
