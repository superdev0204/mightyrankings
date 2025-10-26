import React, { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { searchDirectory } from "@/api/businesses";
import { listCategories } from "@/api/categories";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Frown, Search as SearchIcon, X as ClearIcon } from "lucide-react";
import Seo from "@/components/common/Seo";

import SearchFilters from "../components/search/SearchFilters";
import SearchResultItem from "../components/search/SearchResultItem";

const DEFAULT_PAGE_SIZE = 20;

/** Convert a doctor result into the "business-like" shape our SearchResultItem expects. */
function doctorToBusinessish(d) {
  if (!d) return null;
  return {
    id: d.id,
    name: d.provider_name || d.name || "Doctor",
    slug: d.slug,
    category: d.category,
    category_id: d.category_id,
    category_name: d.category_name,
    category_full_slug: d.category_full_slug,

    image_url: d.image_url,
    phone: d.phone,
    website: d.website,

    street_address: d.street_address,
    city: d.city,
    state: d.state,
    zip: d.zip,

    average_rating: d.average_rating ?? 0,
    total_reviews: d.total_reviews ?? 0,
    is_premium: d.is_premium ?? false,

    description: d.description,
    // put specialty/practice into practice_areas so existing UI badges still work
    practice_areas: [d.specialty, d.practice_names].filter(Boolean).join("; "),
    _type: "doctor",
  };
}

/** Identity function for business items, but stamp _type for styling hooks. */
function businessToBusinessish(b) {
  return { ...b, _type: "business" };
}

/** Parse a single location string into { city, state }.
 * Accepts:
 *   - "Austin, TX"
 *   - "Austin TX"
 *   - "Austin"
 *   - "TX"
 */
function parseLocation(input) {
  const out = { city: "", state: "" };
  if (!input) return out;

  const raw = String(input).trim();
  if (!raw) return out;

  // Split by comma first: "City, ST"
  const commaParts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length === 2) {
    out.city = commaParts[0];
    out.state = commaParts[1].toUpperCase();
    return out;
  }

  // If no comma, check last token for 2-letter state: "City ST"
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    if (/^[A-Za-z]{2}$/.test(last)) {
      out.state = last.toUpperCase();
      out.city = tokens.slice(0, -1).join(" ");
      return out;
    }
  }

  // If only two letters total -> assume state
  if (/^[A-Za-z]{2}$/.test(raw)) {
    out.state = raw.toUpperCase();
    return out;
  }

  // Otherwise treat as city only
  out.city = raw;
  return out;
}

