import styles from "./CommunitySections.module.css";
import CommunityLocationMap from "./CommunityLocationMap";

type CommunityMapCardProps = {
  name: string;
  locationLabel?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export default function CommunityMapCard({
  name,
  locationLabel,
  lat,
  lng,
}: CommunityMapCardProps) {
  const hasCoordinates =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng);

  return (
    <section className={`${styles.card} ${styles.mapCard}`}>
      <h2 className={styles.cardTitle}>Community Map</h2>
      <p className={styles.cardSub}>
        {hasCoordinates
          ? locationLabel || "Centered on the community location."
          : "Community map coming soon."}
      </p>
      <div className={styles.mapBox}>
        {hasCoordinates ? (
          <CommunityLocationMap lat={lat} lng={lng} label={name} />
        ) : (
          <div className={styles.mapFallback}>Location unavailable for this community.</div>
        )}
      </div>
    </section>
  );
}
