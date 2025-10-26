import axios from './axiosClient';
import { unwrap } from './_helpers';

/**
 * Normalize DRF responses:
 * - Paginated: {count, next, previous, results:[...]}
 * - Array: [...]
 */
const normalize = (data) => {
  const items = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : [];
  const count =
    typeof data?.count === 'number'
      ? data.count
      : Array.isArray(items)
      ? items.length
      : 0;

  return {
    items,
    count,
    next: data?.next || null,
    previous: data?.previous || null,
  };
};

/**
 * Unified search across lawyers (businesses) and doctors.
 *
 * @param {Object} params
 * @param {string} [params.q]               - free text (name, specialty, etc.)
 * @param {'lawyer'|'doctor'} [params.type] - filter by vertical
 * @param {string} [params.city]
 * @param {string} [params.state]
 * @param {string} [params.category_path]   - hierarchical category prefix (optional)
 * @param {string} [params.ordering]        - e.g. "-is_premium,-average_rating"
 * @param {number} [params.page]            - DRF page number
 * @param {number} [params.page_size]       - DRF page size
 * @param {number} [params.limit]           - DRF limit/offset style
 * @param {number} [params.offset]          - DRF limit/offset style
 *
 * @returns {Promise<{items:any[], count:number, next:string|null, previous:string|null}>}
 */
export const unifiedSearch = async (params = {}) => {
  const res = await axios.get('directory/search/', {
    // Send both page_size and limit so we work with either pagination style
    params: {
      page_size: params.page_size ?? params.limit ?? 24,
      limit: params.limit ?? params.page_size ?? 24,
      ...params,
    },
  });

  // If backend returns {count, results}, unwrap() might pass through;
  // normalize handles both shapes.
  const data = unwrap(res);
  return normalize(data);
};

/**
 * Convenience wrappers that force type filtering
 */
export const searchLawyers = (params = {}) =>
  unifiedSearch({ ...params, type: 'lawyer' });

export const searchDoctors = (params = {}) =>
  unifiedSearch({ ...params, type: 'doctor' });

/**
 * Lightweight suggestion endpoint using unified search with small page_size.
 * Returns just an array of items (no paging metadata).
 */
export const getSuggestions = async (q, extra = {}) => {
  const { items } = await unifiedSearch({
    q,
    page_size: 10,
    limit: 10,
    ordering: '-is_premium,-average_rating',
    ...extra,
  });
  return items;
};