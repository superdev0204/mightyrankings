import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Star, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ✅ API
import { me as getMe } from "@/api/users";
import { listReviews, updateReview, getReviewFlags } from "@/api/reviews"; // <-- add getReviewFlags in api
import { getBusinessesByIds } from "@/api/businesses";

export default function AdminManageReviewsPage() {
  const navigate = useNavigate();

  const [reviews, setReviews] = useState([]);
  const [bizMap, setBizMap] = useState({}); // { [id]: business }
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  // UX: allow admin to choose whether to email on approve/repost
  const [notifyOnApprove, setNotifyOnApprove] = useState(true);
  const [busyReviewIds, setBusyReviewIds] = useState(new Set());

  // Flags: store per-review flag arrays + expansion state
  const [flagsByReviewId, setFlagsByReviewId] = useState({}); // { [reviewId]: [{user_*, reason, created_at}, ...] }
  const [expandedFlags, setExpandedFlags] = useState({});       // { [reviewId]: boolean }

  const isAdmin = (u) =>
    u?.user_type === "admin" || u?.role === "admin" || Boolean(u?.is_staff);

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe().catch(() => null);
        if (!u || !isAdmin(u)) {
          navigate(createPageUrl("Home"));
          return;
        }
        await loadData();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractBusinessId = (r) => {
    if (typeof r.business_id === "number") return r.business_id;
    if (typeof r.business === "number") return r.business;
    if (r.business && typeof r.business === "object") return r.business.id;
    return null;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const all = await listReviews({ ordering: "-created_at", limit: 1000 });
      setReviews(all);

      const ids = [...new Set(all.map(extractBusinessId).filter(Boolean))];
      const businesses = await getBusinessesByIds(ids);
      const map = {};
      for (const b of businesses) map[b.id] = b;
      setBizMap(map);
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  const statusVariant = {
    pending: "secondary",
    active: "default",
    flagged: "destructive",
    removed: "outline",
  };

  const filteredReviews = useMemo(
    () => reviews.filter((r) => filter === "all" || String(r.status) === filter),
    [reviews, filter]
  );

  const renderStars = (rating) => (
    <div className="flex items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Number(rating) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
        />
      ))}
    </div>
  );

  const getBusinessName = (r) => {
    if (r.business && typeof r.business === "object") return r.business.name;
    const id = extractBusinessId(r);
    return bizMap[id]?.name || "N/A";
  };

  const setBusy = (id, on) =>
    setBusyReviewIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleUpdateReviewStatus = async (review, newStatus) => {
    try {
      setBusy(review.id, true);
      await updateReview(
        review.id,
        { status: newStatus },
        { notify: newStatus === "active" && notifyOnApprove }
      );
      await loadData();
      // If we reposted a flagged review, collapse its flag panel
      if (newStatus === "active") {
        setExpandedFlags((prev) => ({ ...prev, [review.id]: false }));
      }
    } catch (err) {
      console.error(`Failed to update review ${review.id}:`, err);
    } finally {
      setBusy(review.id, false);
    }
  };

  // ---- Flags fetching / display helpers

  const nameFromFlagUser = (f) => {
    const full = f?.user_full_name?.trim();
    const uname = f?.user_username?.trim();
    const email = f?.user_email?.trim();
    if (full) return full;
    if (uname) return uname;
    if (email) return email.split("@")[0];
    return "User";
  };

  const flagCountFor = (r) => {
    // support various backends: flag_count OR flags array
    if (typeof r?.flag_count === "number") return r.flag_count;
    if (Array.isArray(r?.flags)) return r.flags.length;
    const cached = flagsByReviewId[r.id];
    return Array.isArray(cached) ? cached.length : 0;
  };

  const toggleFlags = async (review) => {
    const rid = review.id;
    setExpandedFlags((prev) => ({ ...prev, [rid]: !prev[rid] }));

    // If we have no flags loaded yet, try to fetch them
    if (!flagsByReviewId[rid]) {
      try {
        // Prefer API endpoint if present
        let flags = [];
        try {
          flags = await getReviewFlags(rid); // should return array
        } catch {
          // fallback to embedded data if your serializer already includes it
          if (Array.isArray(review.flags)) flags = review.flags;
        }
        if (!Array.isArray(flags)) flags = [];
        setFlagsByReviewId((prev) => ({ ...prev, [rid]: flags }));
      } catch (e) {
        console.error("Failed to fetch flags:", e);
        setFlagsByReviewId((prev) => ({ ...prev, [rid]: [] }));
      }
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Manage Reviews</h1>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Email on approve</span>
          <Switch checked={notifyOnApprove} onCheckedChange={setNotifyOnApprove} />
        </div>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="flagged">Flagged</TabsTrigger>
          <TabsTrigger value="removed">Removed</TabsTrigger>
          <TabsTrigger value="all">All Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} />
      </Tabs>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Review</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredReviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">No reviews found for this filter.</TableCell>
              </TableRow>
            ) : (
              filteredReviews.map((r) => {
                const isFlagged = String(r.status) === "flagged";
                const count = flagCountFor(r);
                const expanded = !!expandedFlags[r.id];
                const flags = flagsByReviewId[r.id] || [];

                return (
                  <React.Fragment key={r.id}>
                    <TableRow>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{r.content}</p>
                      </TableCell>
                      <TableCell>{getBusinessName(r)}</TableCell>
                      <TableCell>{renderStars(r.rating)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status] || "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {isFlagged ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">{count}</Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleFlags(r)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              {expanded ? "Hide flags" : "View flags"}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            disabled={busyReviewIds.has(r.id)}
                            onClick={() => handleUpdateReviewStatus(r, "active")}
                          >
                            <Check className="w-4 h-4 mr-2" /> {busyReviewIds.has(r.id) ? "Saving..." : "Approve"}
                          </Button>
                        )}
                        {r.status === "flagged" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={busyReviewIds.has(r.id)}
                              onClick={() => handleUpdateReviewStatus(r, "active")}
                            >
                              <Check className="w-4 h-4 mr-2" /> {busyReviewIds.has(r.id) ? "Reposting..." : "Repost"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busyReviewIds.has(r.id)}
                              onClick={() => handleUpdateReviewStatus(r, "removed")}
                            >
                              <X className="w-4 h-4 mr-2" /> {busyReviewIds.has(r.id) ? "Removing..." : "Delete"}
                            </Button>
                          </>
                        )}
                        {r.status !== "removed" && r.status !== "flagged" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyReviewIds.has(r.id)}
                            onClick={() => handleUpdateReviewStatus(r, "removed")}
                          >
                            <X className="w-4 h-4 mr-2" /> {busyReviewIds.has(r.id) ? "Removing..." : "Remove"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Inline expandable flags panel */}
                    {isFlagged && expanded && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="rounded-md border bg-muted/30 p-3">
                            {flags.length === 0 ? (
                              <div className="text-sm text-muted-foreground">
                                No flag details available.
                                {typeof r.flag_count === "number" && r.flag_count > 0
                                  ? " (Count is available, but detailed records are not exposed by the API.)"
                                  : ""}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {flags.map((f, idx) => {
                                  const dname = nameFromFlagUser(f);
                                  const when = f?.created_at
                                    ? new Date(f.created_at).toLocaleString()
                                    : "";
                                  const reason = (f?.reason || "").trim();
                                  return (
                                    <div key={idx} className="flex items-start justify-between gap-4 border-b last:border-b-0 py-2">
                                      <div>
                                        <div className="font-medium">{dname}</div>
                                        {reason && <div className="text-sm text-muted-foreground">{reason}</div>}
                                      </div>
                                      <div className="text-xs text-muted-foreground whitespace-nowrap">{when}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
