# Listings Identity QA

## API checks

- Fetch `/api/public/homes?includeIdentity=1` and confirm the response includes `includes.communitiesById`.
- For a community with published media, confirm each community summary can include:
  - `heroImageUrl`
  - `imageUrlsPreview` (up to 3 URLs)
  - `photosPreview` (legacy alias of the same preview set)
  - `highlights` (up to 2 items)

## UI checks

- Load `/listings` and confirm cards still show community name.
- Confirm community hero imagery can render as the listing-card fallback image without relying on a second community lookup request.
- With browser devtools open, verify the initial `/api/public/homes` response already contains the community identity payload needed for card rendering.
