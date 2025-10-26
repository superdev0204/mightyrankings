import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { me as getCurrentUser, loginWithRedirect } from "@/api/users";
import { listBusinesses, listBusinessesByIds, getBusiness, updateBusiness } from "@/api/businesses";
import {
  listReviews,
  replyToReview,
  deleteReviewReply,
} from "@/api/reviews";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building, Star, MessageSquare, Eye, Crown, Edit,
  Calendar, MapPin, Phone, Globe, CheckCircle, Upload, X, Save
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

/** Small helper so we can safely read nested values */
const val = (v) => (v === null || v === undefined ? "" : v);

export default function OwnerDashboard() {
  const [user, setUser] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [allReviews, setAllReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("yearly");

  // edit state for Overview tab
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState("");

  // reply UI state
  const [replyDrafts, setReplyDrafts] = useState({});     // { [reviewId]: string }
  const [replyEditing, setReplyEditing] = useState({});   // { [reviewId]: boolean }
  const [replySaving, setReplySaving] = useState({});     // { [reviewId]: boolean }
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadDashboardData();
  }, []);

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(""), 3500);
  };

  const handleUpgrade = () => {
    const price = selectedPlan === "yearly" ? "$500/year" : "$50/month";
    alert(
      `Proceeding to payment for the ${selectedPlan} plan (${price}). This is a demo and no payment will be processed.`
    );
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const me = await getCurrentUser();
      setUser(me);

      // Prefer server-side filter by owner if available
      let owned = await listBusinesses({ claimed_by: me.id });

      // Fallback: if API doesn’t support claimed_by but your user payload includes ids
      if (
        (!owned || owned.length === 0) &&
        Array.isArray(me.claimed_businesses) &&
        me.claimed_businesses.length
      ) {
        owned = await listBusinessesByIds(me.claimed_businesses);
      }

      setBusinesses(owned || []);

      if (owned?.length) {
        const first = owned[0];
        setSelectedBusiness(first);

        // Load all reviews for these businesses
        const reviewPromises = owned.map((b) =>
          listReviews({ business_id: b.id, ordering: "-created_date" })
        );
        const reviewGroups = await Promise.all(reviewPromises);
        setAllReviews(reviewGroups.flat());
      } else {
        setAllReviews([]);
      }
    } catch (err) {
      console.error("Error loading owner dashboard:", err);
      setUser(null);
    }
    setLoading(false);
  };

  // Keep edit form in sync when we switch selected business
  useEffect(() => {
    if (!selectedBusiness) return;
    setIsEditing(false);
    setEditError("");
    setEditSaving(false);
    setEditForm({
      name: val(selectedBusiness.name),
      phone: val(selectedBusiness.phone),
      website: val(selectedBusiness.website),
      image_url: val(selectedBusiness.image_url),

      street_address: val(selectedBusiness.street_address),
      city: val(selectedBusiness.city),
      state: val(selectedBusiness.state),
      zip: val(selectedBusiness.zip),

      description: val(selectedBusiness.description),
      practice_areas: val(selectedBusiness.practice_areas),
      work_experience: val(selectedBusiness.work_experience),
      honors: val(selectedBusiness.honors),
      education: val(selectedBusiness.education),
      speaking_engagements: val(selectedBusiness.speaking_engagements),
      publications: val(selectedBusiness.publications),
      language: val(selectedBusiness.language),
    });
  }, [selectedBusiness?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderStars = (rating = 0) => (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < Math.round(Number(rating) || 0)
              ? "text-yellow-400 fill-current"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );

  const getReviewsForBusiness = (businessId) =>
    allReviews.filter((r) => Number(r.business_id) === Number(businessId));

  const canReplyForBusiness = (biz) => {
    if (!user || !biz) return false;
    const owns = biz.claimed_by_id ? Number(biz.claimed_by_id) === Number(user.id) : true;
    const hasPremium = Boolean(user.premium_membership) || Boolean(biz.is_premium);
    return owns && hasPremium; // backend still enforces this
  };

  const startReply = (review) => {
    setReplyEditing((s) => ({ ...s, [review.id]: true }));
    setReplyDrafts((s) => ({ ...s, [review.id]: review.owner_reply || "" }));
  };

  const cancelReply = (reviewId) => {
    setReplyEditing((s) => {
      const copy = { ...s };
      delete copy[reviewId];
      return copy;
    });
  };

  const setDraft = (reviewId, val) => {
    setReplyDrafts((s) => ({ ...s, [reviewId]: val }));
  };

  const setSaving = (reviewId, val) => {
    setReplySaving((s) => ({ ...s, [reviewId]: val }));
  };

  const updateReviewInState = (updated) => {
    setAllReviews((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  };

  const handleReplySave = async (review) => {
    const content = (replyDrafts[review.id] || "").trim();
    if (!content) {
      showToast("Please enter a reply before saving.");
      return;
    }
    setSaving(review.id, true);
    try {
      const updated = await replyToReview(review.id, content);
      updateReviewInState(updated);
      cancelReply(review.id);
      showToast("Reply posted.");
    } catch (e) {
      console.error("Failed to save reply:", e);
      showToast(
        e?.response?.data?.detail ||
          "Failed to save reply. You may need a premium membership."
      );
    } finally {
      setSaving(review.id, false);
    }
  };

  const handleReplyDelete = async (review) => {
    setSaving(review.id, true);
    try {
      const updated = await deleteReviewReply(review.id);
      updateReviewInState(updated);
      cancelReply(review.id);
      setDraft(review.id, "");
      showToast("Reply removed.");
    } catch (e) {
      console.error("Failed to delete reply:", e);
      showToast(e?.response?.data?.detail || "Failed to delete reply.");
    } finally {
      setSaving(review.id, false);
    }
  };

  // ----- Editing helpers -----
  const onEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEdit = () => {
    setIsEditing((e) => !e);
    setEditError("");
    if (!isEditing && selectedBusiness) {
      // fresh copy
      setEditForm({
        name: val(selectedBusiness.name),
        phone: val(selectedBusiness.phone),
        website: val(selectedBusiness.website),
        image_url: val(selectedBusiness.image_url),
        street_address: val(selectedBusiness.street_address),
        city: val(selectedBusiness.city),
        state: val(selectedBusiness.state),
        zip: val(selectedBusiness.zip),
        description: val(selectedBusiness.description),
        practice_areas: val(selectedBusiness.practice_areas),
        work_experience: val(selectedBusiness.work_experience),
        honors: val(selectedBusiness.honors),
        education: val(selectedBusiness.education),
        speaking_engagements: val(selectedBusiness.speaking_engagements),
        publications: val(selectedBusiness.publications),
        language: val(selectedBusiness.language),
      });
    }
  };

  const reloadSelectedBusiness = async () => {
    if (!selectedBusiness?.id) return;
    try {
      const fresh = await getBusiness(selectedBusiness.id);
      // update both selectedBusiness and list item
      setSelectedBusiness(fresh);
      setBusinesses((prev) => prev.map((b) => (b.id === fresh.id ? { ...b, ...fresh } : b)));
    } catch (e) {
      console.error("Failed to reload business:", e);
    }
  };

  const handleEditSave = async () => {
    setEditError("");
    if (!selectedBusiness?.id) return;

    const name = (editForm.name || "").trim();
    if (!name) {
      setEditError("Business name is required.");
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        name,
        phone: (editForm.phone || "").trim() || null,
        website: (editForm.website || "").trim() || null,
        image_url: (editForm.image_url || "").trim() || null,

        street_address: (editForm.street_address || "").trim() || null,
        city: (editForm.city || "").trim() || null,
        state: (editForm.state || "").trim() || null,
        zip: (editForm.zip || "").trim() || null,

        description: editForm.description ?? "",
        practice_areas: editForm.practice_areas ?? "",
        work_experience: editForm.work_experience ?? "",
        honors: editForm.honors ?? "",
        education: editForm.education ?? "",
        speaking_engagements: editForm.speaking_engagements ?? "",
        publications: editForm.publications ?? "",
        language: editForm.language ?? "",
      };

      // PATCH
      const updated = await updateBusiness(selectedBusiness.id, payload);

      // reflect in state
      setSelectedBusiness((prev) => ({ ...(prev || {}), ...updated }));
      setBusinesses((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));

      setIsEditing(false);
      showToast("Business updated.");
    } catch (e) {
      console.error("Failed to update business:", e);
      const msg =
        e?.response?.data?.detail ||
        (typeof e?.response?.data === "string" ? e.response.data : null) ||
        "Failed to update business.";
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditCancel = async () => {
    setIsEditing(false);
    setEditError("");
    await reloadSelectedBusiness();
  };

  const stats = (() => {
    const totalReviews = allReviews.length;
    const avg =
      businesses.length > 0
        ? businesses.reduce((s, b) => s + (Number(b.average_rating) || 0), 0) /
          businesses.length
        : 0;
    const totalBusinesses = businesses.length;
    const premiumBusinesses = businesses.filter((b) => b.is_premium).length;
    return { totalReviews, averageRating: avg, totalBusinesses, premiumBusinesses };
  })();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {Array(4)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!user || user.user_type !== "owner" || !businesses.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 text-center">
            <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            {!user ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Owner Dashboard Access
                </h2>
                <p className="text-gray-600 mb-6">
                  Sign in to access your business owner dashboard. You&apos;ll need to
                  claim a business first to use these features.
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={() => loginWithRedirect(window.location.href)}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Create Account / Sign In
                  </Button>
                  <Link to={createPageUrl("BusinessOwner")}>
                    <Button variant="outline" className="w-full">
                      Learn About Business Claims
                    </Button>
                  </Link>
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Free account • Claim your business • Manage reviews
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  No Businesses Found
                </h2>
                <p className="text-gray-600 mb-6">
                  You don&apos;t have any claimed businesses yet. Claim a business to
                  access this dashboard.
                </p>
                <div className="flex gap-4 justify-center">
                  <Link to={createPageUrl("Search")}>
                    <Button>Find Business to Claim</Button>
                  </Link>
                  <Link to={createPageUrl("AddBusiness")}>
                    <Button variant="outline">Add New Business</Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Owner Dashboard</h1>
              <p className="text-gray-600">
                Manage your claimed businesses and track their performance
              </p>
            </div>
            <Link to={createPageUrl("BulkUpload")}>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import Businesses
              </Button>
            </Link>
          </div>
        </div>

        {/* Simple toast */}
        {toast && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
            {toast}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Businesses</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalBusinesses}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Star className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Average Rating</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(stats.averageRating || 0).toFixed(1)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Reviews</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalReviews}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Crown className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Premium Listings</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.premiumBusinesses}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Business List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Your Businesses</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  {businesses.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBusiness(b)}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                        selectedBusiness?.id === b.id
                          ? "bg-blue-50 border-r-2 border-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">{b.name}</h3>
                        {b.is_premium && <Crown className="w-4 h-4 text-yellow-500" />}
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        {typeof b.category_name === "string" ? b.category_name : b.category_name || "—"}
                      </p>
                      <div className="flex items-center gap-2">
                        {renderStars(b.average_rating)}
                        <span className="text-sm text-gray-500">
                          ({b.total_reviews} reviews)
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div className="lg:col-span-2">
            {selectedBusiness && (
              <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                  <TabsTrigger
                    value="upgrade"
                    className={`${
                      !selectedBusiness.is_premium
                        ? "bg-gradient-to-r from-yellow-400 to-orange-400 text-black font-bold hover:from-yellow-500 hover:to-orange-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500 data-[state=active]:to-orange-500 data-[state=active]:text-black shadow-lg"
                        : ""
                    }`}
                  >
                    {selectedBusiness.is_premium
                      ? "Premium Status"
                      : "✨ Upgrade to Premium"}
                  </TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="space-y-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            {selectedBusiness.name}
                          </h2>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">
                              {typeof selectedBusiness.category_name === "string"
                                ? selectedBusiness.category_name
                                : selectedBusiness.category_name || "—"}
                            </Badge>
                            {selectedBusiness.is_premium && (
                              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                                Premium
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {renderStars(selectedBusiness.average_rating)}
                            <span className="font-semibold">
                              {(Number(selectedBusiness.average_rating) || 0).toFixed(1)}
                            </span>
                            <span className="text-gray-500">
                              ({selectedBusiness.total_reviews} reviews)
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link to={createPageUrl(`Business?id=${selectedBusiness.id}`)}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-2" />
                              View Public
                            </Button>
                          </Link>
                          {!isEditing ? (
                            <Button variant="outline" size="sm" onClick={toggleEdit}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={handleEditCancel}>
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>

                      {!isEditing ? (
                        <>
                          <p className="text-gray-600 mb-4">{selectedBusiness.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            {(selectedBusiness.street_address ||
                              selectedBusiness.city ||
                              selectedBusiness.state ||
                              selectedBusiness.zip) && (
                              <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-gray-500 mt-1" />
                                <span>
                                  {[selectedBusiness.street_address, [selectedBusiness.city, selectedBusiness.state].filter(Boolean).join(", "), selectedBusiness.zip]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </div>
                            )}
                            {selectedBusiness.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-gray-500" />
                                <span>{selectedBusiness.phone}</span>
                              </div>
                            )}
                            {selectedBusiness.website && (
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-gray-500" />
                                <a
                                  href={selectedBusiness.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  Visit Website
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Profile sections */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {selectedBusiness.practice_areas && (
                              <div>
                                <h4 className="font-semibold mb-1">Practice Areas</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.practice_areas}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.work_experience && (
                              <div>
                                <h4 className="font-semibold mb-1">Work Experience</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.work_experience}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.honors && (
                              <div>
                                <h4 className="font-semibold mb-1">Honors</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.honors}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.education && (
                              <div>
                                <h4 className="font-semibold mb-1">Education</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.education}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.speaking_engagements && (
                              <div>
                                <h4 className="font-semibold mb-1">Speaking Engagements</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.speaking_engagements}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.publications && (
                              <div>
                                <h4 className="font-semibold mb-1">Publications</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.publications}
                                </p>
                              </div>
                            )}
                            {selectedBusiness.language && (
                              <div className="md:col-span-2">
                                <h4 className="font-semibold mb-1">Language(s)</h4>
                                <p className="text-gray-700 whitespace-pre-line">
                                  {selectedBusiness.language}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {editError && (
                            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
                              {editError}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Business Name *</label>
                              <Input
                                value={editForm.name}
                                onChange={(e) => onEditChange("name", e.target.value)}
                                required
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Phone</label>
                              <Input
                                value={editForm.phone}
                                onChange={(e) => onEditChange("phone", e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Website</label>
                              <Input
                                type="url"
                                value={editForm.website}
                                onChange={(e) => onEditChange("website", e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Image URL</label>
                              <Input
                                type="url"
                                value={editForm.image_url}
                                onChange={(e) => onEditChange("image_url", e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium">Street Address</label>
                              <Input
                                value={editForm.street_address}
                                onChange={(e) => onEditChange("street_address", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">City</label>
                              <Input
                                value={editForm.city}
                                onChange={(e) => onEditChange("city", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">State</label>
                              <Input
                                value={editForm.state}
                                onChange={(e) => onEditChange("state", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">ZIP</label>
                              <Input
                                value={editForm.zip}
                                onChange={(e) => onEditChange("zip", e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-2 mt-4">
                            <label className="text-sm font-medium">Description</label>
                            <Textarea
                              rows={4}
                              value={editForm.description}
                              onChange={(e) => onEditChange("description", e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Practice Areas</label>
                              <Textarea
                                rows={3}
                                value={editForm.practice_areas}
                                onChange={(e) => onEditChange("practice_areas", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Work Experience</label>
                              <Textarea
                                rows={3}
                                value={editForm.work_experience}
                                onChange={(e) => onEditChange("work_experience", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Honors</label>
                              <Textarea
                                rows={3}
                                value={editForm.honors}
                                onChange={(e) => onEditChange("honors", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Education</label>
                              <Textarea
                                rows={3}
                                value={editForm.education}
                                onChange={(e) => onEditChange("education", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Speaking Engagements</label>
                              <Textarea
                                rows={3}
                                value={editForm.speaking_engagements}
                                onChange={(e) => onEditChange("speaking_engagements", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Publications</label>
                              <Textarea
                                rows={3}
                                value={editForm.publications}
                                onChange={(e) => onEditChange("publications", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium">Language(s)</label>
                              <Input
                                value={editForm.language}
                                onChange={(e) => onEditChange("language", e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-6">
                            <Button variant="outline" onClick={handleEditCancel} disabled={editSaving}>
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                            <Button onClick={handleEditSave} disabled={editSaving}>
                              {editSaving ? (
                                <>
                                  <Save className="w-4 h-4 mr-2 animate-spin" />
                                  Saving…
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-2" />
                                  Save Changes
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Reviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {getReviewsForBusiness(selectedBusiness.id)
                        .slice(0, 3)
                        .map((review) => (
                          <div
                            key={review.id}
                            className="border-b border-gray-200 pb-4 mb-4 last:border-b-0 last:mb-0"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {renderStars(review.rating)}
                              <span className="text-sm text-gray-500">
                                by {review.created_by} •{" "}
                                {format(new Date(review.created_date), "MMM d, yyyy")}
                              </span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-1">
                              {review.title}
                            </h4>
                            <p className="text-gray-600 text-sm">{review.content}</p>
                          </div>
                        ))}
                      {getReviewsForBusiness(selectedBusiness.id).length === 0 && (
                        <p className="text-gray-500 text-center py-8">No reviews yet</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Reviews + Owner Replies */}
                <TabsContent value="reviews" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>All Reviews for {selectedBusiness.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {getReviewsForBusiness(selectedBusiness.id).map((review) => {
                          const canReply = canReplyForBusiness(selectedBusiness);
                          const editing = !!replyEditing[review.id];
                          const saving = !!replySaving[review.id];
                          const draft = replyDrafts[review.id] ?? review.owner_reply ?? "";

                          return (
                            <div
                              key={review.id}
                              className="border border-gray-200 rounded-lg p-4"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {renderStars(review.rating)}
                                  <span className="font-medium">{review.created_by}</span>
                                </div>
                                <span className="text-sm text-gray-500">
                                  {format(new Date(review.created_date), "MMM d, yyyy")}
                                </span>
                              </div>

                              <h4 className="font-medium text-gray-900 mb-2">
                                {review.title}
                              </h4>
                              <p className="text-gray-600">{review.content}</p>

                              {/* Owner reply section */}
                              <div className="mt-4 rounded-md bg-gray-50 p-3 border border-gray-200">
                                <div className="text-sm font-semibold text-gray-900 mb-2">
                                  Owner Reply
                                </div>

                                {/* Existing reply (read view) */}
                                {!editing && review.owner_reply && (
                                  <div className="space-y-2">
                                    <p className="text-gray-800 whitespace-pre-wrap">
                                      {review.owner_reply}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                      <span>
                                        Posted{" "}
                                        {review.owner_reply_at
                                          ? format(
                                              new Date(review.owner_reply_at),
                                              "MMM d, yyyy h:mm a"
                                            )
                                          : ""}
                                      </span>
                                      {canReply && (
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => startReply(review)}
                                          >
                                            <Edit className="w-4 h-4 mr-1" />
                                            Edit Reply
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={saving}
                                            onClick={() => handleReplyDelete(review)}
                                          >
                                            {saving ? "Removing…" : "Remove Reply"}
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* No reply yet */}
                                {!editing && !review.owner_reply && (
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm text-gray-600">
                                      {canReply
                                        ? "Reply to this review to engage with your customers."
                                        : "Replying is a Premium feature. Upgrade to enable replies."}
                                    </p>
                                    {canReply && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => startReply(review)}
                                      >
                                        Reply
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {/* Edit/create reply form */}
                                {editing && (
                                  <div className="space-y-2">
                                    <textarea
                                      className="w-full text-sm rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                      rows={4}
                                      value={draft}
                                      onChange={(e) =>
                                        setDraft(review.id, e.target.value)
                                      }
                                      placeholder="Write your public reply…"
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => cancelReply(review.id)}
                                        disabled={saving}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => handleReplySave(review)}
                                        disabled={saving || !draft.trim()}
                                      >
                                        {saving ? "Saving…" : "Save Reply"}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {getReviewsForBusiness(selectedBusiness.id).length === 0 && (
                          <p className="text-gray-500 text-center py-8">No reviews yet</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Upgrade / Premium status */}
                <TabsContent value="upgrade" className="space-y-6">
                  {selectedBusiness.is_premium ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Crown className="w-5 h-5 text-yellow-500" />
                          Premium Membership Active
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3 p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
                          <CheckCircle className="w-6 h-6" />
                          <p className="font-medium">
                            This business has an active premium membership, granting
                            enhanced visibility and features.
                          </p>
                        </div>
                        {selectedBusiness.premium_expires && (
                          <p className="mt-4 text-gray-600">
                            Your premium membership expires on:{" "}
                            <span className="font-semibold">
                              {format(
                                new Date(selectedBusiness.premium_expires),
                                "MMMM d, yyyy"
                              )}
                            </span>
                            .
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>Upgrade to Premium</CardTitle>
                        <p className="text-gray-500 pt-1">
                          Unlock powerful features to grow your business and stand
                          out from the competition.
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div
                            className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                              selectedPlan === "monthly"
                                ? "border-blue-600 bg-blue-50"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => setSelectedPlan("monthly")}
                          >
                            <h3 className="font-bold text-lg text-gray-900">Monthly</h3>
                            <p className="text-3xl font-bold my-2">
                              $50
                              <span className="text-base font-normal text-gray-500">
                                /month
                              </span>
                            </p>
                            <p className="text-sm text-gray-600">
                              Billed every month. Cancel anytime.
                            </p>
                          </div>
                          <div
                            className={`relative p-6 border-2 rounded-lg cursor-pointer transition-all ${
                              selectedPlan === "yearly"
                                ? "border-blue-600 bg-blue-50"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => setSelectedPlan("yearly")}
                          >
                            <Badge className="absolute -top-3 right-4 bg-green-600 text-white hover:bg-green-700">
                              Save $100
                            </Badge>
                            <h3 className="font-bold text-lg text-gray-900">Yearly</h3>
                            <p className="text-3xl font-bold my-2">
                              $500
                              <span className="text-base font-normal text-gray-500">
                                /year
                              </span>
                            </p>
                            <p className="text-sm text-gray-600">
                              Our best value. Billed once a year.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          size="lg"
                          onClick={handleUpgrade}
                        >
                          Upgrade to Premium
                        </Button>
                      </CardFooter>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
