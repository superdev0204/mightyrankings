import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star, TrendingUp, Users, Calendar, ShieldCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function BusinessStats({ business, reviews }) {
  // Consider both the object and *_id fields (serializer may only send ids)
  const isClaimed = Boolean(business?.claimed_by || business?.claimed_by_id);
  const isClaimPending = Boolean(business?.pending_claim_by || business?.pending_claim_by_id);

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    (reviews || []).forEach((review) => {
      const r = Number(review.rating);
      if (r >= 1 && r <= 5) distribution[r] = (distribution[r] || 0) + 1;
    });
    return distribution;
  };

  const ratingDistribution = getRatingDistribution();
  const totalReviews =
    Number.isFinite(Number(business?.total_reviews))
      ? Number(business.total_reviews)
      : (reviews || []).length;

  const avg = Number(business?.average_rating || 0);

  // created_at is your model field; some serializers expose created_date
  const createdRaw = business?.created_at || business?.created_date;
  const memberSince = createdRaw ? new Date(createdRaw).getFullYear() : "—";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Rating Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            Rating Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = ratingDistribution[rating] || 0;
            const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;

            return (
              <div key={rating} className="flex items-center gap-3">
                <div className="flex items-center gap-1 w-12">
                  <span className="text-sm">{rating}</span>
                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                </div>
                <Progress value={percentage} className="flex-1 h-2" />
                <span className="text-sm text-gray-500 w-8">{count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Quick Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm">Total Reviews</span>
            </div>
            <span className="font-semibold">{totalReviews}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-sm">Average Rating</span>
            </div>
            <span className="font-semibold">{Number.isFinite(avg) ? avg.toFixed(1) : "0.0"}/5</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm">Member Since</span>
            </div>
            <span className="font-semibold">{memberSince}</span>
          </div>

          {/* Claimed status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isClaimed ? "text-emerald-600" : "text-gray-400"}`} />
              <span className="text-sm">Claimed Status</span>
            </div>
            {isClaimed ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-700">Claimed</Badge>
            ) : isClaimPending ? (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Pending
              </Badge>
            ) : (
              <Badge variant="outline">Unclaimed</Badge>
            )}
          </div>

          {business.is_premium && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full" />
                <span className="text-sm">Premium Member</span>
              </div>
              <span className="text-xs bg-gradient-to-r from-yellow-400 to-orange-400 text-black px-2 py-1 rounded-full font-medium">
                Yes
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
