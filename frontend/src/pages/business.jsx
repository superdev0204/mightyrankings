import React, { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";

import Seo from "@/components/common/Seo";
import BusinessStats from "@/components/business/BusinessStats";
import ReviewsList from "@/components/business/ReviewsList";
import WriteReviewForm from "@/components/business/WriteReviewForm";
import ClaimBusinessDialog from "@/components/business/ClaimBusinessDialog";
import CrowdfundWidget from "@/components/business/CrowdfundWidget";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building,
  Crown,
  Frown,
  Globe,
  MapPin,
  Phone,
  Star,
  Tag as TagIcon,
  MessageSquare,
  MessageCircle,
  Mail,
  Link2,
} from "lucide-react";

// APIs
import { me as getMe } from "@/api/users";
import {
  getBusiness,
  getBusinessBySlug,
  getBusinessByPath,
} from "@/api/businesses";
import { getDoctor, getDoctorBySlug, getDoctorByPath } from "@/api/doctors";
import { listReviews } from "@/api/reviews";

/* -------------------- helpers -------------------- */

const encodeSegments = (s) =>
  String(s || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

// localStorage helpers for pending review toast clearing
function readPendingFlag(key) {
  const raw = key ? localStorage.getItem(key) : null;
  if (!raw) return null;
  if (raw === "1") return { since: null };
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.since === "number") return { since: obj.since };
  } catch {}
  return { since: null };
}
function clearPendingFlag(key) {
  if (key) localStorage.removeItem(key);
}

// rating stars
const renderStars = (rating, size = 5) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`${size === 5 ? "w-5 h-5" : "w-4 h-4"} ${
          i < Math.round(Number(rating) || 0)
            ? "text-yellow-400 fill-current"
            : "text-gray-300"
        }`}
      />
    ))}
  </div>
);

