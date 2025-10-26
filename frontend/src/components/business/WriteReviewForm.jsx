import React, { useState, useEffect } from "react";
import { createReview } from "@/api/reviews";
import { me as getMe } from "@/api/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, X, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** helpers for a robust localStorage flag with timestamp */
function readPendingFlag(key) {
  const raw = key ? localStorage.getItem(key) : null;
  if (!raw) return null;
  if (raw === "1") return { since: null }; // backward compatibility
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.since === "number") return { since: obj.since };
  } catch {}
  return { since: null };
}
function writePendingFlag(key) {
  if (!key) return;
  const payload = { since: Date.now() };
  localStorage.setItem(key, JSON.stringify(payload));
}
function clearPendingFlag(key) {
  if (!key) return;
  localStorage.removeItem(key);
}

export default function WriteReviewForm({
  businessId,
  doctorId,
  onReviewSubmitted,
  onCancel,
  user: userProp,
  clearPendingSignal = 0, // parent bumps this when it has cleared localStorage
}) {
  const [user, setUser] = useState(userProp || null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Banner state (blue + green messages are tied to this)
  const [showPendingBanner, setShowPendingBanner] = useState(false);

  // Keep local user in sync if parent provides it later
  useEffect(() => {
    if (userProp) setUser(userProp);
  }, [userProp]);

  // Fetch user if not provided by parent
  useEffect(() => {
    if (userProp) return;
    (async () => {
      try {
        const me = await getMe();
        setUser(me);
      } catch {
        setUser(null);
      }
    })();
  }, [userProp]);

  // localStorage key for this user+business
  const targetKeyPart = doctorId
    ? `doctor:${doctorId}`
    : `business:${businessId}`;
  const pendingKey =
    user?.id && (businessId || doctorId)
      ? `mr:pendingReview:${targetKeyPart}:${user.id}`
      : null;
  // When we know the user/key, restore persisted pending banner
  useEffect(() => {
    if (!pendingKey) return;
    const flag = readPendingFlag(pendingKey);
    setShowPendingBanner(!!flag);
  }, [pendingKey]);

  // Parent can nudge us to re-check (e.g., after it detected approval)
  useEffect(() => {
    if (!pendingKey) return;
    const flag = readPendingFlag(pendingKey);
    setShowPendingBanner(!!flag);
  }, [clearPendingSignal, pendingKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setError("Please sign in to write a review.");
      return;
    }
    if (user.status !== "active") {
      setError(
        "Your account is pending approval. You cannot write a review until your account has been activated by an administrator."
      );
      return;
    }
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    if (!title.trim() || !content.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        rating,
        title: title.trim(),
        content: content.trim(),
      };
      if (doctorId) {
        payload.doctor_id = doctorId;
      } else {
        payload.business_id = businessId;
      }
      await createReview(payload);
      // Persist + show the “pending” banners across refreshes
      writePendingFlag(pendingKey);
      setShowPendingBanner(true);

      onReviewSubmitted?.();

      // Optional: clear the form
      setRating(0);
      setTitle("");
      setContent("");
    } catch (err) {
      console.error("Error submitting review:", err);
      setError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const dismissPendingBanner = () => {
    clearPendingFlag(pendingKey);
    setShowPendingBanner(false);
  };

  return (
    <div className="space-y-4">
      {/* “Thanks, received” banner that persists until approval */}
      {showPendingBanner && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="flex items-start justify-between gap-4">
            <span>
              Thanks! Your review was received. It will be posted once an
              administrator approves it.
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-gray-500 hover:text-gray-700"
              onClick={dismissPendingBanner}
            >
              <X className="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Rating */}
        <div className="space-y-2">
          <Label>Your Rating *</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="p-1"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    star <= (hoverRating || rating)
                      ? "text-yellow-400 fill-current"
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-gray-600">
              {rating > 0 && (
                <>
                  {rating} star{rating !== 1 ? "s" : ""} –
                  {rating === 1 && " Terrible"}
                  {rating === 2 && " Poor"}
                  {rating === 3 && " Average"}
                  {rating === 4 && " Good"}
                  {rating === 5 && " Excellent"}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Review Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sum up your experience"
            maxLength={100}
          />
          <div className="text-xs text-gray-500 text-right">
            {title.length}/100
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="content">Your Review *</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tell others about your experience with this business..."
            rows={5}
            maxLength={1000}
          />
          <div className="text-xs text-gray-500 text-right">
            {content.length}/1000
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </form>
    </div>
  );
}
