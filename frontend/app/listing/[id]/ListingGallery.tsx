"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type GalleryImage = {
  url: string;
  alt: string;
  isPlaceholder?: boolean;
};

type Props = {
  images: GalleryImage[];
};

export default function ListingGallery({ images }: Props) {
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    return images.filter((image) => {
      if (!image?.url || seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
  }, [images]);
  const [index, setIndex] = useState(0);

  if (!gallery.length) {
    return <div className={styles.heroImg} />;
  }

  const prev = () => setIndex((idx) => (idx === 0 ? gallery.length - 1 : idx - 1));
  const next = () => setIndex((idx) => (idx === gallery.length - 1 ? 0 : idx + 1));

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryViewport}>
        <div
          className={styles.galleryTrack}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {gallery.map((image, idx) => (
            <div
              key={`${image.url}-${idx}`}
              className={`${styles.galleryImage} ${
                image.isPlaceholder ? styles.galleryImagePlaceholder : ""
              }`}
              style={{ backgroundImage: `url(${image.url})` }}
              role="img"
              aria-label={image.alt}
            >
              <span className={styles.galleryBadge}>
                {idx + 1} / {gallery.length}
              </span>
            </div>
          ))}
        </div>
      </div>
      {gallery.length > 1 ? (
        <div className={styles.galleryControls}>
          <button
            type="button"
            className={styles.galleryArrow}
            onClick={prev}
            aria-label="Previous photo"
          >
            {"<"}
          </button>
          <button
            type="button"
            className={styles.galleryArrow}
            onClick={next}
            aria-label="Next photo"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
