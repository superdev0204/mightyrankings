import axios from './axiosClient';
import { unwrap, getCount } from './_helpers';

const encodePathSegments = (path) =>
  String(path || '')
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');

export const listCategories = async (params = {}) => {
  const res = await axios.get('categories/', { params: { limit: 1000, ...params } });
  return unwrap(res);
};

// NEW: page through all categories, regardless of count
export const listAllCategories = async (params = {}) => {
  const all = [];
  const limit = params.limit ?? 500;
  let offset = params.offset ?? 0;

  // Defensive: stop if server starts returning 0
  // Loop until a page is shorter than the limit
  // Works for DRF pagination and “unwrap” returning array
  // (we don't rely on `count` being available)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await axios.get('categories/', {
      params: { ...params, limit, offset },
    });
    const items = unwrap(res) || [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
};

export const getCategory = async (id) => {
  const res = await axios.get(`categories/${id}/`);
  return res.data;
};

export const getCategoryBySlug = async (slug) => {
  // Try filter first (works with DRF + django-filter)
  try {
    const res = await axios.get('categories/', { params: { slug, limit: 1 } });
    const items = unwrap(res);
    if (Array.isArray(items) && items[0]) return items[0];
  } catch {}
  // Fallback to dedicated endpoint (returns the first match historically)
  const r2 = await axios.get(`categories/by-slug/${encodeURIComponent(slug)}/`);
  return r2.data;
};

// Fetch by full nested path, e.g. "Lawyers/Personal_Injury_Lawyers/Unemployment_Personal_Injury_Lawyers"
export const getCategoryByPath = async (path) => {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;

  // Try exact match on full_slug via filter
  try {
    const res = await axios.get('categories/', { params: { full_slug: clean, limit: 1 } });
    const items = unwrap(res);
    if (Array.isArray(items) && items[0]) return items[0];
  } catch {}

  // Fallback to dedicated endpoint
  try {
    const res = await axios.get(`categories/by-path/${encodePathSegments(clean)}/`);
    return res.data;
  } catch {
    return null;
  }
};

export const countCategories = async (params = {}) => {
  const res = await axios.get('categories/', { params: { ...params, limit: 1 } });
  return getCount(res);
};

export const getTopCategories = ({ limit = 6 } = {}) =>
  listCategories({ limit, ordering: '-business_count' });

/**
 * Create a category. Slug is auto-generated server-side (case preserved with underscores).
 * Optionally, specify a parent either by `parent` (id) or `parent_full_slug`.
 *
 * Example:
 *   await createCategory({ name: "Sub", parent_full_slug: "Lawyers/Personal_Injury_Lawyers" })
 */
export const createCategory = async ({ name, description, icon, color, parent, parent_full_slug } = {}) => {
  const payload = { name };
  if (description != null) payload.description = description;
  if (icon != null) payload.icon = icon;
  if (color != null) payload.color = color;

  let parentId = parent ?? null;
  if (!parentId && parent_full_slug) {
    try {
      const r = await getCategoryByPath(parent_full_slug);
      parentId = r?.id ?? null;
    } catch {
      parentId = null;
    }
  }
  if (parentId != null) payload.parent = parentId;

  const res = await axios.post('categories/', payload);
  return res.data;
};

export const deleteCategory = async (id) => {
  return axios.delete(`categories/${id}/`);
};

/**
 * Update name/description/icon/color and optionally re-parent:
 *   updateCategory(id, { parent: 123 })
 *   updateCategory(id, { parent_full_slug: "Lawyers/Personal_Injury_Lawyers" })
 */
export const updateCategory = async (id, payload = {}) => {
  const body = {};
  const { name, description, icon, color, parent, parent_full_slug } = payload;

  if (name != null) body.name = name;
  if (description != null) body.description = description;
  if (icon != null) body.icon = icon;
  if (color != null) body.color = color;

  let parentId = parent ?? undefined;
  if (parentId === null) {
    body.parent = null; // clear parent
  } else if (parent_full_slug && parentId === undefined) {
    try {
      const r = await getCategoryByPath(parent_full_slug);
      if (r?.id != null) body.parent = r.id;
    } catch {
      // ignore if not found; server will validate
    }
  } else if (parentId !== undefined) {
    body.parent = parentId;
  }

  const res = await axios.patch(`categories/${id}/`, body);
  return res.data;
};
