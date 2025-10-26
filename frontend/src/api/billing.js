import axios from "./axiosClient";

export const createCheckoutSession = async ({ plan = "monthly", success_url, cancel_url } = {}) => {
  const res = await axios.post("billing/create-checkout-session/", {
    plan,
    success_url,
    cancel_url,
  });
  return res.data; // {id, url?}
};

export const createPortalSession = async ({ return_url }) => {
  const res = await axios.post("billing/create-portal-session/", { return_url });
  return res.data; // {url}
};