export default function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);

  // results + paging
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // URL-driven query
  const [searchQuery, setSearchQuery] = useState("");
  const [qInput, setQInput] = useState("");

  // unified filters (server-friendly)
  const [filters, setFilters] = useState({
    category: "all",
    rating: 0,
    is_premium: false,
    location: "", // <-- single location input
  });

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // avoid showing stale responses
  const reqTokenRef = useRef(0);

  // read URL on mount / change
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const query = (urlParams.get("q") || "").trim();
    setSearchQuery(query);
    setQInput(query);
    setPage(1); // reset page when the URL q changes
  }, [location.search]);

  // load categories once
  useEffect(() => {
    listCategories()
      .then((cats) => setCategories(Array.isArray(cats) ? cats : []))
      .catch(() => setCategories([]));
  }, []);

  // selected category object (if any)
  const selectedCategory = useMemo(() => {
    if (filters.category === "all") return null;
    const val = String(filters.category);
    const looksId = /^\d+$/.test(val);
    if (looksId) {
      const id = Number(val);
      return categories.find((c) => Number(c.id) === id) || null;
    }
    // (kept for backwards-compatibility if value were a name)
    const nameLower = val.toLowerCase();
    return (
      categories.find(
        (c) => String(c.name || "").toLowerCase() === nameLower
      ) || null
    );
  }, [filters.category, categories]);

  const minRating = Number(filters.rating || 0);

  const loadPage = async () => {
    const token = ++reqTokenRef.current;
    setLoading(true);
    setItems([]); // avoid flicker from old results

    try {
      // ---------- Unified directory mode ALWAYS ----------
      // Ask server for enough rows to emulate client paging
      const upto = page * pageSize;

      const unifiedParams = {
        limit: upto,
        status: "active",
      };

      // Location parsing: convert single field into city/state for the API
      if (filters.location) {
        const { city, state } = parseLocation(filters.location);
        if (city) unifiedParams.city = city;
        if (state) unifiedParams.state = state;
      }

      if (filters.is_premium) unifiedParams.is_premium = true;

      // If a category is selected, pass both ID and path when available
      if (selectedCategory) {
        unifiedParams.category_id = selectedCategory.id;
        if (selectedCategory.full_slug) {
          unifiedParams.category_path = selectedCategory.full_slug;
        }
      }

      const unified = await searchDirectory(searchQuery, unifiedParams);
      if (reqTokenRef.current !== token) return;

      // shape: [{ type: "lawyer" | "doctor", rank, data }]
      let unifiedItems = Array.isArray(unified) ? unified : [];

      // Client-side safety net for category hierarchy
      if (selectedCategory) {
        const selPath = String(selectedCategory.full_slug || "").toLowerCase();
        unifiedItems = unifiedItems.filter(({ data }) => {
          const itemPath = String(
            data?.category_full_slug ||
              data?.category?.full_slug ||
              ""
          ).toLowerCase();

          if (selPath && itemPath) {
            return itemPath.startsWith(selPath);
          }

          const dataCid = Number(data?.category_id ?? NaN);
          return Number(selectedCategory.id) === dataCid;
        });
      }

      // Map to SearchResultItem shape
      const mapped = unifiedItems.map((row) => {
        if (row?.type === "doctor") return doctorToBusinessish(row.data);
        return businessToBusinessish(row?.data);
      });

      // min-rating filter
      const withRating =
        minRating > 0 ? mapped.filter((m) => Number(m?.average_rating ?? 0) >= minRating) : mapped;

      // emulate paging on the client
      const start = (page - 1) * pageSize;
      const pageSlice = withRating.slice(start, start + pageSize);

      setItems(pageSlice);
      setCount(withRating.length);
    } catch (e) {
      console.error("Search load failed:", e);
      setItems([]);
      setCount(0);
    } finally {
      if (reqTokenRef.current === token) setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, JSON.stringify(filters), page, pageSize, JSON.stringify(selectedCategory)]);

  // submit new query -> write to URL (?q=...)
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(location.search);
    const v = qInput.trim();
    if (v) params.set("q", v);
    else params.delete("q");
    navigate(`/search?${params.toString()}`);
  };

  const handleClear = () => {
    setQInput("");
    const params = new URLSearchParams(location.search);
    params.delete("q");
    navigate(`/search?${params.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const Pager = () => (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6">
      <div className="text-sm text-gray-600">
        {count > 0 ? (
          <>
            Showing{" "}
            <strong>
              {Math.min((page - 1) * pageSize + 1, count)}–{Math.min(page * pageSize, count)}
            </strong>{" "}
            of <strong>{count}</strong> results
          </>
        ) : (
          "No results"
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </Button>
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          const half = 3;
          let start = Math.max(1, page - half);
          let end = Math.min(totalPages, start + 6);
          start = Math.max(1, end - 6);
          const n = start + i;
          if (n > totalPages) return null;
          const active = n === page;
          return (
            <Button
              key={n}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => setPage(n)}
            >
              {n}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </Button>
        <select
          className="ml-2 h-9 rounded-md border px-2 text-sm"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const pageTitle = "Search (Unified)";

  return (
    <div className="bg-gray-50 min-h-screen">
      <Seo
        title={searchQuery ? `Search results for "${searchQuery}"` : pageTitle}
        description={`Find, compare, and review businesses and doctors. Search results for ${searchQuery || "anything you need"}.`}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-fade-in-up">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Search
          </h1>

          <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search across businesses & doctors…"
                className="pl-9"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                  title="Clear"
                >
                  <ClearIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button type="submit">Search</Button>
          </form>

          {searchQuery && (
            <p className="text-lg text-gray-600 mt-2">
              Showing unified results for:{" "}
              <span className="font-semibold text-blue-600">"{searchQuery}"</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
          <div className="lg:col-span-1 animate-fade-in-up">
            <SearchFilters
              categories={categories}
              filters={filters}
              onFilterChange={(f) => {
                setFilters(f);
                setPage(1);
              }}
              resultsCount={count}
            />
          </div>

          <div className="lg:col-span-3">
            {loading ? (
              <div className="space-y-4">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="flex gap-4 p-4 border rounded-lg bg-white">
                      <Skeleton className="w-40 h-32 rounded-md" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    </div>
                  ))}
              </div>
            ) : items.length > 0 ? (
              <>
                <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                  {items.map((bizish) => (
                    <SearchResultItem key={`${bizish._type}-${bizish.id}`} business={bizish} />
                  ))}
                </div>
                <Pager />
              </>
            ) : (
              <div className="text-center py-16 px-6 bg-white rounded-lg border">
                <Frown className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Found</h3>
                <p className="text-gray-500">Try adjusting your search, fields, or filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