// website normalization
const toSafeWebsite = (url) => {
  const v = String(url || "").trim();
  if (!v) return "";
  try {
    const hasProto = /^https?:\/\//i.test(v);
    const u = new URL(hasProto ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
};

// email -> mailto
const toMailto = (email) => {
  const v = String(email || "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return ok ? `mailto:${v}` : "";
};

// simple “working with/for” URL getter (string only)
const getWorksForUrl = (obj) => {
  const v = obj?.works_for_url || obj?.works_for || "";
  return toSafeWebsite(v);
};

// tel / sms / whatsapp helpers
const normalizeForTel = (phone) =>
  String(phone || "")
    .trim()
    .replace(/(?!^\+)\D/g, "");
const normalizeForWa = (phone) => String(phone || "").replace(/\D/g, "");
const toWhatsAppDigits = (phone) => {
  const digits = normalizeForWa(phone);
  if (!digits) return "";
  if (digits.length === 10) return `1${digits}`; // assume US local => +1
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits; // pass through if already intl
};
const toTelHref = (phone) => {
  const norm = normalizeForTel(phone);
  return norm ? `tel:${norm}` : "";
};
const toSmsHref = (phone) => {
  const norm = normalizeForTel(phone);
  return norm ? `sms:${norm}` : "";
};
const toWhatsAppHref = (phone) => {
  const digits = toWhatsAppDigits(phone);
  return digits ? `https://wa.me/${digits}` : "";
};

const formatAddress = (obj) => {
  const line1 = String(obj?.street_address || "").trim();
  const cityState = [obj?.city, obj?.state].filter(Boolean).join(", ");
  const zip = String(obj?.zip || "").trim();
  return [line1, cityState, zip].filter(Boolean).join(" · ");
};

// derive simple tags for businesses (from practice_areas)
const practiceAreasToTags = (practice_areas) => {
  const text = String(practice_areas || "");
  if (!text) return [];
  return text
    .split(/[;,|]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s*:\s*\d+%$/i, ""));
};

// derive simple tags for doctors (specialty / languages / visit reasons)
const deriveDoctorTags = (doctor) => {
  const parts = [doctor?.specialty, doctor?.languages, doctor?.popular_visit_reasons]
    .map((t) => String(t || ""))
    .filter(Boolean)
    .join(";");
  if (!parts) return [];
  return parts
    .split(/[;,|]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 24);
};

/* -------------------- page -------------------- */

export default function BusinessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  // Raw records (one of these will be used)
  const [entityType, setEntityType] = useState("business"); // "business" | "doctor"
  const [business, setBusiness] = useState(null);
  const [doctor, setDoctor] = useState(null);

  const [reviews, setReviews] = useState([]);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [error, setError] = useState("");

  const [clearPendingSignal, setClearPendingSignal] = useState(0);

  // Parse URL target for both kinds
  const parseTarget = () => {
    // ?id= takes precedence
    const qpId = searchParams.get("id");
    if (qpId) return { id: qpId };

    const { slug: slugParam, id: idParam, categorySlug } = params || {};
    if (idParam) return { id: idParam }; // legacy /business/:id-:rest
    if (slugParam && categorySlug) {
      // /business/:categorySlug/:slug  (we also accept /doctor/... but canonicalize to /business/…)
      const segs = location.pathname.split("/").filter(Boolean);
      const theSlug = segs[segs.length - 1];
      const catPath = segs.slice(1, -1).join("/"); // everything after /business or /doctor, minus the final slug
      return { byPath: { catPath, theSlug } };
    }
    if (slugParam) return { slug: slugParam }; // /business/:slug

    // Fallback: infer from path shape
    const segs = location.pathname.split("/").filter(Boolean);
    if (
      segs.length >= 3 &&
      (segs[0]?.toLowerCase() === "business" || segs[0]?.toLowerCase() === "doctor")
    ) {
      const theSlug = segs[segs.length - 1];
      const catPath = segs.slice(1, -1).join("/");
      return { byPath: { catPath, theSlug } };
    }
    if (segs.length >= 2) {
      const theSlug = segs[segs.length - 1];
      const catPath = segs.slice(0, -1).join("/");
      return { byPath: { catPath, theSlug } };
    }
    return {};
  };

  // Load user + entity
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        // user
        try {
          const u = await getMe();
          if (!cancelled) setUser(u || null);
        } catch {
          if (!cancelled) setUser(null);
        }

        const target = parseTarget();

        // 1) Try BUSINESS (by-path -> by-slug -> by-id)
        let b = null;
        if (target.byPath) {
          b = await getBusinessByPath(target.byPath.catPath, target.byPath.theSlug);
          if (!b && target.byPath.theSlug) b = await getBusinessBySlug(target.byPath.theSlug);
        } else if (target.slug) {
          b = await getBusinessBySlug(target.slug);
        } else if (target.id) {
          b = await getBusiness(target.id);
        }

        // IMPORTANT: the "business" endpoints can return a DOCTOR (server fallback).
        // Detect that and flip to doctor mode right away.
        if (!cancelled && b) {
          const looksDoctor = !!b.provider_name && !b.name;
          if (looksDoctor) {
            if (!b.status || String(b.status) === "active") {
              setDoctor(b);         // payload is already Doctor-shaped (DoctorSerializer)
              setBusiness(null);
              setEntityType("doctor");
              return;
            } else {
              setError("This doctor is not currently active.");
              setDoctor(null);
              setBusiness(null);
              return;
            }
          }
        }

        if (!cancelled && b && (!b.status || String(b.status) === "active")) {
          setBusiness(b);
          setDoctor(null);
          setEntityType("business");
          return;
        }

        // 2) Fallback: DOCTOR (by-path -> by-slug -> by-id)
        let d = null;
        if (target.byPath) {
          d = await getDoctorByPath(target.byPath.catPath, target.byPath.theSlug);
          if (!d && target.byPath.theSlug) d = await getDoctorBySlug(target.byPath.theSlug);
        } else if (target.slug) {
          d = await getDoctorBySlug(target.slug);
        } else if (target.id) {
          d = await getDoctor(target.id);
        }

        if (!cancelled && d && (!d.status || String(d.status) === "active")) {
          setDoctor(d);
          setBusiness(null);
          setEntityType("doctor");
          return;
        }

        if (!cancelled) {
          setError(
            b
              ? "This business is not currently active."
              : d
              ? "This doctor is not currently active."
              : "Listing not found."
          );
          setBusiness(null);
          setDoctor(null);
        }
      } catch (e) {
        console.error("Error loading entity:", e);
        if (!cancelled) setError("Failed to load page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams.toString()]);

  // Canonicalize to hierarchical URL when possible (always under /business)
  useEffect(() => {
    const base = "/business";
    const obj = entityType === "doctor" ? doctor : business;
    if (!obj) return;

    const canonical =
      obj?.category_full_slug && obj?.slug
        ? `${base}/${encodeSegments(obj.category_full_slug)}/${encodeURIComponent(obj.slug)}`
        : obj?.slug
        ? `${base}/${encodeURIComponent(obj.slug)}`
        : null;

    if (canonical && location.pathname !== canonical) {
      navigate(canonical, { replace: true });
    }
  }, [entityType, doctor, business, location.pathname, navigate]);

  // Reviews
  const loadReviews = async (id) => {
    setLoadingReviews(true);
    try {
      const items = await listReviews({
        [entityType]: id, // business=<id> or doctor=<id>
        ordering: "-created_at",
        limit: 1000,
      });

      const visible = (items || []).filter(
        (r) => r.status === "active" || r.status === "flagged"
      );
      setReviews(visible);

      const record = entityType === "doctor" ? doctor : business;
      if (user?.id && record?.id) {
        const pendKey =
          entityType === "doctor"
            ? `mr:pendingReview:doctor:${record.id}:${user.id}`
            : `mr:pendingReview:${record.id}:${user.id}`;
        const flag = readPendingFlag(pendKey);
        if (flag) {
          const sinceMs = flag.since;
          const approved = visible.filter((r) => r.status === "active");
          if (approved.length) {
            const hasNewApproved = approved.some((r) => {
              if (r.user_id !== user.id) return false;
              if (!sinceMs) return true;
              const created = r.created_date ? Date.parse(r.created_date) : null;
              return created && created >= sinceMs - 60_000;
            });
            if (hasNewApproved) {
              clearPendingFlag(pendKey);
              setClearPendingSignal((n) => n + 1);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load reviews:", e);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  // (re)load reviews when entity or user changes
  const activeId = entityType === "doctor" ? doctor?.id : business?.id;
  useEffect(() => {
    if (activeId) loadReviews(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, user?.id, entityType]);

  const handleReviewSubmitted = async () => {
    if (activeId) await loadReviews(activeId);
  };

  /* -------------------- derived values -------------------- */

  const obj = entityType === "doctor" ? doctor : business;

  const categoryName = useMemo(() => {
    if (!obj) return "—";
    if (obj.category_name) return obj.category_name;
    if (typeof obj.category === "string") return obj.category;
    return obj.category?.name || "—";
  }, [obj]);

  const categoryId = useMemo(() => {
    if (!obj) return null;
    return obj.category ?? obj.category_id ?? null;
  }, [obj]);

  const categoryHref = useMemo(() => {
    if (obj?.category_full_slug) {
      return "/" + encodeSegments(obj.category_full_slug);
    }
    if (categoryId != null) {
      return `/Category?id=${encodeURIComponent(categoryId)}`;
    }
    return null;
  }, [obj?.category_full_slug, categoryId]);

  const rating = Number(obj?.average_rating ?? 0);
  const totalReviews = Number(obj?.total_reviews ?? 0);
  const address = formatAddress(obj);

  const telHref = toTelHref(obj?.phone);
  const smsHref = toSmsHref(obj?.phone);
  const waHref = toWhatsAppHref(obj?.phone);
  const site = toSafeWebsite(obj?.website);

  const canCall = Boolean(telHref);
  const canSms = Boolean(smsHref);
  const canWhatsApp = Boolean(waHref);
  const canVisit = Boolean(site);

  // email + works_for link
  const mailHref = toMailto(obj?.email);
  const canEmail = Boolean(mailHref);
  const worksForUrl = getWorksForUrl(obj);

  // doctor tags vs business tags
  const tags =
    entityType === "doctor"
      ? deriveDoctorTags(doctor || {})
      : practiceAreasToTags(business?.practice_areas);

  // Projection so widgets keep working (BusinessStats, Claim dialog, Crowdfund)
  const bizLike = useMemo(() => {
    if (entityType === "doctor" && doctor) {
      return {
        id: doctor.id,
        name: doctor.provider_name,
        slug: doctor.slug,
        street_address: doctor.street_address,
        city: doctor.city,
        state: doctor.state,
        zip: doctor.zip,
        website: doctor.website,
        phone: doctor.phone,
        image_url: doctor.image_url,
        category_full_slug: doctor.category_full_slug,
        category_name: doctor.category_name,
        category_id: doctor.category_id,
        average_rating: doctor.average_rating,
        total_reviews: doctor.total_reviews,
        is_premium: doctor.is_premium,
        status: doctor.status,
        claimed_by: doctor.claimed_by,
        claimed_by_id: doctor.claimed_by_id,
        claimed_at: doctor.claimed_at,
        pending_claim_by_id: doctor.pending_claim_by_id,
        pending_claim_notes: doctor.pending_claim_notes,
        pending_claim_requested_at: doctor.pending_claim_requested_at,
      };
    }
    return business || null;
  }, [entityType, doctor, business]);

  // derive the *actual* type from the loaded object (prevents wrong type in widgets)
  const resolvedType = doctor?.id ? "doctor" : business?.id ? "business" : null;

  /* -------------------- UI -------------------- */

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !obj) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center p-4">
        <Alert variant="destructive" className="max-w-lg">
          <Frown className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error || "Page could not be loaded."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const displayName =
    entityType === "doctor" ? doctor.provider_name : business.name;

  return (
    <>
      <Seo
        title={displayName}
        description={
          entityType === "doctor"
            ? doctor.description ||
              `Information about ${doctor.provider_name}${
                doctor.specialty ? `, ${doctor.specialty}` : ""
              }.`
            : business.description ||
              `Reviews and information for ${business.name}.`
        }
        imageUrl={obj.image_url}
        pageName={entityType}
        {...(entityType === "doctor"
          ? { doctorId: obj.id }
          : { businessId: obj.id })}
      />

      <div className="bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* ===== Header ===== */}
          <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {renderStars(rating)}
                <div className="text-lg font-semibold">
                  {Number.isFinite(rating) ? rating.toFixed(1) : "0.0"}
                </div>
                <div className="text-gray-500">({totalReviews} reviews)</div>
              </div>

              {obj.is_premium && (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                  <Crown className="w-3 h-3 mr-1" />
                  Premium
                </Badge>
              )}
            </div>

            {/* Name + Category */}
            <div className="flex items-center justify-between">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                {displayName}
              </h1>
              {categoryHref ? (
                <Link to={categoryHref}>
                  <Badge variant="secondary" className="hover:bg-gray-200">
                    {categoryName}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="secondary">{categoryName}</Badge>
              )}
            </div>

            {/* Image + Contact */}
            <div className="mt-4 flex flex-col md:flex-row gap-6">
              {obj.image_url ? (
                <img
                  src={obj.image_url}
                  alt={displayName}
                  className="w-full md:w-64 h-48 md:h-auto object-cover rounded-lg"
                />
              ) : (
                <div className="w-full md:w-64 h-48 bg-gray-100 flex items-center justify-center rounded-lg">
                  <Building className="w-20 h-20 text-gray-300" />
                </div>
              )}

              <div className="flex-1">
                <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                  {address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      {address}
                    </div>
                  )}
                  {obj.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-500" />
                      {obj.phone}
                    </div>
                  )}
                  {obj.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      {obj.email}
                    </div>
                  )}
                  {site && (
                    <a
                      href={site}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <Globe className="w-4 h-4" />
                      Visit Website
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild disabled={!canCall}>
                    <a
                      href={canCall ? telHref : undefined}
                      aria-disabled={!canCall}
                      title={
                        canCall ? `Call ${obj?.phone}` : "Phone not available"
                      }
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      {entityType === "doctor"
                        ? "Call office"
                        : "Call for a consultation"}
                    </a>
                  </Button>

                  <Button variant="secondary" asChild disabled={!canSms}>
                    <a
                      href={canSms ? smsHref : undefined}
                      aria-disabled={!canSms}
                      title={canSms ? "Send SMS" : "Phone not available"}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Send a Message
                    </a>
                  </Button>

                  <Button variant="secondary" asChild disabled={!canWhatsApp}>
                    <a
                      href={canWhatsApp ? waHref : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!canWhatsApp}
                      title={
                        canWhatsApp
                          ? "Open WhatsApp chat"
                          : "Phone not available"
                      }
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      WhatsApp
                    </a>
                  </Button>

                  <Button variant="secondary" asChild disabled={!canEmail}>
                    <a
                      href={canEmail ? mailHref : undefined}
                      aria-disabled={!canEmail}
                      title={canEmail ? `Email ${obj?.email}` : "Email not available"}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </a>
                  </Button>

                  <Button variant="outline" asChild disabled={!canVisit}>
                    <a
                      href={canVisit ? site : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!canVisit}
                      title={
                        canVisit ? "Open website" : "Website not available"
                      }
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      Visit Website
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Main content ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column: profile sections + reviews */}
            <div className="lg:col-span-2 space-y-8">
              {/* Working with/for — simple external link */}
              {worksForUrl && (
                <Card>
                  <CardContent className="p-6 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-gray-500" />
                    <div className="text-sm">
                      <span className="text-gray-600 mr-1">Working with/for:</span>
                      <a
                        href={worksForUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-words"
                        title={worksForUrl}
                      >
                        {worksForUrl.replace(/^https?:\/\//i, "")}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* About / Specialty (doctor) */}
              {entityType === "doctor"
                ? (doctor.description || doctor.specialty) && (
                    <Card>
                      <CardContent className="p-6">
                        <h2 className="text-xl font-semibold mb-2">
                          About {doctor.provider_name}
                        </h2>
                        {doctor.specialty && (
                          <p className="text-gray-700 mb-2">
                            <span className="font-medium">Specialty:</span>{" "}
                            {doctor.specialty}
                          </p>
                        )}
                        {doctor.description && (
                          <p className="text-gray-700 whitespace-pre-line">
                            {doctor.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                : business.description && (
                    <Card>
                      <CardContent className="p-6">
                        <h2 className="text-xl font-semibold mb-2">
                          About {business.name}
                        </h2>
                        <p className="text-gray-700 whitespace-pre-line">
                          {business.description}
                        </p>
                      </CardContent>
                    </Card>
                  )}

              {/* Doctor-only sections */}
              {entityType === "doctor" && doctor.insurances && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-2">
                      Insurances Accepted
                    </h2>
                    <p className="text-gray-700 whitespace-pre-line">
                      {doctor.insurances}
                    </p>
                  </CardContent>
                </Card>
              )}

              {entityType === "doctor" && doctor.popular_visit_reasons && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-2">
                      Popular Visit Reasons
                    </h2>
                    <p className="text-gray-700 whitespace-pre-line">
                      {doctor.popular_visit_reasons}
                    </p>
                  </CardContent>
                </Card>
              )}

              {entityType === "doctor" &&
                (doctor.practice_names || doctor.educations) && (
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <h2 className="text-xl font-semibold">
                        Practice & Education
                      </h2>
                      {doctor.practice_names && (
                        <section>
                          <h3 className="font-semibold mb-1">Practice Names</h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {doctor.practice_names}
                          </p>
                        </section>
                      )}
                      {doctor.educations && (
                        <section>
                          <h3 className="font-semibold mb-1">Educations</h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {doctor.educations}
                          </p>
                        </section>
                      )}
                    </CardContent>
                  </Card>
                )}

              {entityType === "doctor" &&
                (doctor.languages || doctor.gender || doctor.npi_number) && (
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <h2 className="text-xl font-semibold">
                        Additional Information
                      </h2>
                      {doctor.languages && (
                        <p>
                          <span className="font-medium">Languages:</span>{" "}
                          {doctor.languages}
                        </p>
                      )}
                      {doctor.gender && (
                        <p>
                          <span className="font-medium">Gender:</span>{" "}
                          {doctor.gender}
                        </p>
                      )}
                      {doctor.npi_number && (
                        <p>
                          <span className="font-medium">NPI Number:</span>{" "}
                          {doctor.npi_number}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

              {/* Business-only sections */}
              {entityType === "business" && business.practice_areas && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-2">
                      Practice Areas
                    </h2>
                    <p className="text-gray-700 whitespace-pre-line">
                      {business.practice_areas}
                    </p>
                  </CardContent>
                </Card>
              )}

              {entityType === "business" && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-2">
                      Fees &amp; Rates
                    </h2>
                    <div className="text-gray-700">
                      <div className="mb-1">
                        <span className="font-medium">Free Consultation?</span>{" "}
                        <span className="text-gray-600">
                          {business.free_consultation === true
                            ? "Yes"
                            : business.free_consultation === false
                            ? "No"
                            : "Contact for details"}
                        </span>
                      </div>
                      {business.fee_details && (
                        <div className="whitespace-pre-line">
                          {business.fee_details}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {entityType === "business" &&
                (business.license || business.licenses) && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold mb-2">Licenses</h2>
                      <p className="text-gray-700 whitespace-pre-line">
                        {business.licenses || business.license}
                      </p>
                    </CardContent>
                  </Card>
                )}

              {/* Tags */}
              {tags.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TagIcon className="w-4 h-4 text-gray-500" />
                      <h2 className="text-xl font-semibold">Tags</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((t, idx) => (
                        <Badge
                          key={`${t}-${idx}`}
                          variant="outline"
                          className="font-normal"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Business-only: Experience & Associations */}
              {entityType === "business" &&
                (business.work_experience ||
                  business.honors ||
                  business.education ||
                  business.speaking_engagements ||
                  business.publications) && (
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <h2 className="text-xl font-semibold">Experience</h2>

                      {business.work_experience && (
                        <section>
                          <h3 className="font-semibold mb-1">
                            Work Experience
                          </h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {business.work_experience}
                          </p>
                        </section>
                      )}

                      {business.honors && (
                        <section>
                          <h3 className="font-semibold mb-1">
                            Honors &amp; Achievements
                          </h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {business.honors}
                          </p>
                        </section>
                      )}

                      {business.education && (
                        <section>
                          <h3 className="font-semibold mb-1">Education</h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {business.education}
                          </p>
                        </section>
                      )}

                      {business.speaking_engagements && (
                        <section>
                          <h3 className="font-semibold mb-1">
                            Speaking Engagements
                          </h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {business.speaking_engagements}
                          </p>
                        </section>
                      )}

                      {business.publications && (
                        <section>
                          <h3 className="font-semibold mb-1">Publications</h3>
                          <p className="text-gray-700 whitespace-pre-line">
                            {business.publications}
                          </p>
                        </section>
                      )}
                    </CardContent>
                  </Card>
                )}

              {entityType === "business" && business.associations && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-2">Associations</h2>
                    <p className="text-gray-700 whitespace-pre-line">
                      {business.associations}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Reviews composer & list */}
              <WriteReviewForm
                // keep props stable
                businessId={obj.id}
                {...(entityType === "doctor" ? { doctorId: obj.id } : {})}
                user={user}
                clearPendingSignal={clearPendingSignal}
                onReviewSubmitted={handleReviewSubmitted}
              />
              {loadingReviews ? (
                <Card>
                  <CardContent className="p-6">Loading reviews…</CardContent>
                </Card>
              ) : (
                <ReviewsList reviews={reviews} />
              )}
            </div>

            {/* Right column: stats */}
            <div className="space-y-8">
              <BusinessStats business={bizLike} reviews={reviews} />
            </div>
          </div>

          {/* Claim box */}
          <div className="mt-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-bold text-lg mb-2">
                  {entityType === "doctor"
                    ? "Is this your practice?"
                    : "Is this your business?"}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Claim this page for free to respond to reviews, update your
                  details, and see analytics.
                </p>
                <ClaimButton business={bizLike} entityType={entityType} />
              </CardContent>
            </Card>
          </div>

          {/* Crowdfund */}
          {obj?.id && resolvedType && (
            <div className="mt-8">
              <CrowdfundWidget
                key={`${resolvedType}:${obj.id}`} // force remount if type changes
                business={bizLike}
                entityType={resolvedType}        // <- bulletproof type for API calls
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ClaimButton({ business, entityType }) {
  const [open, setOpen] = useState(false);
  const isClaimed = Boolean(business?.claimed_by || business?.claimed_by_id);

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        {isClaimed
          ? "If you are the owner of this listing and it has been claimed by someone else, please click here to submit a claim."
          : entityType === "doctor"
          ? "Claim This Listing"
          : "Claim This Business"}
      </Button>
      <ClaimBusinessDialog
        entityType={entityType} // ← drives which claim API is used
        business={business}     // projected shape
        original={business}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
