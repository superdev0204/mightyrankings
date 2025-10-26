export function createPageUrl(pageName: string) {
  // Preserve casing to match how your routes are declared (e.g., "/Category")
  return `/${String(pageName || "").trim()}`;
}

// slugify a label for URLs (safe + predictable)
export function toSlug(s: string | null | undefined) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build the public path for a business like /business/<category-name>/<slug> */
export function businessPath(b: any) {
  const catLabel = b?.category_name || b?.category?.name || "category";
  const catSlug = toSlug(catLabel);
  const slug = b?.slug || toSlug(b?.name || "business");
  return `/business/${catSlug}/${slug}`;
}