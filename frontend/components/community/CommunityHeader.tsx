import type { ReactNode } from "react";
import type { CommunityHeaderBadge } from "./types";
import styles from "./CommunitySections.module.css";

type Props = {
  title: string;
  subtitle: string;
  badges: CommunityHeaderBadge[];
  actions?: ReactNode;
};

export default function CommunityHeader({ title, subtitle, badges, actions }: Props) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.headerTitle}>{title}</h1>
        <p className={styles.headerSub}>{subtitle}</p>
        <div className={styles.headerBadges}>
          {badges.map((badge) => (
            <span key={badge.label} className={styles.badge}>
              {badge.label}: {badge.value}
            </span>
          ))}
        </div>
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}
