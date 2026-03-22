"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { resolveBuilderParam } from "../lib/builder";
import {
  formatPrice,
  getPrimaryImage,
  getSpecPills,
  getStatusBadge,
  safeLink,
} from "../lib/listingFormatters";
import { buildListingLocationLine } from "../../shared/listingLocation";
import type { PublicCommunity, PublicHome } from "../types/public";
import WorkspaceQueueButton from "./workspace/WorkspaceQueueButton";
import styles from "./ListingCard.module.css";

type BuilderCardSummary = {
  builderName?: string | null;
  builderSlug?: string | null;
  logoUrl?: string | null;
};

type CommunityCardSummary = Pick<Partial<PublicCommunity>, "name" | "slug" | "mapImage"> & {
  city?: string | null;
  state?: string | null;
};

type Props = {
  home: PublicHome;
  builder?: BuilderCardSummary | null;
  community?: CommunityCardSummary | null;
  variant?: "default" | "compact";
  showSaveButton?: boolean;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function communityHref(home: PublicHome, community?: CommunityCardSummary | null): string | null {
  const communitySlug = safeLink(home.communitySlug || community?.slug || null);
  if (communitySlug) {
    return `/community?communitySlug=${encodeURIComponent(communitySlug)}`;
  }

  const communityRef = safeLink(
    home.publicCommunityId || home.keepupCommunityId || home.communityId || null,
  );
  if (!communityRef) return null;
  return `/community?communityId=${encodeURIComponent(communityRef)}`;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function addressTitle(home: PublicHome): string {
  const directAddress = cleanText(home.address);
  if (directAddress) return directAddress;

  const fallbackTitle = cleanText(home.title);
  if (fallbackTitle && fallbackTitle.toLowerCase() !== "untitled home") {
    return fallbackTitle;
  }

  return "Address coming soon";
}

function locationLine(home: PublicHome, community?: CommunityCardSummary | null): string {
  return buildListingLocationLine({
    city: cleanText(home.city) || cleanText(community?.city) || "",
    state: cleanText(home.state) || cleanText(community?.state) || "",
    postalCode: cleanText(home.postalCode) || "",
    formattedAddress: cleanText(home.formattedAddress) || "",
  });
}

function getPhotoCount(home: PublicHome): number {
  const urls = new Set<string>();
  const pushUrl = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized) return;
    urls.add(normalized);
  };
  pushUrl(home.heroImage);
  (home.heroImages || []).forEach(pushUrl);
  (home.images || []).forEach(pushUrl);
  return urls.size;
}

