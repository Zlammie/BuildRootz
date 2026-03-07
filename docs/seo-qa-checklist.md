# SEO QA Checklist

1. Open a listing detail page and view page source.
2. Confirm there is a canonical tag pointing to the listing URL without query params.
3. Confirm OpenGraph and Twitter tags are present with title, description, and image fields when listing media exists.
4. Confirm the page includes one `application/ld+json` script and that it contains no `undefined` or `null` placeholder strings.
5. Fetch `/sitemap.xml` and confirm it returns XML.
6. Confirm `/sitemap.xml` includes `/`, `/listings`, active listing URLs, and only builder/community URLs that match active or visible content.
7. Spot-check that inactive or unpublished listings are not present in `/sitemap.xml`.
8. Fetch `/robots.txt` and confirm it includes the sitemap line plus the expected disallows for `/api/`, admin, and account-style routes.
9. Open a filtered listings URL such as `/listings?bedsMin=3&utm_source=test` and confirm the canonical tag points to `/listings`.
10. Visit `/listings?minPrice=300000` and confirm the page emits a robots meta tag with `noindex, follow`.
11. Visit `/listings` and confirm the page is indexable.
12. Visit `/community?communitySlug=ten-mile-creek` and confirm the page is indexable.
13. Visit `/community` with no identifying param and confirm the page emits `noindex, follow`.
14. Visit `/saved` and confirm the page emits `noindex, follow`.
15. Confirm canonical on filtered listings still points to `/listings`.
16. Open a community URL with extra params such as `/community?communitySlug=example&builder=test&utm_source=test` and confirm the canonical retains only the identifying community param.
17. Fetch `/api/public/homes?includeIdentity=1` and confirm the JSON includes an `includes` object with `communitiesById` and `buildersByCompanyId`.
18. Confirm listing cards still show community name and can use the community hero fallback without requiring extra identity lookup calls for IDs already returned in `includes`.
