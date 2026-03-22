// Mapbox Streets generally reveals minor street labels around zoom ~14.
export const PRICE_BUBBLE_ZOOM_THRESHOLD = 14;
export const PRICE_BUBBLE_ZOOM_HYSTERESIS = 0.2;

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

export type PriceBubbleMarkerClasses = {
  base: string;
  inner: string;
  active: string;
  muted: string;
};

export type PriceBubbleMarkerOptions = {
  classes: PriceBubbleMarkerClasses;
  priceLabel: string;
  isActive: boolean;
  ariaLabel: string;
};

export function formatPriceBubbleLabel(price: unknown): string {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "";
  const label = compactCurrencyFormatter.format(price);
  return label.replace(/\.00(?=[A-Za-z]|$)/, "").replace(/\.0(?=[A-Za-z]|$)/, "");
}

export function createPriceBubbleMarkerElement({
  classes,
  priceLabel,
  isActive,
  ariaLabel,
}: PriceBubbleMarkerOptions): HTMLButtonElement {
  const button = document.createElement("button");
  const inner = document.createElement("span");

  button.type = "button";
  button.className = classes.base;
  button.setAttribute("role", "button");
  inner.className = classes.inner;
  if (isActive) {
    button.classList.add(classes.active);
  }
  if (!priceLabel) {
    button.classList.add(classes.muted);
  }
  inner.textContent = priceLabel || "Price TBD";
  button.setAttribute("aria-label", ariaLabel);
  button.append(inner);
  return button;
}

export function updatePriceBubbleMarkerElement(
  element: HTMLButtonElement,
  {
    classes,
    priceLabel,
    isActive,
    ariaLabel,
  }: PriceBubbleMarkerOptions,
) {
  const inner =
    element.firstElementChild instanceof HTMLSpanElement ? element.firstElementChild : null;

  if (inner) {
    inner.textContent = priceLabel || "Price TBD";
  } else {
    element.textContent = priceLabel || "Price TBD";
  }
  element.setAttribute("aria-label", ariaLabel);
  element.classList.toggle(classes.active, isActive);
  element.classList.toggle(classes.muted, !priceLabel);
}
