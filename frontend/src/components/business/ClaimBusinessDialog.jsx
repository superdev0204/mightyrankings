import React, { useEffect, useMemo, useState } from "react";
import { claimBusiness } from "@/api/businesses";
import { claimDoctor } from "@/api/doctors";
import { me as getMe, loginWithRedirect } from "@/api/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Crown, CheckCircle, AlertCircle, Building, ChevronDown } from "lucide-react";

/**
 * Props:
 * - entityType: "business" | "doctor" (default "business")
 * - business: the object used across your UI (bizLike for doctor page)
 * - original: (optional) pass the raw doctor object when entityType="doctor" so specialty/insurances/etc. can prefill
 * - open, onClose, onSuccess
 */
export default function ClaimBusinessDialog({
  business,
  original = null,
  open,
  onClose = () => {},
  onSuccess,
  entityType = "business",
}) {
  const isDoctor = entityType === "doctor";

  // Prefer a source that contains the most fields for prefill.
  // For doctors, `original` (raw doctor) may include doctor-only fields not present on bizLike.
  const source = useMemo(() => original || business || {}, [original, business]);

  // Name to display in titles. For doctor, use provider_name when available; otherwise fallback to "this listing".
  const safeName = useMemo(() => {
    const name =
      (isDoctor ? (source.provider_name || business?.name) : business?.name) ||
      source.name ||
      "";
    return name || "this listing";
  }, [isDoctor, source, business]);

  const isAlreadyClaimed = Boolean(business?.claimed_by || business?.claimed_by_id);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  // ---- Form data (union of business + doctor fields; we only show relevant ones) ----
  const [formData, setFormData] = useState({
    relationship: "",
    verification_notes: "",

    // common contact/media/address
    phone: "",
    website: "",
    image_url: "",
    description: "",
    street_address: "",
    city: "",
    state: "",
    zip: "",

    // business-only
    license: "",
    practice_areas: "",
    honors: "",
    work_experience: "",
    associations: "",
    education: "",
    speaking_engagements: "",
    publications: "",
    language: "",

    // doctor-only
    specialty: "",
    insurances: "",
    popular_visit_reasons: "",
    practice_names: "",
    educations: "",
    languages: "",
    gender: "",
    npi_number: "",
  });

  // when dialog opens, pull user & prefill fields
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const checkUserAuth = async () => {
      setCheckingAuth(true);
      try {
        const u = await getMe();
        if (!cancelled) setUser(u || null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    };

    const prefill = () => {
      const s = source || {};
      setFormData((prev) => ({
        ...prev,

        // contact/media/address
        phone: s.phone || "",
        website: s.website || "",
        image_url: s.image_url || "",
        description: s.description || "",
        street_address: s.street_address || "",
        city: s.city || "",
        state: s.state || "",
        zip: s.zip || "",

        // business-only
        license: s.license || "",
        practice_areas: s.practice_areas || "",
        honors: s.honors || "",
        work_experience: s.work_experience || "",
        associations: s.associations || "",
        education: s.education || "",
        speaking_engagements: s.speaking_engagements || "",
        publications: s.publications || "",
        language: s.language || "",

        // doctor-only
        specialty: s.specialty || "",
        insurances: s.insurances || "",
        popular_visit_reasons: s.popular_visit_reasons || "",
        practice_names: s.practice_names || "",
        educations: s.educations || "", // note: doctor uses 'educations' vs business 'education'
        languages: s.languages || "",
        gender: s.gender || "",
        npi_number: s.npi_number || "",
      }));
    };

    prefill();
    checkUserAuth();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleLogin = async () => {
    await loginWithRedirect(); // keeps return URL
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!user) {
      setError(`Please sign in to claim this listing.`);
      return;
    }
    if (!business?.id) {
      setError(`Listing is not loaded yet. Please try again.`);
      return;
    }
    if (!formData.relationship.trim()) {
      setError("Please describe your relationship to this listing.");
      return;
    }

    setLoading(true);
    try {
      const base = {
        relationship: formData.relationship,
        verification_notes: formData.verification_notes || undefined,

        // contact & media
        phone: formData.phone || undefined,
        website: formData.website || undefined,
        image_url: formData.image_url || undefined,

        // profile & address (common)
        description: formData.description || undefined,
        street_address: formData.street_address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zip: formData.zip || undefined,
      };

      if (isDoctor) {
        // doctor-specific payload
        const payload = {
          ...base,
          specialty: formData.specialty || undefined,
          insurances: formData.insurances || undefined,
          popular_visit_reasons: formData.popular_visit_reasons || undefined,
          practice_names: formData.practice_names || undefined,
          educations: formData.educations || undefined,
          languages: formData.languages || undefined,
          gender: formData.gender || undefined,
          npi_number: formData.npi_number || undefined,
        };
        await claimDoctor(business.id, payload);
      } else {
        // business-specific payload
        const payload = {
          ...base,
          license: formData.license || undefined,
          practice_areas: formData.practice_areas || undefined,
          honors: formData.honors || undefined,
          work_experience: formData.work_experience || undefined,
          associations: formData.associations || undefined,
          education: formData.education || undefined,
          speaking_engagements: formData.speaking_engagements || undefined,
          publications: formData.publications || undefined,
          language: formData.language || undefined,
        };
        await claimBusiness(business.id, payload);
      }

      setOk(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Error submitting claim:", err);
      const msg =
        err?.response?.data?.detail ||
        (typeof err?.response?.data === "string" ? err.response.data : null) ||
        "Failed to submit claim. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Render states (auth checks, success) ----------
  if (checkingAuth) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent
          aria-describedby="claim-auth-desc"
          className="sm:max-w-[420px] w-[95vw]"
          style={{ maxHeight: "88vh", overflow: "hidden" }}
        >
          <DialogHeader>
            <DialogTitle>Checking your account…</DialogTitle>
            <DialogDescription id="claim-auth-desc">
              Please wait while we verify your sign-in status.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent
          aria-describedby="claim-login-desc"
          className="sm:max-w-[420px] w-[95vw]"
          style={{ maxHeight: "88vh", overflow: "hidden" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" />
              Sign in to {isAlreadyClaimed ? "submit a transfer request" : "claim"}
            </DialogTitle>
            <DialogDescription id="claim-login-desc">
              You need to sign in to {isAlreadyClaimed ? "request ownership transfer of " : "claim "}
              <strong>{safeName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="text-center py-4">
            <Building className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <p className="text-gray-600 mb-6">This helps us verify legitimate owners.</p>
            <div className="space-y-3">
              <Button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700">
                Create Account / Sign In
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full">
                Cancel
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-4">Free account • Secure verification • Manage your listing</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (ok) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent
          aria-describedby="claim-success-desc"
          className="sm:max-w-[420px] w-[95vw]"
          style={{ maxHeight: "88vh", overflow: "hidden" }}
        >
          <DialogHeader>
            <DialogTitle>
              {isAlreadyClaimed ? "Transfer request submitted" : "Claim submitted"}
            </DialogTitle>
            <DialogDescription id="claim-success-desc">
              We’ll review your request and email you with an update.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <div className="animate-pulse text-sm text-gray-500">Closing…</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- Main dialog ----------
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        aria-describedby="claim-form-desc"
        className="w-[95vw] sm:max-w-[720px] md:max-w-[900px] p-0"
        style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" />
              {isAlreadyClaimed ? "Submit an ownership claim" : `Claim “${safeName}”`}
            </DialogTitle>
            <DialogDescription id="claim-form-desc">
              {isAlreadyClaimed ? (
                <>Our records show this listing is already claimed. If you are the rightful owner, request review below.</>
              ) : (
                <>Tell us about your relationship and confirm or update details below.</>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="px-6 pb-2 overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
          <form id="claim-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Relationship & verification */}
            <div className="space-y-2">
              <Label htmlFor="relationship">Your Relationship *</Label>
              <Input
                id="relationship"
                value={formData.relationship}
                onChange={(e) => handleInputChange("relationship", e.target.value)}
                placeholder="Owner, Manager, Authorized Representative"
                required
              />
            </div>

            {/* Contact & website/media */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{isDoctor ? "Office Phone" : "Business Phone"}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder={source?.phone || (isDoctor ? "Office phone number" : "Business phone number")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">{isDoctor ? "Practice Website" : "Business Website"}</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleInputChange("website", e.target.value)}
                  placeholder={source?.website || (isDoctor ? "Practice website" : "Business website")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image_url">Image URL</Label>
                <Input
                  id="image_url"
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => handleInputChange("image_url", e.target.value)}
                  placeholder={source?.image_url || "https://…"}
                />
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="street_address">Street Address</Label>
                <Input
                  id="street_address"
                  value={formData.street_address}
                  onChange={(e) => handleInputChange("street_address", e.target.value)}
                  placeholder={source?.street_address || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder={source?.city || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  placeholder={source?.state || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">Zip</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => handleInputChange("zip", e.target.value)}
                  placeholder={source?.zip || ""}
                />
              </div>
            </div>

            {/* Short description */}
            <div className="space-y-2">
              <Label htmlFor="description">{isDoctor ? "Practice Description" : "Business Description"}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder={source?.description || (isDoctor ? "Describe your practice…" : "Describe your business…")}
                rows={3}
              />
            </div>

            {/* Collapsible: More details */}
            <details className="rounded-md border">
              <summary className="list-none cursor-pointer select-none px-3 py-2 flex items-center gap-2">
                <ChevronDown className="w-4 h-4" />
                <span className="font-medium">
                  {isDoctor ? "More practice details (optional)" : "More business details (optional)"}
                </span>
              </summary>

              <div className="p-3 pt-0 space-y-4">
                {/* Business-only block */}
                {!isDoctor && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="license">License(s)</Label>
                      <Textarea
                        id="license"
                        value={formData.license}
                        onChange={(e) => handleInputChange("license", e.target.value)}
                        placeholder={source?.license || "Add your license info…"}
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="practice_areas">Practice Areas</Label>
                        <Textarea
                          id="practice_areas"
                          value={formData.practice_areas}
                          onChange={(e) => handleInputChange("practice_areas", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="language">Language(s)</Label>
                        <Input
                          id="language"
                          value={formData.language}
                          onChange={(e) => handleInputChange("language", e.target.value)}
                          placeholder="e.g., English; Spanish"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="honors">Honors</Label>
                        <Textarea
                          id="honors"
                          value={formData.honors}
                          onChange={(e) => handleInputChange("honors", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="work_experience">Work Experience</Label>
                        <Textarea
                          id="work_experience"
                          value={formData.work_experience}
                          onChange={(e) => handleInputChange("work_experience", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="associations">Associations</Label>
                        <Textarea
                          id="associations"
                          value={formData.associations}
                          onChange={(e) => handleInputChange("associations", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="education">Education</Label>
                        <Textarea
                          id="education"
                          value={formData.education}
                          onChange={(e) => handleInputChange("education", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="speaking_engagements">Speaking Engagements</Label>
                        <Textarea
                          id="speaking_engagements"
                          value={formData.speaking_engagements}
                          onChange={(e) => handleInputChange("speaking_engagements", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="publications">Publications</Label>
                        <Textarea
                          id="publications"
                          value={formData.publications}
                          onChange={(e) => handleInputChange("publications", e.target.value)}
                          rows={2}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Doctor-only block */}
                {isDoctor && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="specialty">Specialty</Label>
                        <Input
                          id="specialty"
                          value={formData.specialty}
                          onChange={(e) => handleInputChange("specialty", e.target.value)}
                          placeholder={source?.specialty || ""}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="languages">Language(s)</Label>
                        <Input
                          id="languages"
                          value={formData.languages}
                          onChange={(e) => handleInputChange("languages", e.target.value)}
                          placeholder={source?.languages || "e.g., English; Spanish"}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="insurances">Insurances Accepted</Label>
                        <Textarea
                          id="insurances"
                          value={formData.insurances}
                          onChange={(e) => handleInputChange("insurances", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="popular_visit_reasons">Popular Visit Reasons</Label>
                        <Textarea
                          id="popular_visit_reasons"
                          value={formData.popular_visit_reasons}
                          onChange={(e) => handleInputChange("popular_visit_reasons", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="practice_names">Practice Names</Label>
                        <Textarea
                          id="practice_names"
                          value={formData.practice_names}
                          onChange={(e) => handleInputChange("practice_names", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="educations">Educations</Label>
                        <Textarea
                          id="educations"
                          value={formData.educations}
                          onChange={(e) => handleInputChange("educations", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Input
                          id="gender"
                          value={formData.gender}
                          onChange={(e) => handleInputChange("gender", e.target.value)}
                          placeholder={source?.gender || ""}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="npi_number">NPI Number</Label>
                        <Input
                          id="npi_number"
                          value={formData.npi_number}
                          onChange={(e) => handleInputChange("npi_number", e.target.value)}
                          placeholder={source?.npi_number || ""}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </details>

            {/* Additional verification */}
            <div className="space-y-2">
              <Label htmlFor="verification_notes">Additional Verification (optional)</Label>
              <Textarea
                id="verification_notes"
                value={formData.verification_notes}
                onChange={(e) => handleInputChange("verification_notes", e.target.value)}
                placeholder="Anything else to help verify your claim…"
                rows={2}
              />
            </div>

            {/* What happens next */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• We’ll review your {isAlreadyClaimed ? "ownership" : ""} claim</li>
                <li>• We may contact you for additional verification</li>
                <li>• Once approved, you can manage this listing</li>
              </ul>
            </div>
          </form>
        </div>

        {/* Sticky footer */}
        <div className="px-6 pb-6 pt-3 border-t bg-white">
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" form="claim-form" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading
                ? isAlreadyClaimed
                  ? "Submitting Request…"
                  : "Submitting Claim…"
                : isAlreadyClaimed
                ? "Submit Ownership Request"
                : "Submit Claim"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
