"use client";

import { createContext, useContext, ReactNode } from "react";

interface SearchContextType {
  handleSearch: (query: string) => Promise<void>;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function useSearchContext() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearchContext must be used within a SearchProvider");
  }
  return context;
}

interface SearchProviderProps {
  children: ReactNode;
  handleSearch: (query: string) => Promise<void>;
}

export function SearchProvider({
  children,
  handleSearch,
}: SearchProviderProps) {
  return (
    <SearchContext.Provider value={{ handleSearch }}>
      {children}
    </SearchContext.Provider>
  );
}
