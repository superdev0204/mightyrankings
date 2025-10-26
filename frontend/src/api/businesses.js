import axios from "./axiosClient";
import { unwrap, getCount } from "./_helpers";

/* ----------------------------- helpers ----------------------------- */

const encodePathSegments = (path) =>
  String(path || "")
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");

/** Build the canonical lawyer (business) URL path for routing */
export const businessPath = (b) => {
  const slug = encodeURIComponent(b?.slug || "");
  if (b?.category_full_slug && b?.slug) {
    return `/business/${encodePathSegments(b.category_full_slug)}/${slug}`;
  }
  return `/business/${slug}`;
};

/** Map caller-supplied object to the Business API payload (PATCH-safe) */
const toBusinessPayload = (src = {}) => {
  const pick = (k) => (src[k] !== undefined ? src[k] : undefined);
  const out = {
    // identity
    name: pick("name"),
    license: pick("license"),

    // address
    street_address: pick("street_address"),
    city: pick("city"),
    state: pick("state"),
    zip: pick("zip"),

    // profile
    description: pick("description"),
    practice_areas: pick("practice_areas"),
    honors: pick("honors"),
    work_experience: pick("work_experience"),
    associations: pick("associations"),
    education: pick("education"),
    speaking_engagements: pick("speaking_engagements"),
    publications: pick("publications"),
    language: pick("language"),

    // contact/media
    website: pick("website"),
    phone: pick("phone"),
    image_url: pick("image_url"),
    email: pick("email"),

    // simple “working with/for” URL (not a relation)
    works_for_url: pick("works_for_url") ?? pick("works_for"),

    // relations (ids)
    category_id: pick("category_id"),
    claimed_by_id: pick("claimed_by_id"),
    pending_claim_by_id: pick("pending_claim_by_id"),

    // claims meta
    pending_claim_notes: pick("pending_claim_notes"),

    // monetization / status
    is_premium: pick("is_premium"),
    premium_expires: pick("premium_expires"),
    status: pick("status"),
  };

  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

/* ----------------------------- queries ----------------------------- */

export const listBusinesses = async (params = {}) => {
  const res = await axios.get("businesses/", {
    params: { limit: 1000, ...params },
  });
  return unwrap(res);
};

export const listBusinessesPaged = async (params = {}) => {
  const res = await axios.get("businesses/", { params });
  const data = res.data || {};
  const items = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : [];
  const count = typeof data.count === "number" ? data.count : items.length;
  return {
    items,
    count,
    next: data.next || null,
    previous: data.previous || null,
  };
};

export const getBusiness = async (id) => {
  const res = await axios.get(`businesses/${id}/`);
  return res.data;
};

export const countBusinesses = async (params = {}) => {
  const res = await axios.get("businesses/", {
    params: { ...params, limit: 1 },
  });
  return getCount(res);
};

export const countPendingBusinesses = () =>
  countBusinesses({ status: "pending" });

/** Featured = premium-aware + top rated (server decides) */
export const getFeaturedBusinesses = async ({ limit = 8 } = {}) => {
  try {
    const res = await axios.get("businesses/featured/", { params: { limit } });
    const items = Array.isArray(res.data) ? res.data : [];
    return items.slice(0, limit);
  } catch {
    // fallback: emulate “featured”
    const res2 = await axios.get("businesses/", {
      params: { status: "active", ordering: "-average_rating", limit },
    });
    const data = res2.data || {};
    const items = Array.isArray(data.results)
      ? data.results
      : Array.isArray(data)
      ? data
      : [];
    return items.slice(0, limit);
  }
};
/** Filter by hierarchical category path (prefix) */
export const getBusinessesByCategoryPath = async (categoryPath, params = {}) =>
  listBusinesses({ category_path: categoryPath, ...params });

/* ----------------------------- mutations ----------------------------- */

export const createBusiness = async (data, { notify } = {}) => {
  const payload = toBusinessPayload(data);
  const res = await axios.post("businesses/", payload, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

export const updateBusiness = async (id, data, { notify } = {}) => {
  const payload = toBusinessPayload(data);
  const res = await axios.patch(`businesses/${id}/`, payload, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

/* ----------------------------- helpers ----------------------------- */

export const listBusinessesByIds = async (ids = []) => {
  if (!ids.length) return [];
  const res = await axios.get("businesses/", {
    params: { id__in: ids.join(","), limit: ids.length },
  });
  return unwrap(res);
};

export const bulkCreateBusinesses = async (
  items,
  { recalc = 0, allowFallback = false, signal } = {}
) => {
  try {
    const res = await axios.post(
      "businesses/bulk_create/",
      { items: items.map(toBusinessPayload) },
      { params: { recalc }, signal }
    );
    const created =
      typeof res.data?.created === "number" ? res.data.created : items.length;
    return { created, mode: "bulk" };
  } catch (err) {
    if (!allowFallback) throw err;

    const concurrency = 5;
    let idx = 0;
    let created = 0;

    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          await createBusiness(items[i]);
          created += 1;
        } catch {}
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      worker
    );
    await Promise.all(workers);
    return { created, mode: "fallback" };
  }
};

/** STRICT slug resolver -> exact only */
export const getBusinessBySlug = async (slug) => {
  try {
    const res = await axios.get("businesses/", { params: { slug, limit: 1 } });
    const items = unwrap(res);
    if (Array.isArray(items) && items[0]?.slug === slug) return items[0];
  } catch {}
  try {
    const res = await axios.get(
      `businesses/by-slug/${encodeURIComponent(slug)}/`
    );
    if (res?.data?.slug === slug) return res.data;
  } catch {}
  return null;
};

/** Resolve by full category path + business slug */
export const getBusinessByPath = async (categoryPath, businessSlug) => {
  try {
    const url = `businesses/by-path/${encodePathSegments(
      categoryPath
    )}/${encodeURIComponent(businessSlug)}/`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
};

export const getBusinessesByIds = async (ids = []) => {
  if (!ids.length) return [];

  try {
    const r1 = await listBusinesses({
      id__in: ids.join(","),
      limit: ids.length,
    });
    if (Array.isArray(r1) && r1.length) return r1;
  } catch {}

  try {
    const r2 = await listBusinesses({ ids: ids.join(","), limit: ids.length });
    if (Array.isArray(r2) && r2.length) return r2;
  } catch {}

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getBusiness(id);
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
};

/* ----------------------------- claim workflow ----------------------------- */

export const claimBusiness = async (id, data = {}) => {
  const res = await axios.post(`businesses/${id}/claim/`, data);
  return res.data;
};

export const approveBusinessClaim = async (id, data = {}) => {
  const res = await axios.post(`businesses/${id}/approve_claim/`, data);
  return res.data;
};

export const rejectBusinessClaim = async (id, data = {}) => {
  const res = await axios.post(`businesses/${id}/reject_claim/`, data);
  return res.data;
};

export const setBusinessOwner = async (id, user_id /* or null */) => {
  const res = await axios.post(`businesses/${id}/set_owner/`, { user_id });
  return res.data;
};

/* ----------------------------- bulk set category (admin) ----------------------------- */

export const bulkSetCategory = async ({ ids = [], to_category_id }) => {
  const res = await axios.post("businesses/bulk_set_category/", {
    ids,
    to_category_id,
  });
  return res.data;
};

export const searchDirectory = async (q, params = {}) => {
  const p = { ...params };
  if (q && String(q).trim()) p.q = q; // don’t send empty q
  const res = await axios.get('unified_search/', { params: p });
  return Array.isArray(res.data?.items)
    ? res.data.items
    : (Array.isArray(res.data) ? res.data : []);
};
