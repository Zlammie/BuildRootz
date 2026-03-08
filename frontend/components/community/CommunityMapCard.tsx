import styles from "./CommunitySections.module.css";

export default function CommunityMapCard() {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Community Map</h2>
      <p className={styles.cardSub}>Map container placeholder for upcoming map improvements.</p>
      <div className={styles.mapBox} />
    </section>
  );
}
