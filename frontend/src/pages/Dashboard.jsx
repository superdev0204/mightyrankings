import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User as UserIcon,
  Star,
  MessageSquare,
  Edit,
  Eye,
  Calendar,
  TrendingUp,
  Award,
  ArrowLeft,
  CheckCircle,
  Building,
  Crown,
} from "lucide-react";
import { format } from "date-fns";
import EditReviewDialog from "../components/dashboard/EditReviewDialog";

// ✅ APIs
import { me as getCurrentUser, loginWithRedirect } from "@/api/users";
import { listReviews, updateReview } from "@/api/reviews";
import { getBusinessesByIds, listBusinesses } from "@/api/businesses";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // Reviews-related
  const [reviews, setReviews] = useState([]);
  const [businesses, setBusinesses] = useState({});

  // Owned businesses
  const [owned, setOwned] = useState([]);
  const [ownedLoading, setOwnedLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [editingReview, setEditingReview] = useState(null);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveBusinessId = (r) => {
    if (r.business_id != null) return Number(r.business_id);
    if (r.business && typeof r.business === "object" && r.business.id != null)
      return Number(r.business.id);
    return null;
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const me = await getCurrentUser();
      setUser(me);

      // ✅ Only my reviews (filter by user id, which backend supports)
      const myReviews = await listReviews({
        user: me.id,
        ordering: "-created_date",
        limit: 200,
      });
      setReviews(myReviews);

      // Fetch businesses referenced by those reviews
      const ids = [...new Set(myReviews.map(resolveBusinessId).filter(Boolean))];
      if (ids.length) {
        const items = await getBusinessesByIds(ids);
        const dict = {};
        items.forEach((b) => {
          dict[b.id] = b;
        });
        setBusinesses(dict);
      } else {
        setBusinesses({});
      }

      // ✅ Also load businesses owned by me
      setOwnedLoading(true);
      const mine = await listBusinesses({ claimed_by: me.id, limit: 1000 });
      setOwned(Array.isArray(mine) ? mine : []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setUser(null); // triggers login prompt
    } finally {
      setLoading(false);
      setOwnedLoading(false);
    }
  };

  const handleEditReview = async (reviewId, updatedData) => {
    try {
      const updated = await updateReview(reviewId, updatedData);
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, ...updated } : r))
      );
      setSuccess("Review updated successfully!");
      setEditingReview(null);
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("Error updating review:", error);
      setSuccess("Failed to update the review.");
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  const renderStars = (rating) => (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < Number(rating || 0)
              ? "text-yellow-400 fill-current"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );

  const stats = useMemo(() => {
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
          totalReviews
        : 0;

    const now = new Date();
    const thisMonth = reviews.filter((r) => {
      const d = new Date(r.created_date);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    }).length;

    const helpfulCount = reviews.reduce(
      (sum, r) => sum + Number(r.helpful_count || 0),
      0
    );
    return { totalReviews, averageRating, thisMonth, helpfulCount };
  }, [reviews]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-8" />
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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <UserIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Dashboard Access
            </h2>
            <p className="text-gray-600 mb-6">
              Sign in to view your personal dashboard and review history.
            </p>
            <Button
              onClick={() => loginWithRedirect(window.location.href)}
              className="w-full"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPremium = !!user.premium_membership;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
            {isPremium && (
              <Badge className="bg-yellow-500 text-black flex items-center gap-1">
                <Crown className="w-3 h-3" /> Premium
              </Badge>
            )}
          </div>
          <p className="text-gray-600 mt-2">
            Track your reviews and manage your businesses.
          </p>
        </div>

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-blue-600" />
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
                  <Star className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Average Rating</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.averageRating.toFixed(1)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.thisMonth}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Award className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Helpful Votes</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.helpfulCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="owned" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="owned">My Businesses</TabsTrigger>
            <TabsTrigger value="reviews">My Reviews</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Owned businesses */}
          <TabsContent value="owned">
            <Card>
              <CardHeader>
                <CardTitle>Businesses You Own ({owned.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {ownedLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : owned.length === 0 ? (
                  <div className="text-center py-10">
                    <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">
                      You haven’t claimed any businesses yet.
                    </p>
                    <Link
                      to={createPageUrl("Search")}
                      className="inline-block mt-3"
                    >
                      <Button>Find a Business to Claim</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {owned.map((b) => (
                      <div
                        key={b.id}
                        className="border rounded-lg p-4 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">{b.name}</div>
                          <div className="flex items-center gap-2">
                            {b.is_premium && (
                              <Badge className="bg-yellow-500 text-black">
                                <Crown className="w-3 h-3 mr-1" /> Premium
                              </Badge>
                            )}
                            <Badge
                              variant={
                                b.status === "active" ? "default" : "secondary"
                              }
                            >
                              {b.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          {b.category_name || b.category}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link to={createPageUrl(`Business?id=${b.id}`)}>
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4 mr-1" /> View
                            </Button>
                          </Link>
                          <Link to={createPageUrl("Premium")}>
                            <Button size="sm" variant="secondary">
                              {b.is_premium ? "Manage Billing" : "Go Premium"}
                            </Button>
                          </Link>
                        </div>
                        {isPremium && (
                          <div className="text-xs text-gray-500 mt-1">
                            Premium perk: You can reply to reviews from your
                            business page.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reviews */}
          <TabsContent value="reviews" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Reviews ({reviews.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {reviews.length > 0 ? (
                  <div className="space-y-4">
                    {reviews.map((review) => {
                      const business = businesses[resolveBusinessId(review)];
                      const canEdit = review.user_id === user.id; // ✅ only mine
                      return (
                        <div
                          key={review.id}
                          className="border border-gray-200 rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {renderStars(review.rating)}
                                <Badge
                                  variant={
                                    review.status === "active"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {review.status}
                                </Badge>
                              </div>
                              <h3 className="font-semibold text-gray-900 mb-1">
                                {review.title}
                              </h3>
                              {business ? (
                                <Link
                                  to={createPageUrl(
                                    `Business?id=${business.id}`
                                  )}
                                  className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
                                >
                                  {business.name} •{" "}
                                  {typeof business.category === "object"
                                    ? business.category?.name
                                    : business.category}
                                </Link>
                              ) : (
                                <p className="text-sm text-gray-500 mb-2">
                                  Business not found.
                                </p>
                              )}
                              <p className="text-gray-600 text-sm mb-2">
                                {review.content}
                              </p>

                              {/* ✅ Owner reply (if any) */}
                              {review.owner_reply && (
                                <div className="mt-3 rounded-md border bg-gray-50 p-3">
                                  <div className="text-xs text-gray-500 mb-1">
                                    Reply from owner
                                    {review.owner_replied_at ? (
                                      <>
                                        {" "}
                                        •{" "}
                                        {format(
                                          new Date(review.owner_replied_at),
                                          "MMM d, yyyy"
                                        )}
                                      </>
                                    ) : null}
                                  </div>
                                  <p className="text-gray-700 text-sm whitespace-pre-line">
                                    {review.owner_reply}
                                  </p>
                                </div>
                              )}

                              <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(
                                    new Date(review.created_date),
                                    "MMM d, yyyy"
                                  )}
                                </span>
                                {Number(review.helpful_count || 0) > 0 && (
                                  <span>
                                    {review.helpful_count} helpful votes
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                              {canEdit && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingReview(review)}
                                >
                                  <Edit className="w-4 h-4 mr-1" /> Edit
                                </Button>
                              )}
                              {business && (
                                <Link
                                  to={createPageUrl(
                                    `Business?id=${business.id}`
                                  )}
                                >
                                  <Button variant="ghost" size="sm">
                                    <Eye className="w-4 h-4 mr-1" /> View
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Reviews Yet
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Start sharing your experiences by writing your first
                      review.
                    </p>
                    <Link to={createPageUrl("Search")}>
                      <Button>Find Businesses to Review</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {reviews.length > 0 ? (
                  <div className="space-y-4">
                    {reviews.slice(0, 10).map((review) => {
                      const business = businesses[resolveBusinessId(review)];
                      return (
                        <div
                          key={review.id}
                          className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                            <Star className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">
                              You reviewed{" "}
                              <span className="font-semibold">
                                {business?.name || "a business"}
                              </span>
                              .
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {format(
                                new Date(review.created_date),
                                "MMM d, yyyy h:mm a"
                              )}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              {renderStars(review.rating)}
                              <span className="text-sm text-gray-600">
                                “{review.title}”
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Activity Yet
                    </h3>
                    <p className="text-gray-600">
                      Your activity timeline will appear here as you write
                      reviews.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Review Dialog */}
        {editingReview && (
          <EditReviewDialog
            review={editingReview}
            business={businesses[resolveBusinessId(editingReview)]}
            onSave={handleEditReview}
            onCancel={() => setEditingReview(null)}
          />
        )}
      </div>
    </div>
  );
}
