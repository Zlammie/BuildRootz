import type { CommunityOverviewMetric } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  metrics: CommunityOverviewMetric[];
};

export default function CommunityOverviewCard({ metrics }: Props) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Community Overview</h2>
      <p className={styles.cardSub}>
        Snapshot metrics for this community. Additional data wiring will plug into this layout.
      </p>
      <div className={styles.overviewGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.overviewStat}>
            <div className={styles.statLabel}>{metric.label}</div>
            <div className={styles.statValue}>{metric.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
