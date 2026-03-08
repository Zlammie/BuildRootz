import type { PublicHome } from "../types/public";

export function slugifyBuilder(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveBuilderParam(
  home: Pick<PublicHome, "builderSlug" | "keepupBuilderId" | "builder">,
): string | null {
  if (home.builderSlug) return home.builderSlug;
  if (home.builder) {
    const slug = slugifyBuilder(home.builder);
    return slug || null;
  }
  if (home.keepupBuilderId) return home.keepupBuilderId;
  return null;
}
