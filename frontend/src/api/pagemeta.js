import axios from './axiosClient';

const BASE = 'seo/page-meta/';

/** One page (offset/limit) reader that returns { items, count, next, previous } */
export const listPageMetaPaged = async (params = {}) => {
  const res = await axios.get(BASE, { params });
  const data = res.data || {};
  const items = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : [];
  const count = typeof data.count === 'number' ? data.count : items.length;
  return { items, count, next: data.next || null, previous: data.previous || null };
};

export const listPageMetaByIds = async ({ businessIds = [], doctorIds = [] } = {}) => {
  const params = {};
  if (businessIds.length) params.business_ids = businessIds.join(',');
  if (doctorIds.length) params.doctor_ids = doctorIds.join(',');
  if (!params.business_ids && !params.doctor_ids) return [];
  const res = await axios.get(`${BASE}by-ids/`, { params });
  return Array.isArray(res.data) ? res.data : [];
};

async function fetchAllPagedResilient(
  fetchPageFn,
  {
    initialPageSize = 100,
    minPageSize = 10,
    maxRows = 10000,
    baseParams = {},
  } = {}
) {
  const out = [];
  let offset = 0;

  async function fetchWindow(off, pageSize) {
    try {
      const { items } = await fetchPageFn({
        ...baseParams,
        limit: pageSize,
        offset: off,
        ordering: baseParams.ordering || '-updated_at',
      });
      return Array.isArray(items) ? items : [];
    } catch (err) {
      if (pageSize > minPageSize) {
        const smaller = Math.max(minPageSize, Math.floor(pageSize / 2));
        return fetchWindow(off, smaller);
      }
      throw err;
    }
  }

  while (out.length < maxRows) {
    let items = [];
    try {
      items = await fetchWindow(offset, initialPageSize);
    } catch (e) {
      console.error('PageMeta: paged fetch failed at offset', offset, e);
      break;
    }
    if (!items.length) break;

    out.push(...items);
    offset += items.length;

    if (items.length < initialPageSize) break;
  }

  return out.slice(0, maxRows);
}

export const listPageMeta = async (params = {}) => {
  return fetchAllPagedResilient(listPageMetaPaged, {
    initialPageSize: 100,
    minPageSize: 10,
    maxRows: 10000,
    baseParams: params,
  });
};

export const createPageMeta = async (payload) => {
  const res = await axios.post(BASE, payload);
  return res.data;
};

export const updatePageMeta = async (id, payload) => {
  const res = await axios.patch(`${BASE}${id}/`, payload);
  return res.data;
};
