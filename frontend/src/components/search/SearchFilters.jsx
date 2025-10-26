import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Filter, Star, Crown, MapPin } from "lucide-react";

export default function SearchFilters({ categories, filters, onFilterChange, resultsCount }) {
  const handleFilter = (key, value) => {
    onFilterChange((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="sticky top-24">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          <span>Filters</span>
          <span className="ml-auto text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
            {resultsCount} results
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category-filter">Category</Label>
          <Select
            id="category-filter"
            value={filters.category}
            onValueChange={(value) => handleFilter("category", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Location (single field: City, ST) */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2" htmlFor="location">
            <MapPin className="w-4 h-4" />
            Location
          </Label>
          <Input
            id="location"
            placeholder="City, ST  •  e.g., Austin, TX  or  Austin TX  or  TX"
            value={filters.location || ""}
            onChange={(e) => handleFilter("location", e.target.value)}
          />
        </div>

        {/* Rating */}
        <div className="space-y-2">
          <Label htmlFor="rating-filter">Minimum Rating</Label>
          <Select
            id="rating-filter"
            value={String(filters.rating)}
            onValueChange={(value) => handleFilter("rating", Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any Rating</SelectItem>
              <SelectItem value="4">
                <div className="flex items-center gap-1">
                  4 <Star className="w-4 h-4 text-yellow-400 fill-current" /> &nbsp;and up
                </div>
              </SelectItem>
              <SelectItem value="3">
                <div className="flex items-center gap-1">
                  3 <Star className="w-4 h-4 text-yellow-400 fill-current" /> &nbsp;and up
                </div>
              </SelectItem>
              <SelectItem value="2">
                <div className="flex items-center gap-1">
                  2 <Star className="w-4 h-4 text-yellow-400 fill-current" /> &nbsp;and up
                </div>
              </SelectItem>
              <SelectItem value="1">
                <div className="flex items-center gap-1">
                  1 <Star className="w-4 h-4 text-yellow-400 fill-current" /> &nbsp;and up
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Premium */}
        <div className="flex items-center justify-between space-x-2 pt-2">
          <Label htmlFor="premium-filter" className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            <span>Premium Only</span>
          </Label>
          <Switch
            id="premium-filter"
            checked={!!filters.is_premium}
            onCheckedChange={(checked) => handleFilter("is_premium", checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
