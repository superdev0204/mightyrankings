import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getFeaturedBusinesses, countBusinesses } from "@/api/businesses";
import { getFeaturedDoctors, countDoctors } from "@/api/doctors";
import { getTopCategories, countCategories } from "@/api/categories";
import { getRecentReviews, countReviews } from "@/api/reviews";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Star, Crown, MapPin, ArrowRight, Building } from "lucide-react";
import { getIconByName } from "@/components/utils/icons";

/* ---------------- small helpers ---------------- */
function parseHex(hex) {
  const m = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function darkenHex(hex, amt = 0.25) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const f = 1 - amt;
  const r = clamp(Math.round(rgb.r * f), 0, 255);
  const g = clamp(Math.round(rgb.g * f), 0, 255);
  const b = clamp(Math.round(rgb.b * f), 0, 255);
  const toHex = (x) => x.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function getCategoryBackground(category) {
  const c = category?.color;
  if (c) {
    const start = /^#/.test(c) ? c : `#${c}`;
    const end = darkenHex(start, 0.25) || start;
    return { style: { background: `linear-gradient(90deg, ${start}, ${end})` } };
  }
  const name = (category?.name || "").toLowerCase();
  let cls = "from-blue-500 to-purple-500";
  if (name.includes("restaurant") || name.includes("food") || name.includes("dining")) cls = "from-orange-500 to-red-500";
  else if (name.includes("automotive") || name.includes("auto") || name.includes("car")) cls = "from-gray-600 to-gray-800";
  else if (name.includes("beauty") || name.includes("salon") || name.includes("hair") || name.includes("spa")) cls = "from-pink-500 to-purple-500";
  else if (name.includes("repair") || name.includes("maintenance") || name.includes("service")) cls = "from-yellow-600 to-orange-600";
  else if (name.includes("shopping") || name.includes("retail") || name.includes("store")) cls = "from-green-500 to-emerald-500";
  else if (name.includes("health") || name.includes("medical") || name.includes("doctor") || name.includes("clinic")) cls = "from-blue-600 to-cyan-600";
  else if (name.includes("education") || name.includes("school") || name.includes("learning")) cls = "from-indigo-500 to-blue-500";
  else if (name.includes("home") || name.includes("house") || name.includes("property")) cls = "from-amber-500 to-yellow-500";
  else if (name.includes("business") || name.includes("professional") || name.includes("office")) cls = "from-slate-600 to-gray-600";
  else if (name.includes("fitness") || name.includes("gym") || name.includes("exercise")) cls = "from-red-500 to-pink-500";
  else if (name.includes("coffee") || name.includes("cafe") || name.includes("bakery")) cls = "from-amber-700 to-orange-700";
  else if (name.includes("photo") || name.includes("camera") || name.includes("studio")) cls = "from-purple-600 to-indigo-600";
  else if (name.includes("clothing") || name.includes("fashion") || name.includes("apparel")) cls = "from-teal-500 to-cyan-500";
  else if (name.includes("entertainment") || name.includes("gaming") || name.includes("fun")) cls = "from-violet-500 to-purple-600";
  else if (name.includes("travel") || name.includes("hotel") || name.includes("tourism")) cls = "from-sky-500 to-blue-600";
  else if (name.includes("wedding") || name.includes("event") || name.includes("party")) cls = "from-rose-500 to-pink-600";
  return { className: cls };
}
function renderCategoryIcon(category) {
  const Icon = getIconByName(category?.icon);
  return <Icon className="w-6 h-6 text-white" />;
}
function encodeSegments(s) {
  return String(s || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
function hrefForCategory(cat) {
  if (cat?.full_slug) return "/" + encodeSegments(cat.full_slug);
  if (cat?.slug) return "/" + encodeURIComponent(cat.slug);
  return createPageUrl(`Category?id=${cat.id}`);
}

/** Build the *directory* detail path that works for BOTH lawyers & doctors via Business endpoint */
function directoryPath(item) {
  const slug = encodeURIComponent(item?.slug || "");
  const cat = item?.category_full_slug;
  return cat ? `/business/${encodeSegments(cat)}/${slug}` : `/business/${slug}`;
}

/* ---------------- component ---------------- */
export default function Home() {
  const [featuredListings, setFeaturedListings] = useState([]); // merged lawyers + doctors
  const [categories, setCategories] = useState([]);
  const [recentReviews, setRecentReviews] = useState([]);
  const [stats, setStats] = useState({
    totalBusinesses: 0,   // (lawyers + doctors)
    totalReviews: 0,
    totalCategories: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Discover & Review Businesses, Products, and Services | MightyRankings.com";
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute(
      "content",
      "Find, review, and rank anything on MightyRankings.com. Browse thousands of authentic user reviews for businesses, products, and services to make better, informed decisions."
    );
    loadData();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = createPageUrl(`Search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const loadData = async () => {
    try {
      const [
        biz, docs,
        cats, revs,
        bizCount, docCount, revCount, catCount,
      ] = await Promise.all([
        getFeaturedBusinesses({ limit: 8 }),
        getFeaturedDoctors({ limit: 8 }),
        getTopCategories({ limit: 6 }),
        getRecentReviews({ limit: 6 }),
        countBusinesses({ status: "active" }),
        countDoctors({ status: "active" }),
        countReviews({ status: "active" }),
        countCategories(),
      ]);

      // Merge + sort featured (premium first, then rating, then reviews)
      const merged = [...(biz || []), ...(docs || [])]
        .sort((a, b) =>
          (b.is_premium ? 1 : 0) - (a.is_premium ? 1 : 0) ||
          (b.average_rating || 0) - (a.average_rating || 0) ||
          (b.total_reviews || 0) - (a.total_reviews || 0)
        )
        .slice(0, 8);

      // IMPORTANT: don’t hide categories that only have doctors.
      // If the API ever adds doctor_count, the OR below will keep them too.
      const catsVisible = (cats || []).filter((c) => {
        const bc = Number(c?.business_count || 0);
        const dc = Number(c?.doctor_count || 0); // may be undefined
        return bc > 0 || dc > 0 || (bc === 0 && dc === 0); // show all until backend exposes combined counts
      });

      setFeaturedListings(merged);
      setCategories(catsVisible);
      setRecentReviews(revs || []);
      setStats({
        totalBusinesses: Number(bizCount || 0) + Number(docCount || 0),
        totalReviews: Number(revCount || 0),
        totalCategories: Number(catCount || 0),
      });
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  const renderStars = (rating) => (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star key={i} className={`w-4 h-4 ${i < rating ? "text-yellow-400 fill-current" : "text-gray-300"}`} />
      ))}
    </div>
  );

  const formatNumber = (num) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return String(num);
  };

  const ListingCard = ({ item }) => {
    const url = directoryPath(item);
    const displayName = item.name || item.provider_name || "Listing";
    const categoryText =
      typeof item.category === "string"
        ? item.category
        : item.category?.name || item.category_name || item.specialty || "";
    const rating = Math.round(item.average_rating || 0);
    const reviewCount = item.total_reviews || 0;
    const locationText = [item.city, item.state].filter(Boolean).join(", ");

    return (
      <Link to={url} className="group">
        <Card
          className={`hover:shadow-lg transition-all duration-300 group-hover:scale-105 relative overflow-hidden ${
            item.is_premium ? "border-2 border-yellow-400 premium-glow" : ""
          }`}
        >
          {item.is_premium && (
            <div className="absolute top-2 right-2 z-10">
              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                <Crown className="w-3 h-3 mr-1" />
                Premium
              </Badge>
            </div>
          )}

          <div className="aspect-video bg-gray-100 relative">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={`Image of ${displayName}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building className="w-12 h-12 text-gray-300" />
              </div>
            )}
          </div>

          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors" title={displayName}>
                {displayName}
              </h3>
              <div className="flex items-center gap-1">
                {renderStars(rating)}
                <span className="text-sm text-gray-500 ml-1">({reviewCount})</span>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-2">{categoryText}</p>

            {locationText && (
              <div className="flex items-center text-sm text-gray-500">
                <MapPin className="w-4 h-4 mr-1" />
                {locationText}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="animate-fade-in-up">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-red-600 via-orange-600 to-red-800">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">MightyRankings.com</h1>
          <p className="text-xl md:text-2xl text-red-100 mb-8 max-w-3xl mx-auto">
            Discover, review, and rank any business, product, or service. Browse freely, and sign in to share your own authentic reviews.
          </p>

          {/* Hero Search */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6" />
              <Input
                type="text"
                placeholder="Search for anything to review..."
                className="pl-12 pr-4 py-4 text-lg rounded-full border-0 shadow-lg focus:ring-4 focus:ring-red-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
                Search
              </Button>
            </div>
          </form>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">{formatNumber(stats.totalBusinesses)}</div>
              <div className="text-red-100">Businesses Listed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">{formatNumber(stats.totalReviews)}</div>
              <div className="text-red-100">Reviews Written</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">{stats.totalCategories}</div>
              <div className="text-red-100">Categories</div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Browse Top Categories</h2>
            <p className="text-gray-600 text-lg">Explore reviews and rankings across popular categories.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => {
              const bg = getCategoryBackground(category);
              const href = hrefForCategory(category);
              return (
                <Link key={category.id} to={href} className="group">
                  <Card className="hover:shadow-lg transition-all duration-300 group-hover:scale-105">
                    <CardContent className="p-6 text-center">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                          bg.className ? `bg-gradient-to-r ${bg.className}` : ""
                        }`}
                        style={bg.style}
                      >
                        {renderCategoryIcon(category)}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{category.name}</h3>
                      <p className="text-sm text-gray-500">
                        {category.business_count ?? 0} businesses
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Listings (lawyers + doctors) */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Top-Rated & Featured Businesses</h2>
              <p className="text-gray-600">Discover highly-rated listings reviewed by our community.</p>
            </div>
            <Link to={createPageUrl("Search")}>
              <Button variant="outline" className="hidden md:flex items-center gap-2">
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredListings.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Recent Reviews */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Latest Community Reviews</h2>
            <p className="text-gray-600">See what people are saying right now.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentReviews.map((review) => (
              <Card key={review.id} className="hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    {renderStars(review.rating)}
                    <Badge variant="secondary" className="text-xs">
                      {review.status}
                    </Badge>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-2">{review.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">{review.content}</p>

                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>By {review.created_by}</span>
                    <span>{review.helpful_count} helpful</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Share Your Experience?</h2>
          <p className="text-xl text-blue-100 mb-8">Join thousands of users helping others make better decisions</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={createPageUrl("AddBusiness")}>
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Add a Business
              </Button>
            </Link>
            <Link to={createPageUrl("Search")}>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                Find & Review
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
