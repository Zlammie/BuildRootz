import NavBar from "../../components/NavBar";
import styles from "./page.module.css";

function SectionIcon({ kind }: { kind: "purpose" | "mission" | "expect" | "difference" | "source" }) {
  if (kind === "purpose") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s6-4.8 6-10a6 6 0 1 0-12 0c0 5.2 6 10 6 10Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }
  if (kind === "mission") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 4.5V2.5M19.5 12h2M12 19.5v2M2.5 12h2" />
      </svg>
    );
  }
  if (kind === "expect") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="3" />
        <path d="M8 11.5h8M8 15h5" />
      </svg>
    );
  }
  if (kind === "difference") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7.5h12M6 12h12M6 16.5h8" />
        <circle cx="17.5" cy="16.5" r="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5.5h12a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 18 18.5H6A1.5 1.5 0 0 1 4.5 17V7A1.5 1.5 0 0 1 6 5.5Z" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  );
}

const DIFFERENCE_ITEMS = [
  {
    title: "Browse privately",
    body: "Explore homes, communities, and builders without tracking, pressure, or unexpected outreach.",
  },
  {
    title: "Contact on your terms",
    body: "Builders do not see who you are until you choose to reach out.",
  },
  {
    title: "Your information stays yours",
    body: "We do not sell your personal information or share it with third parties.",
  },
  {
    title: "Built for new construction",
    body: "Everything is organized around how builders actually release communities, floor plans, and homes.",
  },
];

const SOURCE_GROUPS = [
  {
    label: "Builder-provided",
    body: "Listings and updates supplied directly by builders managing inventory and community data through KeepUP.",
  },
  {
    label: "Public-source",
    body: "Supplemental details gathered from public builder websites, marketing materials, and other public-facing sources.",
  },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.layout}>
        <section className={styles.hero}>
          <div className={styles.heroEyebrow}>A calmer way to shop new construction</div>
          <div className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <h1 className={styles.title}>About BuildRootz</h1>
              <p className={styles.heroLead}>
                Discover new homes without the pressure. BuildRootz is designed to make new
                construction feel clearer, calmer, and easier to evaluate.
              </p>
            </div>
            <div className={styles.heroStatement}>
              <div className={styles.heroStatementLabel}>What we are building</div>
              <p className={styles.heroStatementText}>
                A more thoughtful way to understand communities, homes, and builders before you
                talk to anyone.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.storyGrid}>
          <article className={`${styles.card} ${styles.storyCard}`}>
            <div className={styles.storyContent}>
              <div className={styles.titleRow}>
                <div className={styles.iconBadge}>
                  <SectionIcon kind="purpose" />
                </div>
                <h2 className={styles.sectionTitle}>Why we exist</h2>
              </div>
              <p>
                Buying a new home should feel exciting, not overwhelming. We make it easier to
                browse new construction without noise, pressure, or constant follow-ups.
              </p>
            </div>
          </article>

          <div className={styles.storyStack}>
            <article className={styles.storyMini}>
              <div className={styles.storyContent}>
                <div className={styles.titleRow}>
                  <div className={styles.iconBadge}>
                    <SectionIcon kind="mission" />
                  </div>
                  <h2 className={styles.sectionTitle}>Our mission</h2>
                </div>
                <p>
                  BuildRootz helps people discover new construction homes in a more thoughtful way,
                  focused on clear info, community insight, and a calm experience.
                </p>
              </div>
            </article>

            <article className={styles.storyMini}>
              <div className={styles.storyContent}>
                <div className={styles.titleRow}>
                  <div className={styles.iconBadge}>
                    <SectionIcon kind="expect" />
                  </div>
                  <h2 className={styles.sectionTitle}>What to expect</h2>
                </div>
                <p>
                  No pop-ups. No sales tactics. Just organized details so you can decide when you
                  are ready to talk to a builder.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className={`${styles.card} ${styles.featureSection}`}>
          <div className={styles.sectionIntro}>
            <div className={styles.titleRow}>
              <div className={styles.iconBadge}>
                <SectionIcon kind="difference" />
              </div>
              <h2 className={styles.sectionTitle}>How BuildRootz is different</h2>
            </div>
            <p className={styles.sectionSub}>
              The experience is designed to support better decisions, not force faster ones.
            </p>
          </div>
          <div className={styles.featureRows}>
            {DIFFERENCE_ITEMS.map((item) => (
              <div key={item.title} className={styles.featureRow}>
                <div className={styles.featureHeading}>{item.title}</div>
                <div className={styles.featureBody}>{item.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.sourceSection}`}>
          <div className={styles.sectionIntro}>
            <div className={styles.titleRow}>
              <div className={styles.iconBadge}>
                <SectionIcon kind="source" />
              </div>
              <h2 className={styles.sectionTitle}>Where our information comes from</h2>
            </div>
            <p className={styles.sectionSub}>
              We combine builder-provided data with clearly labeled public-source information.
            </p>
          </div>
          <div className={styles.sourceGrid}>
            {SOURCE_GROUPS.map((group) => (
              <article key={group.label} className={styles.sourceBlock}>
                <div className={styles.sourceLabel}>{group.label}</div>
                <p>{group.body}</p>
              </article>
            ))}
          </div>
          <p className={styles.disclaimer}>
            Builder-provided listings are updated by the builder. Listings from public sources may
            change, so confirm details directly with the builder. We clearly label how each listing
            is sourced.
          </p>
        </section>

        <section className={styles.closing}>
          <div className={styles.closingInner}>
            <h2 className={styles.closingTitle}>Built with intent</h2>
            <p className={styles.closingText}>
              BuildRootz is not designed to rush you. It is here to help you understand
              communities, locations, and homes before you talk to anyone so you can take the next
              step with more confidence.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
