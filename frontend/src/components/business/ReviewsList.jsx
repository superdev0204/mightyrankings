import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ThumbsUp, Flag, MessageSquare, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { markHelpful, flagReview as apiFlagReview } from "@/api/reviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// If you have shadcn/ui Dialog installed:
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ReviewsList({ reviews }) {
  // Local copy so we can optimistically update counts/state
  const [items, setItems] = useState(reviews || []);
  useEffect(() => setItems(reviews || []), [reviews]);

  const [busyHelpful, setBusyHelpful] = useState({}); // { [id]: true }
  const [busyFlag, setBusyFlag] = useState({});       // { [id]: true }

  // Flag dialog state
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagTarget, setFlagTarget] = useState(null);  // review object
  const [selectedReason, setSelectedReason] = useState("");
  const [details, setDetails] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState("");

  // After a successful report, show a per-review “Thanks” banner & disable its flag button
  const [justFlaggedIds, setJustFlaggedIds] = useState(new Set());

  const quickReasons = [
    "Spam or advertising",
    "Harassment or hate",
    "Inappropriate language",
    "Conflicts with guidelines",
    "Fake or misleading",
    "Other",
  ];

  const renderStars = (rating) => (
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

  const getDisplayName = (review) =>
    review?.created_by_display ||
    review?.created_by_full_name ||
    review?.created_by_username ||
    (() => {
      const raw = review?.created_by || "";
      const local = typeof raw === "string" ? raw.split("@")[0] : "";
      return local || "User";
    })();

  // Helpful
  const onHelpful = async (id) => {
    if (!id || busyHelpful[id]) return;
    setBusyHelpful((m) => ({ ...m, [id]: true }));

    // optimistic bump
    setItems((arr) =>
      arr.map((r) =>
        r.id === id ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r
      )
    );

    try {
      const updated = await markHelpful(id);
      if (updated?.id) {
        setItems((arr) => arr.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      }
    } catch (e) {
      // revert on failure
      setItems((arr) =>
        arr.map((r) =>
          r.id === id
            ? { ...r, helpful_count: Math.max((r.helpful_count || 1) - 1, 0) }
            : r
        )
      );
      console.error("Failed to mark helpful:", e);
    } finally {
      setBusyHelpful((m) => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
    }
  };

  // Flag – open modal
  const openFlagDialog = (review) => {
    setFlagTarget(review || null);
    setSelectedReason("");
    setDetails("");
    setFlagError("");
    setFlagOpen(true);
  };

  // Compose the note we’ll send to the API
  const buildNote = () => {
    const base = (selectedReason || "").trim();
    const extra = (details || "").trim();
    if (base && extra) return `${base}: ${extra}`;
    return base || extra || "";
  };

  // Flag – submit
  const submitFlag = async () => {
    if (!flagTarget || flagSubmitting) return;
    const id = flagTarget.id;
    setFlagSubmitting(true);
    setBusyFlag((m) => ({ ...m, [id]: true }));
    setFlagError("");

    try {
      const note = buildNote();
      const updated = await apiFlagReview(id, note ? { note } : {});
      // Keep the review visible; just merge any updated fields and show “Thanks”
      if (updated?.id) {
        setItems((arr) => arr.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      }
      setJustFlaggedIds((prev) => new Set(prev).add(id));
      setFlagOpen(false);
    } catch (e) {
      console.error("Failed to flag review:", e);
      const status = e?.response?.status;
      if (status === 401 || status === 403) {
        setFlagError("Please sign in to report reviews.");
      } else {
        setFlagError(
          e?.response?.data?.detail ||
            e?.message ||
            "Sorry—something went wrong. Please try again."
        );
      }
    } finally {
      setFlagSubmitting(false);
      setBusyFlag((m) => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
    }
  };

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Reviews Yet
          </h3>
          <p className="text-gray-500">
            Be the first to share your experience with this business!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {items.map((review) => {
          const name = getDisplayName(review);
          const initial = (name?.[0] || "U").toUpperCase();
          const createdDate = review?.created_date ? new Date(review.created_date) : null;
          const isFlagging = !!busyFlag[review.id];
          const showThanks = justFlaggedIds.has(review.id);

          return (
            <Card key={review.id}>
              <CardContent className="p-6">
                {/* Success banner after flag */}
                {showThanks && (
                  <Alert className="mb-4 border-green-200 bg-green-50">
                    <AlertDescription className="flex items-center gap-2 text-green-800">
                      <CheckCircle2 className="w-4 h-4" />
                      Thanks—your report was sent to our moderators.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">{initial}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{name}</span>
                        {review?.verified && (
                          <Badge variant="secondary" className="text-xs">
                            Verified
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {renderStars(review?.rating)}
                        <span className="text-sm text-gray-500">
                          {createdDate ? format(createdDate, "MMM d, yyyy") : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <h4 className="font-semibold text-gray-900 mb-2">{review?.title}</h4>
                <p className="text-gray-700 mb-4 leading-relaxed">{review?.content}</p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onHelpful(review.id)}
                      disabled={!!busyHelpful[review.id]}
                      className="text-gray-500 hover:text-green-600"
                    >
                      <ThumbsUp className="w-4 h-4 mr-1" />
                      Helpful ({review?.helpful_count ?? 0})
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openFlagDialog(review)}
                    disabled={isFlagging || showThanks}
                    className={`${showThanks ? "text-gray-400" : "text-gray-400 hover:text-red-600"}`}
                  >
                    <Flag className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Flag dialog */}
      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this review</DialogTitle>
            <DialogDescription>
              Tell us what’s wrong. Our moderators will review it shortly.
            </DialogDescription>
          </DialogHeader>

          {flagError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{flagError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <Label className="text-sm">Quick reason</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickReasons.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={selectedReason === r ? "default" : "outline"}
                    onClick={() => setSelectedReason(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flag-note" className="text-sm">
                Add details (optional)
              </Label>
              <Textarea
                id="flag-note"
                placeholder="Share anything that helps us understand the issue…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {(flagError === "Please sign in to report reviews.") && (
              <Button
                variant="secondary"
                onClick={() => {
                  const next = encodeURIComponent(window.location.href);
                  window.location.href = `/login?next=${next}`;
                }}
              >
                Sign in
              </Button>
            )}
            <Button variant="outline" onClick={() => setFlagOpen(false)} disabled={flagSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitFlag} disabled={flagSubmitting}>
              {flagSubmitting ? "Sending…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
