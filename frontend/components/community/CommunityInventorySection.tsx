import type { InventoryCard } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  homes: InventoryCard[];
};

export default function CommunityInventorySection({ homes }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeader}>Quick Move-In Homes</h2>
      <div className={styles.inventoryShell}>
        {homes.length === 0 ? (
          <p className={styles.inventoryEmpty}>No quick move-in homes currently available.</p>
        ) : (
          <div className={styles.inventoryList}>
            {homes.map((home) => (
              <article key={home.id} className={styles.inventoryCard}>
                <p className={styles.inventoryTitle}>{home.title}</p>
                <p className={styles.inventorySub}>{home.subtitle}</p>
                {home.cta}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
