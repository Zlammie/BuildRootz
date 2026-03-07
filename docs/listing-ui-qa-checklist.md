# Listing UI QA Checklist

- Missing price shows `Contact for price` on cards, map selection, and listing detail.
- Price values of `0`, empty, or invalid values do not render as `$0`, `NaN`, `undefined`, or `null`.
- Partial addresses render without trailing commas, doubled spaces, or empty separators.
- Missing beds, baths, or sqft hide only the missing spec pills; if all are missing, the specs row is hidden.
- Missing listing photos fall back to a clean placeholder image instead of a broken image block.
- Map selection card still shows a usable badge, address, and CTA when photos are missing.
- Listing detail hides the map embed and shows `Map location coming soon.` when lat/lng are missing or invalid.
- Builder and community CTA links render only when a valid href is available; no empty or dead links appear.
- Sticky mobile CTA bar stays visible on small screens without covering the last content section.
- `More homes in this community` appears only when related homes exist and links into stable listing routes.
