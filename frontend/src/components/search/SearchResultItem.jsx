import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  Crown,
  Building,
  MapPin,
  Phone,
  Globe,
  MessageSquare,
  MessageCircle,
  Mail,
  Link2,
} from "lucide-react";

/* ----------------------------- helpers ----------------------------- */

const encodeSegments = (s) =>
  String(s || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

const buildBusinessUrl = (b) => {
  const slug = encodeURIComponent(b?.slug || "");
  if (b?.category_full_slug && b?.slug) {
    return `/business/${encodeSegments(b.category_full_slug)}/${slug}`;
  }
  return `/business/${slug}`;
};

const categoryHrefOf = (b) => {
  if (b?.category_full_slug) return `/${encodeSegments(b.category_full_slug)}`;
  if (b?.category_id != null) return `/Category?id=${encodeURIComponent(b.category_id)}`;
  return null;
};
const categoryLabelOf = (b) =>
  (typeof b?.category_name === "string" && b.category_name) ||
  (b?.category && typeof b.category === "object" && b.category.name) ||
  (typeof b?.category === "string" ? b.category : "") ||
  "—";

const renderStars = (rating) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < Math.round(Number(rating) || 0)
          ? "text-yellow-400 fill-current"
          : "text-gray-300"
          }`}
      />
    ))}
  </div>
);

const formatAddress = (obj) => {
  const line1 = String(obj?.street_address || "").trim();
  const cityState = [obj?.city, obj?.state].filter(Boolean).join(", ");
  const zip = String(obj?.zip || "").trim();
  return [line1, cityState, zip].filter(Boolean).join(" · ");
};

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

const normalizeForTel = (phone) =>
  String(phone || "")
    .trim()
    .replace(/(?!^\+)\D/g, "");
const normalizeForWa = (phone) => String(phone || "").replace(/\D/g, "");
const toWhatsAppDigits = (phone) => {
  const digits = normalizeForWa(phone);
  if (!digits) return "";
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
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

// Email
const toMailto = (email) => {
  const v = String(email || "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return ok ? `mailto:${v}` : "";
};

// Simple works_for url getter
const getWorksForUrl = (b) => {
  const v = b?.works_for_url || b?.works_for || "";
  const safe = toSafeWebsite(v);
  return safe;
};

const buildCareerSummary = (b) => {
  const docBits = [b?.specialty, b?.practice_names, b?.educations]
    .map((t) => String(t || "").trim())
    .filter(Boolean);

  const bizBits = [
    b?.practice_areas,
    b?.work_experience,
    b?.honors,
    b?.education,
    b?.speaking_engagements,
    b?.publications,
  ]
    .map((t) => String(t || "").trim())
    .filter(Boolean);

  const joined = (docBits.length ? docBits : bizBits).join(" • ");
  return joined ? truncate(joined, 220) : "";
};

const truncate = (text, max) =>
  String(text || "").length > max
    ? `${String(text).slice(0, max - 1)}…`
    : String(text || "");

/* ----------------------------- component ----------------------------- */

export default function SearchResultItem({ business }) {
  const url = buildBusinessUrl(business);
  const catHref = categoryHrefOf(business);
  const catLabel = categoryLabelOf(business);

  const rating = Number(business?.average_rating ?? 0);
  const reviews = Number(business?.total_reviews ?? 0);

  const address = formatAddress(business);
  const telHref = toTelHref(business?.phone);
  const smsHref = toSmsHref(business?.phone);
  const waHref = toWhatsAppHref(business?.phone);
  const site = toSafeWebsite(business?.website);
  const mailHref = toMailto(business?.email);
  const worksForUrl = getWorksForUrl(business);

  const canCall = Boolean(telHref);
  const canSms = Boolean(smsHref);
  const canWhatsApp = Boolean(waHref);
  const canVisit = Boolean(site);
  const canEmail = Boolean(mailHref);

  const title =
    business?.name ||
    business?.provider_name ||
    "Listing";

  const description = truncate(business?.description || "", 260);
  const career = buildCareerSummary(business);

  return (
    <Card
      className={`hover:shadow-md transition-shadow duration-300 ${business.is_premium ? "border-2 border-yellow-400 premium-glow" : ""
        }`}
    >
      <CardContent className="p-4 md:p-6">
        {/* ===== Top: rating + premium ===== */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {renderStars(rating)}
            <span className="font-semibold text-sm">
              {Number.isFinite(rating) ? rating.toFixed(1) : "0.0"}
            </span>
            <span className="text-sm text-gray-500">({reviews} reviews)</span>
          </div>
          {business.is_premium && (
            <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black border-0">
              <Crown className="w-3 h-3 mr-1" />
              Premium
            </Badge>
          )}
        </div>

        {/* ===== Center: title + category badge link ===== */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <Link to={url} className="group flex-1">
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              {title}
            </h3>
          </Link>
          {catHref ? (
            <Link to={catHref}>
              <Badge variant="secondary" className="hover:bg-gray-200">
                {catLabel}
              </Badge>
            </Link>
          ) : (
            <Badge variant="secondary">{catLabel}</Badge>
          )}
        </div>

        {/* ===== Below: image + (Description / Career) + contact + actions ===== */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Image / Placeholder */}
          <Link to={url} className="md:w-56 flex-shrink-0 block">
            {business.image_url ? (
              <div className="w-full h-48 md:h-40 flex items-center justify-center overflow-hidden rounded-md bg-gray-100">
                <img
                  src={business.image_url}
                  alt={`Image for ${title}`}
                  className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                />
              </div>
            ) : (
              <div className="w-full h-48 md:h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-md">
                <Building className="w-16 h-16 text-gray-400" />
              </div>
            )}
          </Link>

          {/* Middle column */}
          <div className="flex-1 min-w-0">
            {description && (
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Description</h4>
                <p className="text-sm text-gray-700 line-clamp-3">{description}</p>
              </div>
            )}
            {career && (
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                  Career &amp; Experience
                </h4>
                <p className="text-sm text-gray-700 line-clamp-3">{career}</p>
              </div>
            )}

            {/* Working with/for (simple external link) */}
            {worksForUrl && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Link2 className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">Working with/for:</span>
                <a
                  href={worksForUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate"
                  title={worksForUrl}
                >
                  {worksForUrl.replace(/^https?:\/\//i, "")}
                </a>
              </div>
            )}

            {/* Contact strip */}
            <div className="mt-3 text-sm text-gray-700 space-y-2">
              {address && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{address}</span>
                </div>
              )}
              {business.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{business.phone}</span>
                </div>
              )}
              {business.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{business.email}</span>
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

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild disabled={!canCall}>
                <a
                  href={canCall ? telHref : undefined}
                  aria-disabled={!canCall}
                  title={canCall ? `Call ${business?.phone}` : "Phone not available"}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </a>
              </Button>

              <Button variant="secondary" asChild disabled={!canSms}>
                <a
                  href={canSms ? smsHref : undefined}
                  aria-disabled={!canSms}
                  title={canSms ? "Send SMS" : "Phone not available"}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  SMS
                </a>
              </Button>

              <Button variant="secondary" asChild disabled={!canWhatsApp}>
                <a
                  href={canWhatsApp ? waHref : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!canWhatsApp}
                  title={canWhatsApp ? "Open WhatsApp chat" : "Phone not available"}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp
                </a>
              </Button>

              <Button variant="secondary" asChild disabled={!mailHref}>
                <a
                  href={mailHref || undefined}
                  aria-disabled={!mailHref}
                  title={mailHref ? `Email ${business?.email}` : "Email not available"}
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
                  title={canVisit ? "Open website" : "Website not available"}
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Visit Website
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
