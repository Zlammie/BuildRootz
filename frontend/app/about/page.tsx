import NavBar from "../../components/NavBar";
import styles from "./page.module.css";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.layout}>
        <section className={styles.hero}>
          <h1 className={styles.title}>About BuildRootz</h1>
          <p className={styles.subtitle}>
            Discover new homes — without the pressure. We’re building a calmer,
            clearer way to explore new construction communities and homes.
          </p>
        </section>

        <div className={styles.grid}>
          <div className={styles.card}>
            <h3>Why we exist</h3>
            <p>
              Buying a new home should feel exciting, not overwhelming. We make
              it easier to browse new construction without noise, pressure, or
              constant follow-ups.
            </p>
          </div>
          <div className={styles.card}>
            <h3>Our mission</h3>
            <p>
              BuildRootz helps people discover new construction homes in a more
              thoughtful way, focused on clear info, community insight, and a
              calm experience.
            </p>
          </div>
          <div className={styles.card}>
            <h3>What to expect</h3>
            <p>
              No pop-ups. No sales tactics. Just organized details so you can
              decide when you’re ready to talk to a builder.
            </p>
          </div>
        </div>

        <div className={styles.card}>
          <h3>How BuildRootz is different</h3>
          <ul className={styles.list}>
            <li>
              <strong>Browse privately:</strong> Explore homes, communities, and
              builders without tracking or unexpected outreach.
            </li>
            <li>
              <strong>Contact on your terms:</strong> Builders don’t see who you
              are until you choose to contact them.
            </li>
            <li>
              <strong>We don’t sell your information:</strong> Your personal
              info is never sold or shared with third parties.
            </li>
            <li>
              <strong>Built for new construction:</strong> Everything is
              tailored to how builders actually sell and release homes.
            </li>
          </ul>
        </div>

        <div className={styles.card}>
          <h3>Where our information comes from</h3>
          <ul className={styles.list}>
            <li>
              Directly from builders who manage their listings through KeepUP.
            </li>
            <li>
              From public sources like builder websites and marketing materials.
            </li>
          </ul>
          <p className={styles.subtitle}>
            Builder-provided listings are updated by the builder. Listings from
            public sources may change—confirm details with the builder. We
            clearly label how each listing is sourced.
          </p>
        </div>

        <div className={styles.card}>
          <h3>Built with intent</h3>
          <p className={styles.subtitle}>
            BuildRootz isn’t designed to rush you. It’s here to help you
            understand communities, locations, and homes before you talk to
            anyone—so you can take the next step with confidence.
          </p>
        </div>
      </div>
    </div>
  );
}
