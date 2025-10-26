import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCompare } from '@/components/common/CompareProvider';
import { getBusinessesByIds } from '@/api/businesses'; // <- NEW
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { X, Scale, Star } from 'lucide-react';
import { generateBusinessUrl } from "../utils/slugify";

export default function CompareTray() {
  const { compareList, removeFromCompare, clearCompare } = useCompare();
  const [businesses, setBusinesses] = useState([]);

  const getBusinessUrl = (businessObj) => createPageUrl(generateBusinessUrl(businessObj));

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (compareList.length === 0) {
        setBusinesses([]);
        return;
      }
      try {
        // Fetch by ids via DRF helpers; this function preserves best-effort batching
        const fetched = await getBusinessesByIds(compareList);

        // Preserve the order of compareList in the tray
        const ordered = compareList
          .map(id => fetched.find(b => b && b.id === id))
          .filter(Boolean);

        if (isMounted) setBusinesses(ordered);
      } catch (err) {
        console.error("Error fetching businesses for tray", err);
        if (isMounted) setBusinesses([]);
      }
    };

    load();
    return () => { isMounted = false; };
  }, [compareList]);

  if (compareList.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl z-50 mb-4">
      <div className="bg-white rounded-xl shadow-2xl border p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-lg hidden sm:block">Compare List</h3>
          <div className="flex items-center gap-2">
            {businesses.map(business => (
              <div key={business.id} className="relative">
                <Link to={getBusinessUrl(business)} className="w-12 h-12 rounded-full bg-gray-100 border overflow-hidden block">
                  {business.image_url ? (
                    <img src={business.image_url} alt={business.name} className="w-full h-full object-cover"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Star className="w-6 h-6 text-gray-300"/>
                    </div>
                  )}
                </Link>
                <button
                  onClick={() => removeFromCompare(business.id)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                >
                  <X className="w-3 h-3"/>
                </button>
              </div>
            ))}
            <div className="text-gray-400 text-sm">
              {compareList.length}/4
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearCompare}>Clear</Button>
          <Link to={createPageUrl("Compare")}>
            <Button className="bg-red-600 hover:bg-red-700">
              <Scale className="w-4 h-4 mr-2" />
              Compare Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
