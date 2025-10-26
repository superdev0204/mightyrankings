import axios from './axiosClient';
import { unwrap, getCount } from './_helpers';

const normalizeOrdering = (ordering = "") =>
  ordering
    .replaceAll("created_date", "created_at")
    .replaceAll("updated_date", "updated_at");

export const listReviews = async (params = {}) => {
  const p = { limit: 1000, ...params };

  // IMPORTANT: don't remap business_id -> business.
  // Different backends expect different keys. Pass through as provided.
  // If a caller sends business_id, we keep it. If they send business, we keep it.

  if (p.ordering) p.ordering = normalizeOrdering(p.ordering);

  const res = await axios.get('reviews/', { params: p });
  return unwrap(res);
};

export const getReview = async (id) => {
  const res = await axios.get(`reviews/${id}/`);
  return res.data;
};

export const countReviews = async (params = {}) => {
  const p = { ...params };
  if (p.ordering) p.ordering = normalizeOrdering(p.ordering);
  const res = await axios.get('reviews/', { params: { ...p, limit: 1 } });
  return getCount(res);
};

export const countPendingReviews = () => countReviews({ status: 'pending' });

// Use real field names directly (no alias needed)
export const getRecentReviews = ({ limit = 6 } = {}) =>
  listReviews({ status: 'active', limit, ordering: '-created_at' });

export const updateReview = async (id, data, { notify } = {}) => {
  const res = await axios.patch(`reviews/${id}/`, data, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

export const createReview = async (payload) => {
  // payload must include business_id (or business, depending on backend), rating, title, content, etc.
  const res = await axios.post('reviews/', payload);
  return res.data;
};

export const replyToReview = async (id, content) => {
  const res = await axios.post(`reviews/${id}/reply/`, { content });
  return res.data;
};

export const deleteReviewReply = async (id) => {
  const res = await axios.post(`reviews/${id}/delete_reply/`);
  return res.data;
};

export const markHelpful = async (id) => {
  const res = await axios.post(`reviews/${id}/helpful/`);
  return res.data;
};

export const flagReview = async (id, { note } = {}) => {
  const res = await axios.post(`reviews/${id}/flag/`, note ? { note } : {});
  return res.data;
};

export const getReviewFlags = async (reviewId) => {
  const res = await axios.get(`reviews/${reviewId}/flags/`);
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};
