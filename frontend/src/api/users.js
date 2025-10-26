import axios from "./axiosClient";
import { unwrap, getCount } from "./_helpers";

const normalizeUser = (u = {}) => ({
  id: u.id,
  email: u.email,
  full_name:
    u.full_name ||
    [u.first_name, u.last_name].filter(Boolean).join(" ") ||
    u.username ||
    "User",
  user_type: u.user_type || (u.is_superuser ? "admin" : "reviewer"),
  claimed_businesses: u.claimed_businesses || [],
  premium_membership: Boolean(u.premium_membership ?? u.is_premium ?? false),
  created_date: u.created_date || u.date_joined || u.created_at,
  profile_image: u.profile_image || "",
  bio: u.bio || "",
  verified: Boolean(u.verified ?? u.is_verified ?? false),
  total_reviews: u.total_reviews || 0,
  ...u,
});

// If you deploy allauth on the same host as the SPA, this will be fine.
// If you host it elsewhere, set VITE_AUTH_ORIGIN to that origin.
const AUTH_ORIGIN =
  import.meta.env.VITE_AUTH_ORIGIN ||
  import.meta.env.VITE_BACKEND_ORIGIN ||
  window.location.origin;

// always return an ABSOLUTE URL
const absUrl = (path, base = AUTH_ORIGIN) => {
  // ensure leading slash
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  return new URL(p, base).toString();
};

// ---------- API ----------
export const me = async () => {
  const res = await axios.get("users/me/");
  return normalizeUser(res.data);
};

export const listUsers = async (params = {}) => {
  const res = await axios.get("users/", { params: { limit: 1000, ...params } });
  return unwrap(res);
};

export const createUser = async (payload, { notify } = {}) => {
  const res = await axios.post("users/", payload, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

export const updateUser = async (id, data, { notify } = {}) => {
  const res = await axios.patch(`users/${id}/`, data, {
    params: notify ? { notify: 1 } : {},
  });
  return res.data;
};

export const updateMe = async (payload) => {
  const res = await axios.patch("users/me/", payload);
  return res.data;
};
export const updateMyUserData = updateMe;

export const countUsers = async (params = {}) => {
  const res = await axios.get("users/", { params: { ...params, limit: 1 } });
  return getCount(res);
};

export const countPendingUsers = () => countUsers({ status: "pending" });

// ---------- Auth redirects (Google-only) ----------
export const loginWithRedirect = (returnTo = window.location.href) => {
  const url =
    absUrl("/accounts/google/login/") +
    `?process=login&next=${encodeURIComponent(returnTo)}`;
  window.location.assign(url);
};
export const login = loginWithRedirect;

export const logoutWithRedirect = (returnTo = window.location.origin) => {
  const url = absUrl("/accounts/logout/") + `?next=${encodeURIComponent(returnTo)}`;
  window.location.assign(url);
};
export const logout = logoutWithRedirect;

// Optional API logout
export const logoutUser = async () => {
  try {
    await axios.post("auth/logout/");
  } catch {
    /* no-op */
  }
};

export const hasAdmin = async () => {
  const res = await axios.get("users/has-admin/");
  return Boolean(res.data?.exists);
};
