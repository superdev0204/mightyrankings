import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCompare } from "../components/common/CompareProvider";
import { createPageUrl } from "@/utils";
import { generateBusinessUrl } from "../components/utils/slugify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Scale, CheckCircle, XCircle } from "lucide-react";

// ✅ Axios API
import { getBusinessesByIds } from "@/api/businesses";

export default function ComparePage() {
  const { compareList, clearCompare } = useCompare();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (compareList.length > 0) {
      loadBusinesses();
    } else {
      setBusinesses([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareList]);

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const items = await getBusinessesByIds(compareList);
      // keep original order of compareList
      const idx = new Map(compareList.map((id, i) => [Number(id), i]));
      items.sort((a, b) => (idx.get(Number(a.id)) ?? 0) - (idx.get(Number(b.id)) ?? 0));
      setBusinesses(items);
    } catch (error) {
      console.error("Error loading businesses for comparison:", error);
      setBusinesses([]);
    }
    setLoading(false);
  };

  const renderStars = (rating) => {
    const r = Math.round(Number(rating) || 0);
    return (
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className={`w-4 h-4 ${i < r ? "text-yellow-400 fill-current" : "text-gray-300"}`} />
        ))}
      </div>
    );
  };

  const getBestValue = (attribute) => {
    if (businesses.length < 2) return null;
    let best = Number(businesses[0][attribute] ?? 0);
    for (let i = 1; i < businesses.length; i++) {
      const val = Number(businesses[i][attribute] ?? 0);
      if (val > best) best = val;
    }
    return best;
  };

  const bestRating = getBestValue('average_rating');
  const bestReviews = getBestValue('total_reviews');

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Skeleton className="h-8 w-1/4 mb-4" />
        <Skeleton className="h-4 w-1/3 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Scale className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Comparison Tool is Empty</h2>
        <p className="text-gray-600 mb-6">Add businesses from search results to compare them side-by-side.</p>
        <Link to={createPageUrl("Search")}>
          <Button>Start Searching</Button>
        </Link>
      </div>
    );
  }

  // category display can be string | object | id
  const displayCategory = (c) => {
    if (!c) return "—";
    if (typeof c === "string") return c;
    if (typeof c === "object") return c.name ?? "—";
    return String(c); // id fallback
  };

  return (
    <div className="bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compare Businesses</h1>
            <p className="text-gray-600">See how your selected businesses stack up.</p>
          </div>
          <Button variant="outline" onClick={clearCompare}>
            Clear Comparison
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-full bg-white rounded-lg border shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px] font-semibold text-lg">Feature</TableHead>
                {businesses.map((b) => (
                  <TableHead key={b.id} className="text-center">
                    <Link to={createPageUrl(generateBusinessUrl(b))} className="block">
                      {b.image_url ? (
                        <img src={b.image_url} alt={b.name} className="w-full h-32 object-cover rounded-md mb-2" />
                      ) : (
                        <div className="w-full h-32 bg-gray-100 flex items-center justify-center rounded-md mb-2">
                          <Star className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                      <span className="font-bold text-lg text-red-600 hover:underline">{b.name}</span>
                    </Link>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {/* Rating Row */}
              <TableRow>
                <TableCell className="font-semibold">Average Rating</TableCell>
                {businesses.map((b) => {
                  const r = Number(b.average_rating ?? 0);
                  const isBest = bestRating != null && r === bestRating;
                  return (
                    <TableCell key={b.id} className={`text-center ${isBest ? 'bg-green-50' : ''}`}>
                      <div className="flex items-center justify-center gap-2">
                        {renderStars(r)}
                        <span className="font-bold">{r.toFixed(1)}</span>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>

              {/* Total Reviews Row */}
              <TableRow>
                <TableCell className="font-semibold">Total Reviews</TableCell>
                {businesses.map((b) => {
                  const t = Number(b.total_reviews ?? 0);
                  const isBest = bestReviews != null && t === bestReviews;
                  return (
                    <TableCell key={b.id} className={`text-center text-lg font-bold ${isBest ? 'bg-green-50' : ''}`}>
                      {t}
                    </TableCell>
                  );
                })}
              </TableRow>

              {/* Category Row */}
              <TableRow>
                <TableCell className="font-semibold">Category</TableCell>
                {businesses.map((b) => (
                  <TableCell key={b.id} className="text-center">
                    {displayCategory(b.category)}
                  </TableCell>
                ))}
              </TableRow>

              {/* Premium Row */}
              <TableRow>
                <TableCell className="font-semibold">Premium Listing</TableCell>
                {businesses.map((b) => (
                  <TableCell key={b.id} className="text-center">
                    {b.is_premium
                      ? <CheckCircle className="w-6 h-6 text-green-500 mx-auto" />
                      : <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                    }
                  </TableCell>
                ))}
              </TableRow>

              {/* Description Row */}
              <TableRow>
                <TableCell className="font-semibold align-top">Description</TableCell>
                {businesses.map((b) => (
                  <TableCell key={b.id} className="text-sm text-gray-600 align-top">
                    {b.description}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
