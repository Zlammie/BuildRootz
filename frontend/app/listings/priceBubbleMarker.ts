// Wait until a tighter street-level zoom before switching from true-position
// inventory markers to separated price bubbles. Showing price bubbles too early
// makes nearby homes appear to slide off their lots while zoomed out.
export const PRICE_BUBBLE_ZOOM_THRESHOLD = 15.25;
export const PRICE_BUBBLE_ZOOM_HYSTERESIS = 0.2;

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

export type PriceBubbleMarkerClasses = {
  base: string;
  stack: string;
  inner: string;
  dot: string;
  active: string;
  muted: string;
};

export type PriceBubbleMarkerOptions = {
  classes: PriceBubbleMarkerClasses;
  priceLabel: string;
  isActive: boolean;
  ariaLabel: string;
  offset?: [number, number];
  dotColor?: string;
  debugAnchor?: boolean;
};

function applyPriceBubbleOffset(
  element: HTMLButtonElement,
  offset: [number, number] | undefined,
) {
  const [offsetX, offsetY] = offset || [0, 0];
  element.style.setProperty("--bubble-offset-x", `${offsetX}px`);
  element.style.setProperty("--bubble-offset-y", `${offsetY}px`);
}

function applyPriceBubbleDotColor(
  element: HTMLButtonElement,
  dotColor: string | undefined,
) {
  if (!dotColor) {
    element.style.removeProperty("--bubble-dot-color");
    return;
  }
  element.style.setProperty("--bubble-dot-color", dotColor);
}

function applyDebugAnchorFlag(
  element: HTMLButtonElement,
  debugAnchor: boolean | undefined,
) {
  if (debugAnchor) {
    element.setAttribute("data-debug-anchor", "true");
    return;
  }
  element.removeAttribute("data-debug-anchor");
}

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
  offset,
  dotColor,
  debugAnchor,
}: PriceBubbleMarkerOptions): HTMLButtonElement {
  const button = document.createElement("button");
  const stack = document.createElement("span");
  const inner = document.createElement("span");
  const dot = document.createElement("span");

  button.type = "button";
  button.className = classes.base;
  button.setAttribute("role", "button");
  stack.className = classes.stack;
  inner.className = classes.inner;
  dot.className = classes.dot;
  if (isActive) {
    button.classList.add(classes.active);
  }
  if (!priceLabel) {
    button.classList.add(classes.muted);
  }
  inner.textContent = priceLabel || "Price TBD";
  button.setAttribute("aria-label", ariaLabel);
  applyPriceBubbleOffset(button, offset);
  applyPriceBubbleDotColor(button, dotColor);
  applyDebugAnchorFlag(button, debugAnchor);
  dot.setAttribute("aria-hidden", "true");
  stack.append(inner, dot);
  button.append(stack);
  return button;
}

export function updatePriceBubbleMarkerElement(
  element: HTMLButtonElement,
  {
    classes,
    priceLabel,
    isActive,
    ariaLabel,
    offset,
    dotColor,
    debugAnchor,
  }: PriceBubbleMarkerOptions,
) {
  const inner = element.querySelector(`.${classes.inner}`);

  if (inner instanceof HTMLSpanElement) {
    inner.textContent = priceLabel || "Price TBD";
  } else {
    element.textContent = priceLabel || "Price TBD";
  }
  element.setAttribute("aria-label", ariaLabel);
  element.classList.toggle(classes.active, isActive);
  element.classList.toggle(classes.muted, !priceLabel);
  applyPriceBubbleOffset(element, offset);
  applyPriceBubbleDotColor(element, dotColor);
  applyDebugAnchorFlag(element, debugAnchor);
}
