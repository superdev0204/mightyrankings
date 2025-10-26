import React, { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building, Star, MapPin, Crown, AlertCircle, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

import { getCategory, getCategoryBySlug, getCategoryByPath } from "@/api/categories";
import { countBusinesses, searchDirectory } from "@/api/businesses";
import { countDoctors } from "@/api/doctors";

const PAGE_SIZE = 60;

const encodeSegments = (s) =>
  String(s || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

export default function CategoryPage() {
  const location = useLocation();

  const [category, setCategory] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [items, setItems] = useState([]); // mixed: lawyers + doctors
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // We’ll keep these until unified_search supports pagination.
  const [loadingMore] = useState(false);
  const [hasMore] = useState(false);

  const getPathFromLocation = () => {
    const segs = location.pathname.split("/").filter(Boolean);
    if (!segs.length) return null;
    if (segs[0].toLowerCase() === "category") return segs.slice(1).join("/");
    return segs.join("/");
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      setItems([]);

      try {
        const urlParams = new URLSearchParams(location.search);
        const qId = urlParams.get("id");
        const path = getPathFromLocation();

        let cat = null;
        if (qId) {
          cat = await getCategory(qId);
        } else if (path) {
          cat = await getCategoryByPath(path);
          if (!cat && !path.includes("/")) cat = await getCategoryBySlug(path);
        } else {
          setError("Category not specified");
          setLoading(false);
          return;
        }

        if (!cat) {
          setError("Category not found");
          setLoading(false);
          return;
        }

        setCategory(cat);

        // Combined total for header
        const [bizTotal, docTotal] = await Promise.all([
          countBusinesses({ status: "active", category_id: cat.id }),
          countDoctors({ status: "active", category_id: cat.id }),
        ]);
        const totalNum = Number(bizTotal || 0) + Number(docTotal || 0);
        setTotalCount(totalNum);

        // Mixed results from unified endpoint
        // NOTE: backend must accept ?category_id=<id> and filter both models.
        const unified = await searchDirectory("", {
          status: "active",
          category_id: cat.id,
          limit: PAGE_SIZE,
        });

        // Normalize for a single grid; keep _type to build detail links
        const normalized = (unified || []).map((row) => {
          const t = row?.type; // "lawyer" | "doctor"
          const d = row?.data || {};
          if (t === "doctor") {
            return {
              _type: "doctor",
              id: d.id,
              name: d.provider_name || d.name || "Doctor",
              slug: d.slug,
              category_full_slug: d.category_full_slug,
              is_premium: !!d.is_premium,
              average_rating: Number(d.average_rating || 0),
              total_reviews: Number(d.total_reviews || 0),
              image_url: d.image_url,
              description: d.description || d.specialty || "",
              city: d.city,
              state: d.state,
            };
          }
          // default: lawyer/business
          return {
            _type: "lawyer",
            id: d.id,
            name: d.name,
            slug: d.slug,
            category_full_slug: d.category_full_slug,
            is_premium: !!d.is_premium,
            average_rating: Number(d.average_rating || 0),
            total_reviews: Number(d.total_reviews || 0),
            image_url: d.image_url,
            description: d.description || "",
            city: d.city,
            state: d.state,
          };
        });

        setItems(normalized);
      } catch (err) {
        console.error(err);
        setError("Failed to load category data");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const renderStars = (rating) => (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.round(Number(rating) || 0) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (<Skeleton key={i} className="h-64 w-full" />))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">{category?.name}</h1>
          <p className="text-gray-600 text-lg">
            {totalCount} business{totalCount !== 1 ? "es" : ""} in this category
          </p>
          {category?.description && <p className="text-gray-600 mt-2">{category.description}</p>}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12">
            <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No listings found</h3>
            <p className="text-gray-500">There are currently no active lawyers or doctors in this category.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((it) => {
                const rating = Number(it.average_rating ?? 0);
                const total = Number(it.total_reviews ?? 0);

                const url =
                  it._type === "doctor"
                    ? (it.category_full_slug && it.slug
                        ? `/business/${encodeSegments(it.category_full_slug)}/${encodeURIComponent(it.slug)}`
                        : `/business/${encodeURIComponent(it.slug)}`)
                    : (it.category_full_slug && it.slug
                        ? `/business/${encodeSegments(it.category_full_slug)}/${encodeURIComponent(it.slug)}`
                        : `/business/${encodeURIComponent(it.slug)}`);

                return (
                  <Link key={`${it._type}:${it.id}`} to={url} className="group">
                    <Card
                      className={`hover:shadow-lg transition-all duration-300 group-hover:scale-105 relative overflow-hidden ${
                        it.is_premium ? "border-2 border-yellow-400 premium-glow" : ""
                      }`}
                    >
                      {it.is_premium && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                            <Crown className="w-3 h-3 mr-1" />
                            Premium
                          </Badge>
                        </div>
                      )}

                      <div className="aspect-video bg-gray-100 relative">
                        {it.image_url ? (
                          <img src={it.image_url} alt={`Image of ${it.name}`} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {it._type === "doctor" ? (
                              <Stethoscope className="w-12 h-12 text-gray-300" />
                            ) : (
                              <Building className="w-12 h-12 text-gray-300" />
                            )}
                          </div>
                        )}
                      </div>

                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors" title={it.name}>
                            {it.name}
                          </h3>
                          <div className="flex items-center gap-1">
                            {renderStars(rating)}
                            <span className="text-sm text-gray-500 ml-1">({total})</span>
                          </div>
                        </div>

                        {it.description && <p className="text-sm text-gray-600 mb-2 line-clamp-2">{it.description}</p>}

                        {(it.city || it.state) && (
                          <div className="flex items-center text-sm text-gray-500">
                            <MapPin className="w-4 h-4 mr-1" />
                            {[it.city, it.state].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