export default function ListingCard({
  home,
  builder,
  community,
  variant = "default",
  showSaveButton = false,
  isHighlighted = false,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const { savedHomes, toggleSavedHome } = useAuth();
  const price = formatPrice(home);
  const specs = getSpecPills(home);
  const specsLine = specs.map((spec) => spec.label).join(" · ");
  const listingAddressTitle = addressTitle(home);
  const listingLocation = locationLine(home, community);
  const image = getPrimaryImage(home, builder, community);
  const statusChip = getStatusBadge(home);
  const tagLabel = cleanText(home.tag);
  const shouldShowTag = !!tagLabel && tagLabel.toLowerCase() !== statusChip.text.toLowerCase();
  const listingHref = `/listing/${home.id}`;
  const isSaved = savedHomes.includes(home.id);
  const hasConcreteLocation = listingLocation !== "Location coming soon";
  const photoCount = getPhotoCount(home);

  const builderLabel = builder?.builderName || home.builder || null;
  const builderParam =
    builder?.builderSlug ||
    resolveBuilderParam({
      builderSlug: home.builderSlug,
      keepupBuilderId: home.keepupBuilderId,
      builder: builderLabel || undefined,
    });
  const builderHref = safeLink(builderParam ? `/builder/${builderParam}` : null);
  const derivedCommunityHref = safeLink(communityHref(home, community));
  const communityLabel = community?.name || home.communityName || null;
  const queueSubtitle = [price.label, communityLabel].filter(Boolean).join(" | ") || undefined;
  const builderIdentity =
    builderHref || builderLabel ? (
      builderHref ? (
        <Link href={builderHref} className={styles.identityLink}>
          {builderLabel || "View builder"}
        </Link>
      ) : (
        <span className={styles.identityText}>{builderLabel}</span>
      )
    ) : null;

  return (
    <article
      className={`${styles.card} ${variant === "compact" ? styles.compact : ""} ${
        isHighlighted ? styles.highlighted : ""
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={`${styles.media} ${image.isPlaceholder ? styles.mediaPlaceholder : ""}`}
        style={{ backgroundImage: `url(${image.url})` }}
        role="img"
        aria-label={image.alt}
      >
        <Link
          href={listingHref}
          className={styles.mediaLink}
          aria-label={`View listing for ${listingAddressTitle}`}
        >
          <span className={`${styles.statusOverlay} ${styles[`statusOverlay_${statusChip.variant}`]}`}>
            {statusChip.text}
          </span>
          {photoCount > 1 ? <span className={styles.photoCount}>{photoCount}</span> : null}
        </Link>
        {showSaveButton ? (
          <button
            type="button"
            aria-label={isSaved ? "Unsave home" : "Save home"}
            aria-pressed={isSaved}
            className={`${styles.saveBtn} ${isSaved ? styles.isSaved : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void toggleSavedHome(home.id);
            }}
          >
            <span className={styles.srOnly}>{isSaved ? "Saved home" : "Save home"}</span>
            <svg className={styles.saveIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle className={styles.saveCircle} cx="12" cy="12" r="9" />
              <path
                className={styles.saveRoots}
                d="M12 14.5c-.6.9-1.3 1.7-2.2 2.2M12 14.5c.6.7 1.3 1.4 2.2 1.8M12 14.5c0 1-.2 2-.4 3M12 14.5c.3.8.5 1.5.8 2.3"
                fill="none"
              />
              <path
                className={styles.saveSprout}
                d="M12 14.5V10.8m0 0c.4-1.3 1.1-2.6 2.8-3m-2.8 3c-.5-1.2-1.3-2.3-2.8-2.6"
                fill="none"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <Link href={listingHref} className={styles.titleLink}>
            <p className={styles.title}>{listingAddressTitle}</p>
          </Link>
          {shouldShowTag ? (
            <div className={styles.inlineBadges}>
              <span className={styles.tagChip}>{tagLabel}</span>
            </div>
          ) : null}
        </div>
        <div className={styles.bodyMeta}>
          {(derivedCommunityHref || communityLabel || hasConcreteLocation) ? (
            <div className={styles.communityLocationRow}>
              {derivedCommunityHref || communityLabel ? (
                derivedCommunityHref ? (
                  <Link href={derivedCommunityHref} className={styles.communityLink}>
                    {communityLabel || "View community"}
                  </Link>
                ) : (
                  <span className={styles.communityText}>{communityLabel}</span>
                )
              ) : null}
              {(derivedCommunityHref || communityLabel) && hasConcreteLocation ? (
                <span className={styles.locationSep}>-</span>
              ) : null}
              {hasConcreteLocation ? (
                <span className={styles.location}>{listingLocation}</span>
              ) : null}
            </div>
          ) : (
            <p className={styles.location}>Location coming soon</p>
          )}
        </div>
        <Link href={listingHref} className={styles.bodyLink}>
          <p className={`${styles.price} ${price.isFallback ? styles.priceFallback : ""}`}>
            {price.label}
          </p>
          {specsLine ? (
            <p className={styles.specsRow} aria-label="Home specifications">
              {specsLine}
            </p>
          ) : null}
        </Link>
      </div>

      <div className={styles.footerRow}>
        {builderIdentity ? (
          <span className={styles.identityItem}>{builderIdentity}</span>
        ) : (
          <span className={styles.footerSpacer} aria-hidden="true" />
        )}
        <WorkspaceQueueButton
          subjectType="listing"
          subjectId={home.id}
          title={listingAddressTitle}
          subtitle={queueSubtitle}
          contextRefs={{ listingId: home.id }}
          className={styles.queueBtn}
          activeClassName={styles.queueBtnActive}
          queuedLabel="In Queue"
          idleLabel="Queue"
        />
      </div>
    </article>
  );
}
