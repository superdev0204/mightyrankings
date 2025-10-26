import React, { useState, useEffect, useCallback, createContext, useContext } from "react";

const MAX_COMPARE_ITEMS = 4;
const STORAGE_KEY = 'mightyRankingsCompareList';

const CompareContext = createContext();

export function useCompare() {
  const context = useContext(CompareContext);
  if (context === undefined) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}

export function CompareProvider({ children }) {
  const [compareList, setCompareList] = useState([]);

  useEffect(() => {
    try {
      const items = localStorage.getItem(STORAGE_KEY);
      if (items) {
        setCompareList(JSON.parse(items));
      }
    } catch (error) {
      console.error("Failed to parse compare list from localStorage", error);
      setCompareList([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compareList));
    } catch (error) {
      console.error("Failed to save compare list to localStorage", error);
    }
  }, [compareList]);

  const addToCompare = useCallback((businessId) => {
    setCompareList((prevList) => {
      if (prevList.length >= MAX_COMPARE_ITEMS || prevList.includes(businessId)) {
        return prevList;
      }
      return [...prevList, businessId];
    });
  }, []);

  const removeFromCompare = useCallback((businessId) => {
    setCompareList((prevList) => prevList.filter((id) => id !== businessId));
  }, []);

  const clearCompare = useCallback(() => {
    setCompareList([]);
  }, []);

  const isInCompare = useCallback(
    (businessId) => compareList.includes(businessId),
    [compareList]
  );

  const value = {
    compareList,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isInCompare,
    MAX_COMPARE_ITEMS,
  };

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}