// src/api/crowdfund.js
import axios from "./axiosClient";

const normType = (t) => (t === "doctor" ? "doctor" : "business");

/** GET the campaign for a listing (doctor or business) */
export const getCampaignForListing = async ({ id, type }) => {
  const res = await axios.get("crowdfund/campaigns/for-listing/", {
    params: { id, type: normType(type) },
  });
  return res.data || null;
};

/** Start checkout for a listing (doctor or business) */
export const createCrowdfundCheckout = async ({
  id,
  type,          // "business" | "doctor" (any case; we normalize)
  amountCents,
  donor_name,
  donor_email,
  return_url,
}) => {
  const res = await axios.post("crowdfund/checkout/start/", {
    id,
    type: normType(type),
    amount_cents: amountCents,
    donor_name,
    donor_email,
    return_url,
  });
  return res.data; // expect { url }
};
