import axios from './axiosClient';
import { unwrap, getCount } from './_helpers';

/* ----------------------------- helpers ----------------------------- */

const encodePathSegments = (path) =>
  String(path || '')
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');

export const doctorPath = (d) => {
   const slug = encodeURIComponent(d?.slug || '');
   if (d?.category_full_slug && d?.slug) {
     return `/business/${encodePathSegments(d.category_full_slug)}/${slug}`;
   }
   return `/business/${slug}`;
};

/**
 * Map a caller-supplied object to the Doctor API payload.
 * Only include keys that are present so PATCH updates are minimal.
 */
const toApiPayload = (src = {}) => {
  const pick = (k) => (src[k] !== undefined ? src[k] : undefined);
  const out = {
    // identity
    provider_name: pick('provider_name'),
    specialty: pick('specialty'),

    // profile
    description: pick('description'),
    insurances: pick('insurances'),
    popular_visit_reasons: pick('popular_visit_reasons'),

    // address
    street_address: pick('street_address'),
    city: pick('city'),
    state: pick('state'),
    zip: pick('zip'),

    // practice & education
    practice_names: pick('practice_names'),
    educations: pick('educations'),

    // misc
    languages: pick('languages'),
    gender: pick('gender'),
    npi_number: pick('npi_number'),

    // contact/media
    website: pick('website'),
    phone: pick('phone'),
    image_url: pick('image_url'),
    email: pick('email'),

    // simple “working with/for” URL (not a relation)
    works_for_url: pick('works_for_url') ?? pick('works_for'),

    // relations (ids)
    category_id: pick('category_id'),
    claimed_by_id: pick('claimed_by_id'),
    pending_claim_by_id: pick('pending_claim_by_id'),

    // claims meta
    pending_claim_notes: pick('pending_claim_notes'),

    // monetization / status
    is_premium: pick('is_premium'),
    premium_expires: pick('premium_expires'),
    status: pick('status'),
  };

  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
};

/* ----------------------------- queries ----------------------------- */

export const listDoctors = async (params = {}) => {
  const res = await axios.get('doctors/', { params: { limit: 1000, ...params } });
  return unwrap(res);
};

export const listDoctorsPaged = async (params = {}) => {
  const res = await axios.get('doctors/', { params });
  const data = res.data || {};
  const items = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : [];
  const count = typeof data.count === 'number' ? data.count : items.length;
  return { items, count, next: data.next || null, previous: data.previous || null };
};

export const getDoctor = async (id) => {
  const res = await axios.get(`doctors/${id}/`);
  return res.data;
};

export const countDoctors = async (params = {}) => {
  const res = await axios.get('doctors/', { params: { ...params, limit: 1 } });
  return getCount(res);
};

export const countPendingDoctors = () => countDoctors({ status: 'pending' });

/** Featured = premium-aware + top rated (server decides) */
export const getFeaturedDoctors = async ({ limit = 8 } = {}) => {
  const res = await axios.get('doctors/featured/', { params: { limit } });
  const items = Array.isArray(res.data) ? res.data : [];
  return items.slice(0, limit);
};

/** Filter by hierarchical category path (prefix) */
export const getDoctorsByCategoryPath = async (categoryPath, params = {}) =>
  listDoctors({ category_path: categoryPath, ...params });

/* ----------------------------- mutations ----------------------------- */

export const createDoctor = async (data, { notify } = {}) => {
  const payload = toApiPayload(data);
  const res = await axios.post('doctors/', payload, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

export const updateDoctor = async (id, data, { notify } = {}) => {
  const payload = toApiPayload(data);
  const res = await axios.patch(`doctors/${id}/`, payload, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

/* ----------------------------- helpers ----------------------------- */

export const listDoctorsByIds = async (ids = []) => {
  if (!ids.length) return [];
  const res = await axios.get('doctors/', {
    params: { id__in: ids.join(','), limit: ids.length },
  });
  return unwrap(res);
};

/** Bulk create (with optional fallback), mirrors businesses */
export const bulkCreateDoctors = async (
  items,
  { recalc = 0, allowFallback = false, signal } = {}
) => {
  try {
    const res = await axios.post(
      'doctors/bulk_create/',
      { items: items.map(toApiPayload) },
      { params: { recalc }, signal }
    );
    const created =
      typeof res.data?.created === 'number' ? res.data.created : items.length;
    return { created, mode: 'bulk' };
  } catch (err) {
    if (!allowFallback) throw err;

    const concurrency = 5;
    let idx = 0;
    let created = 0;

    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          await createDoctor(items[i]);
          created += 1;
        } catch {}
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      worker
    );
    await Promise.all(workers);
    return { created, mode: 'fallback' };
  }
};

/** STRICT slug resolver -> exact only */
export const getDoctorBySlug = async (slug) => {
  try {
    const res = await axios.get('doctors/', { params: { slug, limit: 1 } });
    const items = unwrap(res);
    if (Array.isArray(items) && items[0]?.slug === slug) return items[0];
  } catch {}
  try {
    const res = await axios.get(`doctors/by-slug/${encodeURIComponent(slug)}/`);
    if (res?.data?.slug === slug) return res.data;
  } catch {}
  return null;
 };

/** Resolve by full category path + doctor slug */
export const getDoctorByPath = async (categoryPath, doctorSlug) => {
  try {
    const url = `doctors/by-path/${encodePathSegments(categoryPath)}/${encodeURIComponent(
      doctorSlug
    )}/`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
};

export const getDoctorsByIds = async (ids = []) => {
  if (!ids.length) return [];

  try {
    const r1 = await listDoctors({ id__in: ids.join(','), limit: ids.length });
    if (Array.isArray(r1) && r1.length) return r1;
  } catch {}

  try {
    const r2 = await listDoctors({ ids: ids.join(','), limit: ids.length });
    if (Array.isArray(r2) && r2.length) return r2;
  } catch {}

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getDoctor(id);
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
};

/* ----------------------------- claim workflow ----------------------------- */

export const claimDoctor = async (id, data = {}) => {
  const res = await axios.post(`doctors/${id}/claim/`, data);
  return res.data;
};

export const approveDoctorClaim = async (id, data = {}) => {
  const res = await axios.post(`doctors/${id}/approve_claim/`, data);
  return res.data;
};

export const rejectDoctorClaim = async (id, data = {}) => {
  const res = await axios.post(`doctors/${id}/reject_claim/`, data);
  return res.data;
};

export const setDoctorOwner = async (id, user_id /* or null */) => {
  const res = await axios.post(`doctors/${id}/set_owner/`, { user_id });
  return res.data;
};

/* ----------------------------- bulk set category (admin) ----------------------------- */

export const bulkSetDoctorCategory = async ({ ids = [], to_category_id }) => {
  const res = await axios.post('doctors/bulk_set_category/', { ids, to_category_id });
  return res.data;
};
